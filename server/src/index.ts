import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { getMessages, getMessage, addMessage, deleteMessage, updateMessage, getAppState, setAppState, getSessionByToken, createSession, deleteSession, getInvite, markInviteUsed, createPushSubscription, deletePushSubscription, setSessionVisibility, updateSessionActivity } from './db.js';
import { initPush, getVapidPublicKey, sendPushToAll } from './push.js';
import type { Message, Attachment } from '@clawchat/shared';
import { SSEEventType } from '@clawchat/shared';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

const agentPort = requireEnv('AGENT_PORT');
const publicPort = requireEnv('PUBLIC_PORT');
const appsDir = requireEnv('APPS_DIR');
const clientDist = requireEnv('CLIENT_DIST');
const agentUrl = requireEnv('AGENT_URL');
const promptsDir = requireEnv('PROMPTS_DIR');
const chatPublicDir = requireEnv('CHAT_PUBLIC_DIR');
const appName = requireEnv('APP_NAME');

// ===================
// Agent Notification
// ===================
interface AgentEvent {
  source: 'chat';
  type: string;
  payload: unknown;
  timestamp: string;
}

function notifyAgent(type: string, payload: unknown): void {

  const event: AgentEvent = {
    source: 'chat',
    type,
    payload,
    timestamp: new Date().toISOString(),
  };

  fetch(`${agentUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
    .then(async (res) => {
      if (res.ok) {
        broadcast({ type: SSEEventType.AGENT_STATUS, connected: true });
      } else {
        let error = `HTTP ${res.status}`;
        try {
          const json = await res.json();
          if (json.error) error = json.error;
        } catch {}
        broadcast({ type: SSEEventType.AGENT_STATUS, connected: false, error });
        broadcast({ type: SSEEventType.AGENT_TYPING, active: false });
      }
    })
    .catch((err) => {
      broadcast({ type: SSEEventType.AGENT_STATUS, connected: false, error: err.message });
      broadcast({ type: SSEEventType.AGENT_TYPING, active: false });
    });
}

// Ensure data directories exist
if (chatPublicDir) fs.mkdirSync(chatPublicDir, { recursive: true });

// Configure multer for file uploads — saves to chat-public with original filenames
function resolveFilename(dir: string, original: string): string {
  const ext = path.extname(original);
  const base = path.basename(original, ext);
  let name = original;
  let n = 2;
  while (fs.existsSync(path.join(dir, name))) {
    name = `${base}(${n})${ext}`;
    n++;
  }
  return name;
}

const storage = multer.diskStorage({
  destination: chatPublicDir,
  filename: (req, file, cb) => {
    cb(null, resolveFilename(chatPublicDir, file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// Shared state
const sseClients: Set<express.Response> = new Set();

function broadcast(data: object) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => client.write(payload));
}

// SSE heartbeat
setInterval(() => {
  sseClients.forEach(client => client.write(': heartbeat\n\n'));
}, 30000);

// Helper to create and broadcast a message
function createMessage(role: Message['role'], content: string, opts?: { conversationId?: string; attachment?: Attachment; type?: Message['type']; name?: string }): Message {
  const message = addMessage({
    id: crypto.randomUUID(),
    conversationId: opts?.conversationId || 'default',
    role,
    type: opts?.type || 'message',
    content: content.trim(),
    name: opts?.name,
    attachment: opts?.attachment,
    createdAt: new Date().toISOString(),
  });
  broadcast({ type: 'message', message });

  // Send push notification for regular agent messages only
  if (role === 'agent' && (opts?.type || 'message') === 'message') {
    const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;
    sendPushToAll({
      title: appName,
      body: preview,
      tag: 'clawchat-message',
      data: { messageId: message.id },
    }).catch((err) => console.error('[Push] Error sending notifications:', err));
  }

  return message;
}

// ===================
// Agent API (localhost only)
// ===================
const agentApp = express();
agentApp.use(express.json());

	// POST /send — Send a message to chat.
	//   Request body:
	//     conversationId  string  — target conversation (e.g. "default")
	//     content         string  — message content (text or JSON for typed messages)
	//     type            string? — message type: "thought", "tool_call", "tool_result" (omit for regular message)
	//     name            string? — tool name (for tool_call/tool_result)
	//   Response:
	//     messageId       string  — assigned message ID
agentApp.post('/send', (req, res) => {
  const { conversationId, content, type, name } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Content required' });
    return;
  }
  // Auto-clear typing indicator when agent sends a final message
  if (!type || type === 'message') {
    broadcast({ type: SSEEventType.AGENT_TYPING, active: false });
  }
  const message = createMessage('agent', content.trim(), { conversationId, type, name });
  res.json({ messageId: message.id });
});

	// POST /typing — Set typing indicator.
	//   Request body:
	//     active  boolean — true to show, false to hide
	//   Response: { ok: true }
agentApp.post('/typing', (req, res) => {
  const { active } = req.body;
  broadcast({ type: SSEEventType.AGENT_TYPING, active: !!active });
  res.json({ ok: true });
});

	// POST /scroll — Scroll chat to a message.
	//   Request body:
	//     messageId  string — message ID to scroll to
	//   Response: { ok: true }
agentApp.post('/scroll', (req, res) => {
  const { messageId } = req.body;
  if (!messageId || typeof messageId !== 'string') {
    res.status(400).json({ error: 'messageId required' });
    return;
  }
  broadcast({ type: SSEEventType.SCROLL_TO_MESSAGE, messageId });
  res.json({ ok: true });
});

	// POST /upload — Send a message with file attachment (multipart/form-data).
	//   Form fields:
	//     file    file   — file to attach (optional)
	//     content string — message text (optional, one of file/content required)
	//   Response: { id, conversationId, role, content, attachment?, createdAt }
agentApp.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  const content = (req.body.content as string) || '';

  if (!file && !content.trim()) {
    res.status(400).json({ error: 'File or content required' });
    return;
  }

  let attachment: Attachment | undefined;
  if (file) {
    attachment = {
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
    };
  }

  const message = createMessage('agent', content.trim(), { attachment });
  res.json(message);
});

	// DELETE /messages/:id — Delete a message.
	//   Response: { ok: true } or 404
agentApp.delete('/messages/:id', (req, res) => {
  const { id } = req.params;
  const deleted = deleteMessage(id);
  if (!deleted) { res.status(404).json({ error: 'Message not found' }); return; }
  broadcast({ type: 'delete', id });
  res.json({ ok: true });
});

	// PATCH /messages/:id — Update a message's content.
	//   Request body:
	//     content  string — new message text
	//   Response: { id, conversationId, role, content, createdAt } or 404
agentApp.patch('/messages/:id', (req, res) => {
  const { id } = req.params;
  const existing = getMessage(id);
  if (!existing) { res.status(404).json({ error: 'Message not found' }); return; }
  if (existing.type !== 'message') { res.status(400).json({ error: 'Cannot edit internal messages' }); return; }
  const { content } = req.body;
  if (content === undefined || typeof content !== 'string') {
    res.status(400).json({ error: 'Content required' });
    return;
  }
  const message = updateMessage(id, content.trim());
  if (!message) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }
  broadcast({ type: 'update', message });
  res.json(message);
});

	// GET /health — Health check.
	//   status  string — "ok"
	//   api     string — "agent"
agentApp.get('/health', (req, res) => {
  res.json({ status: 'ok', api: 'agent' });
});

	// GET /messages?search= — List all messages, optionally filtered.
	//   Message[] — id, conversationId, role, content, annotations, createdAt
agentApp.get('/messages', (req, res) => {
  const search = req.query.search as string | undefined;
  let messages = getMessages();
  if (search) {
    const term = search.toLowerCase();
    messages = messages.filter(m => m.content.toLowerCase().includes(term));
  }
  res.json(messages);
});

// ===================
// Public API (authenticated)
// ===================
const publicApp = express();
publicApp.use(express.json());
publicApp.use(cookieParser());

// Serve frontend static files

// Auth check helper
function isAuthenticated(req: Request): boolean {
  const token = req.cookies?.session;
  if (!token) return false;
  const session = getSessionByToken(token);
  return session !== null;
}

// Auth middleware - skip for specific routes
// NOTE: /api/events (SSE) intentionally requires auth - contains sensitive data
const publicPaths = ['/api/auth/invite', '/api/health', '/invite'];

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip auth for public paths
  if (publicPaths.some(p => req.path.startsWith(p))) {
    return next();
  }
  
  // Check session cookie
  if (isAuthenticated(req)) {
    return next();
  }
  
  // For API requests, return 401
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  // For page requests, redirect to invite page
  res.redirect('/invite');
}

// ===================
// Auth endpoints (before middleware)
// ===================

// Invite verification - creates session
publicApp.get('/api/auth/invite', (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).json({ error: 'Token required' });
    return;
  }
  
  const invite = getInvite(token);
  if (!invite) {
    res.status(404).json({ error: 'Invalid invite' });
    return;
  }
  
  if (invite.used) {
    res.status(410).json({ error: 'Invite already used' });
    return;
  }
  
  if (new Date(invite.expiresAt) < new Date()) {
    res.status(410).json({ error: 'Invite expired' });
    return;
  }
  
  // Mark invite as used and create session
  markInviteUsed(token);
  const session = createSession(); // No expiry for device sessions
  
  // Set httpOnly cookie
  res.cookie('session', session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
  });
  
  // Redirect to app
  res.redirect('/');
});

// Check auth status
publicApp.get('/api/auth/me', (req, res) => {
  if (isAuthenticated(req)) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

// Logout
publicApp.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.session;
  if (token) {
    deleteSession(token);
  }
  res.clearCookie('session');
  res.json({ ok: true });
});

// Health check (public)
publicApp.get('/api/health', (req, res) => {
  res.json({ status: 'ok', api: 'public' });
});

// Agent info proxy (forward to agent's /info/* endpoints)
for (const endpoint of ['health', 'state', 'memory']) {
  publicApp.get(`/api/agent/${endpoint}`, async (req, res) => {
    try {
      const r = await fetch(`${agentUrl}/info/${endpoint}`, { signal: AbortSignal.timeout(3000) });
      const data = await r.json();
      res.status(r.status).json(data);
    } catch {
      res.status(502).json({ error: 'Agent unreachable' });
    }
  });
}

// Cron proxy
publicApp.get('/api/agent/cron', async (req, res) => {
  try {
    const r = await fetch(`${agentUrl}/cron`, { signal: AbortSignal.timeout(3000) });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch {
    res.status(502).json({ error: 'Agent unreachable' });
  }
});

publicApp.put('/api/agent/cron/:name/enabled', async (req, res) => {
  try {
    const r = await fetch(`${agentUrl}/cron/${encodeURIComponent(req.params.name)}/enabled`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(3000),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch {
    res.status(502).json({ error: 'Agent unreachable' });
  }
});

// ===================
// Push notification endpoints
// ===================

// Get VAPID public key (public - needed before auth for service worker)
publicApp.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

// Subscribe to push notifications (requires auth)
publicApp.post('/api/push/subscribe', (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: 'Invalid subscription' });
    return;
  }

  const sessionToken = req.cookies?.session;
  const session = getSessionByToken(sessionToken);
  if (!session) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  createPushSubscription(session.id, endpoint, keys.p256dh, keys.auth);
  res.json({ ok: true });
});

// Unsubscribe from push notifications (requires auth)
publicApp.delete('/api/push/subscribe', (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { endpoint } = req.body;
  if (!endpoint) {
    res.status(400).json({ error: 'Endpoint required' });
    return;
  }

  deletePushSubscription(endpoint);
  res.json({ ok: true });
});

// Visibility tracking - client reports when tab is visible/hidden
// Used to suppress push notifications when user is viewing chat
publicApp.post('/api/visibility', (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { visible } = req.body;
  if (typeof visible !== 'boolean') {
    res.status(400).json({ error: 'visible (boolean) required' });
    return;
  }

  const sessionToken = req.cookies?.session;
  const session = getSessionByToken(sessionToken);
  if (!session) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  setSessionVisibility(session.id, visible);
  updateSessionActivity(session.id);
  res.json({ ok: true });
});

// Invite landing page (public)
publicApp.get('/invite', (req, res) => {
  // Check if already authenticated
  if (isAuthenticated(req)) {
    return res.redirect('/');
  }
  
  // Check if this is an invite link
  const token = req.query.token as string;
  if (token) {
    // Verify and redirect via API
    return res.redirect(`/api/auth/invite?token=${encodeURIComponent(token)}`);
  }
  
  // Show "scan to join" page with token form
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Join ${appName}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
    .container { text-align: center; padding: 2rem; max-width: 400px; }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    p { color: #888; margin-bottom: 1.5rem; }
    form { display: flex; flex-direction: column; gap: 0.75rem; }
    input { padding: 0.75rem; border: 1px solid #333; border-radius: 6px; background: #1a1a1a; color: #fff; font-size: 1rem; }
    input:focus { outline: none; border-color: #667eea; }
    button { padding: 0.75rem; border: none; border-radius: 6px; background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; font-size: 1rem; cursor: pointer; }
    button:hover { opacity: 0.9; }
    .hint { font-size: 0.75rem; color: #666; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${appName}</h1>
    <p>This chat is invite-only.<br>Enter your invite token below.</p>
    <form action="/invite" method="get">
      <input type="text" name="token" placeholder="Invite token" required autofocus />
      <button type="submit">Join</button>
    </form>
    <p class="hint">Ask the admin for an invite token or scan a QR code.</p>
  </div>
</body>
</html>`);
});

// Apply auth middleware for remaining routes
publicApp.use(authMiddleware);

// Serve shared files (uploads + agent-provided assets)
if (chatPublicDir) publicApp.use('/chat-public', express.static(chatPublicDir));

// Widget static file serving: /widget/<app>/* → apps/<app>/public/*
const widgetStatic = express.static(appsDir, { fallthrough: true });
publicApp.use('/widget/:app', (req: Request, res: Response, next: NextFunction) => {
  const { app } = req.params;
  if (!/^[\w-]+$/.test(app)) return next();
  const saved = req.url;
  req.url = `/${app}/public${saved}`;
  widgetStatic(req, res, () => {
    req.url = saved;
    next();
  });
});

// Serve manifest with configured app name
publicApp.get('/manifest.json', (req, res) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(clientDist, 'manifest.json'), 'utf-8'));
  manifest.name = appName;
  manifest.short_name = appName;
  res.json(manifest);
});

// Serve frontend static files (protected by auth middleware above)
publicApp.use(express.static(clientDist));

publicApp.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));

  // Send initial agent status to this client
  if (agentUrl) {
    fetch(`${agentUrl}/info/health`, { signal: AbortSignal.timeout(2000) })
      .then((r) => {
        res.write(`data: ${JSON.stringify({ type: SSEEventType.AGENT_STATUS, connected: r.ok })}\n\n`);
      })
      .catch(() => {
        res.write(`data: ${JSON.stringify({ type: SSEEventType.AGENT_STATUS, connected: false, error: 'Agent unreachable' })}\n\n`);
      });
  }
});

publicApp.get('/api/messages', (req, res) => {
  res.json(getMessages());
});

publicApp.post('/api/messages', (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Content required' });
    return;
  }
  const message = createMessage('user', content.trim());
  notifyAgent('user_message', {
    conversationId: message.conversationId,
    messageId: message.id,
    content: message.content,
  });
  res.json(message);
});

// File upload endpoint
publicApp.post('/api/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  const content = (req.body.content as string) || '';

  if (!file && !content.trim()) {
    res.status(400).json({ error: 'File or content required' });
    return;
  }

  let attachment: Attachment | undefined;
  if (file) {
    attachment = {
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
    };
  }

  const message = createMessage('user', content, { attachment });
  notifyAgent('user_message', {
    conversationId: message.conversationId,
    messageId: message.id,
    content: message.content,
    attachment: attachment ? { ...attachment, path: path.join(chatPublicDir, attachment.filename) } : undefined,
  });
  res.json(message);
});

publicApp.post('/api/stop', async (req, res) => {
  try {
    const r = await fetch(`${agentUrl}/stop`, { method: 'POST', signal: AbortSignal.timeout(5000) });
    res.status(r.status).json(await r.json().catch(() => ({})));
  } catch {
    res.status(502).json({ error: 'Agent unreachable' });
  }
});

publicApp.delete('/api/messages/:id', (req, res) => {
  const { id } = req.params;
  const message = getMessage(id);
  if (!message) { res.status(404).json({ error: 'Message not found' }); return; }
  deleteMessage(id);
  broadcast({ type: 'delete', id });
  notifyAgent('message_deleted', {
    conversationId: message.conversationId,
    messageId: id,
  });
  res.json({ ok: true });
});

// ===================
// Prompts endpoints
// ===================

interface PromptInfo {
  name: string;
  path: string;
  description?: string;
}

function getPromptList(): PromptInfo[] {
  if (!promptsDir) return [];
  try {
    return fs.readdirSync(promptsDir)
      .filter(f => f.endsWith('.md') && !f.endsWith('.description.md'))
      .sort((a, b) => {
        const order = ['system.md', 'user.md', 'memory.md'];
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      })
      .map(f => {
        const name = path.basename(f, '.md');
        const descPath = path.join(promptsDir, `${name}.description.txt`);
        let description: string | undefined;
        try { description = fs.readFileSync(descPath, 'utf-8').trim(); } catch {}
        return { name, path: path.join(promptsDir, f), description };
      });
  } catch {
    return [];
  }
}

publicApp.get('/api/prompts', (req, res) => {
  const prompts = getPromptList();
  res.json(prompts.map(p => ({ name: p.name, description: p.description })));
});

publicApp.get('/api/prompts/:name', (req, res) => {
  const { name } = req.params;
  const prompts = getPromptList();
  const prompt = prompts.find(p => p.name === name);

  if (!prompt) {
    res.status(404).json({ error: 'Prompt not found' });
    return;
  }

  try {
    const fullPath = prompt.path;
    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ name: prompt.name, content });
  } catch {
    res.status(404).json({ error: 'Prompt file not found' });
  }
});

publicApp.put('/api/prompts/:name', (req, res) => {
  const { name } = req.params;
  const { content } = req.body;

  if (typeof content !== 'string') {
    res.status(400).json({ error: 'Content required' });
    return;
  }

  const prompts = getPromptList();
  const prompt = prompts.find(p => p.name === name);

  if (!prompt) {
    res.status(404).json({ error: 'Prompt not found' });
    return;
  }

  try {
    const fullPath = prompt.path;
    fs.writeFileSync(fullPath, content, 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save prompt' });
  }
});

// App state endpoints (widgets are views into app state)
publicApp.get('/api/app-state/:appId', (req, res) => {
  const { appId } = req.params;
  const state = getAppState(appId);
  if (!state) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(state);
});

publicApp.post('/api/app-state/:appId', (req, res) => {
  const { appId } = req.params;
  const { state, version } = req.body;

  // Validate state is present and not too large (1MB limit)
  if (state === undefined) {
    res.status(400).json({ error: 'State required' });
    return;
  }
  const stateStr = JSON.stringify(state);
  if (stateStr.length > 1024 * 1024) {
    res.status(400).json({ error: 'State too large (max 1MB)' });
    return;
  }

  const result = setAppState(appId, state, version || 1);

  // Broadcast to other widgets viewing this app
  broadcast({ type: SSEEventType.APP_STATE_UPDATED, appId });

  res.json(result);
});


// Widget log endpoint - receives logs from widgets and writes to disk
publicApp.post('/api/widget-log', (req, res) => {
  const { widgetPath, line, data } = req.body;

  if (!widgetPath || typeof widgetPath !== 'string') {
    res.status(400).json({ ok: false, error: 'widgetPath required' });
    return;
  }

  // Sanitize: no .. traversal, only alphanumeric/dash/underscore/slash
  if (widgetPath.includes('..') || !/^[\w\-/]+$/.test(widgetPath)) {
    res.status(400).json({ ok: false, error: 'Invalid widgetPath' });
    return;
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toTimeString().slice(0, 8); // HH:MM:SS
  const lineStr = line ? ` L${line}` : '';
  const logLine = `${time}${lineStr} ${data}\n`;

  const logDir = path.join(appsDir, widgetPath, 'logs');
  const logFile = path.join(logDir, `${day}.log`);

  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, logLine);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Widget Log] Write failed:', err);
    res.status(500).json({ ok: false, error: 'Failed to write log' });
  }
});

// ===================
// Load app server-side handlers
// ===================

async function loadAppHandlers() {
  const { build } = await import('esbuild');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(appsDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const handlerPath = path.join(appsDir, entry.name, 'index.mts');
    if (!fs.existsSync(handlerPath)) continue;

    try {
      const result = await build({
        entryPoints: [handlerPath],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      });
      const tmpFile = path.join(appsDir, entry.name, '.handler.mjs');
      fs.writeFileSync(tmpFile, result.outputFiles![0].text);
      const handler = await import(tmpFile);
      const router = express.Router();
      handler.default(router);
      publicApp.use(`/widget/${entry.name}/api`, router);
      console.log(`[Widget] Loaded handler: ${entry.name}`);
    } catch (err) {
      console.error(`[Widget] Failed to load handler for ${entry.name}:`, err);
    }
  }
}

// SPA catch-all - serve index.html with app name injected
const indexHtml = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf-8')
  .replace(/<title>[^<]*<\/title>/, `<title>${appName}</title>`)
  .replace('</head>', `<script>window.__APP_NAME__=${JSON.stringify(appName)}</script></head>`);

publicApp.get('*', (req, res) => {
  res.type('html').send(indexHtml);
});

// ===================
// Start servers
// ===================

async function start() {
  // Initialize push notifications
  initPush(requireEnv);

  // Load widget app handlers before starting servers
  await loadAppHandlers();

  const agentHost = requireEnv('AGENT_HOST');
  agentApp.listen(Number(agentPort), agentHost, () => {
    console.log(`Agent API running on ${agentHost}:${agentPort}`);
  });

  const publicHost = requireEnv('PUBLIC_HOST');
  publicApp.listen(Number(publicPort), publicHost, () => {
    console.log(`Public API running on ${publicHost}:${publicPort}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
