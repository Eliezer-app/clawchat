import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { getMessages, getMessage, addMessage, deleteMessage, updateMessage, getAppState, setAppState, getSessionByToken, createSession, deleteSession, getInvite, markInviteUsed, createPushSubscription, deletePushSubscription, setSessionVisibility, updateSessionActivity } from './db.js';
import { initPush, getVapidPublicKey, sendPushToAll, isPushEnabled } from './push.js';
import type { Message, Attachment, WidgetError } from '@clawchat/shared';
import { SSEEventType } from '@clawchat/shared';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

const agentPort = requireEnv('AGENT_PORT');
const publicPort = requireEnv('PUBLIC_PORT');
const uploadsDir = requireEnv('UPLOADS_DIR');
const appsDir = requireEnv('APPS_DIR');
const clientDist = requireEnv('CLIENT_DIST');
const agentUrl = requireEnv('AGENT_URL');
const promptListFile = process.env.PROMPT_LIST_FILE; // Optional - path to prompt-list.txt

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
fs.mkdirSync(uploadsDir, { recursive: true });

// Expand widget file references in message content
// Transforms ```widget:path/to/file.html``` to ```widget\n<file contents>```
function expandWidgetFiles(content: string): string {
  return content.replace(/```widget:([^\n`]+)\n?```/g, (_, filePath) => {
    const trimmedPath = filePath.trim();
    if (trimmedPath.includes('..') || !trimmedPath.endsWith('.html')) {
      return '```widget\n<!-- Invalid widget path -->\n```';
    }
    const fullPath = path.join(appsDir, trimmedPath);
    try {
      const html = fs.readFileSync(fullPath, 'utf-8');
      return '```widget\n' + html + '\n```';
    } catch {
      return '```widget\n<!-- Widget file not found: ' + trimmedPath + ' -->\n```';
    }
  });
}

function expandMessage(msg: Message): Message {
  return { ...msg, content: expandWidgetFiles(msg.content) };
}

// Count widgets in message content (max 1 allowed)
function countWidgets(content: string): number {
  const widgetRegex = /```widget(:[^\n`]+)?\n/g;
  return (content.match(widgetRegex) || []).length;
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
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
function createMessage(role: Message['role'], content: string, attachment?: Attachment): Message {
  const message = addMessage({
    id: crypto.randomUUID(),
    conversationId: 'default',
    role,
    content: content.trim(),
    attachment,
    createdAt: new Date().toISOString(),
  });
  broadcast({ type: 'message', message: expandMessage(message) });

  // Send push notification for agent messages
  if (role === 'agent' && isPushEnabled()) {
    const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;
    sendPushToAll({
      title: 'ClawChat',
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

agentApp.post('/send', (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Content required' });
    return;
  }
  if (countWidgets(content) > 1) {
    res.status(400).json({ error: 'Only one widget per message allowed' });
    return;
  }
  // Auto-clear typing indicator when agent sends a message
  broadcast({ type: SSEEventType.AGENT_TYPING, active: false });
  const message = createMessage('agent', content.trim());
  res.json(message);
});

agentApp.post('/typing', (req, res) => {
  const { active } = req.body;
  broadcast({ type: SSEEventType.AGENT_TYPING, active: !!active });
  res.json({ ok: true });
});

agentApp.post('/scroll', (req, res) => {
  const { messageId } = req.body;
  if (!messageId || typeof messageId !== 'string') {
    res.status(400).json({ error: 'messageId required' });
    return;
  }
  broadcast({ type: SSEEventType.SCROLL_TO_MESSAGE, messageId });
  res.json({ ok: true });
});

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
      id: path.basename(file.filename, path.extname(file.filename)),
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
  }

  const message = createMessage('agent', content.trim(), attachment);
  res.json(message);
});

agentApp.delete('/messages/:id', (req, res) => {
  const { id } = req.params;
  const deleted = deleteMessage(id);
  if (!deleted) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }
  broadcast({ type: 'delete', id });
  res.json({ ok: true });
});

agentApp.patch('/messages/:id', (req, res) => {
  const { id } = req.params;
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
  broadcast({ type: 'update', message: expandMessage(message) });
  res.json(message);
});

agentApp.get('/health', (req, res) => {
  res.json({ status: 'ok', api: 'agent' });
});

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

// Serve uploaded files (requires auth, handled below)
// publicApp.use('/api/files', express.static(uploadsDir));

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

// ===================
// Push notification endpoints
// ===================

// Get VAPID public key (public - needed before auth for service worker)
publicApp.get('/api/push/vapid-public-key', (req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: 'Push notifications not configured' });
    return;
  }
  res.json({ publicKey: key });
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
  <title>Join ClawChat</title>
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
    <h1>ClawChat</h1>
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

// Serve uploaded files (now protected)
publicApp.use('/api/files', express.static(uploadsDir));

// Serve frontend static files (protected by auth middleware above)
publicApp.use(express.static(clientDist));

// Standalone widget endpoint - serves widget page by message ID
publicApp.get('/api/widget/:messageId', (req, res) => {
  const { messageId } = req.params;

  const message = getMessage(messageId);
  if (!message) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }

  // Expand widget files
  const expanded = expandMessage(message);

  // Verify message has exactly one widget
  if (countWidgets(expanded.content) !== 1) {
    res.status(400).json({ error: 'Message does not contain exactly one widget' });
    return;
  }

  res.json(expanded);
});

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
  res.json(getMessages().map(expandMessage));
});

publicApp.post('/api/messages', (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Content required' });
    return;
  }
  if (countWidgets(content) > 1) {
    res.status(400).json({ error: 'Only one widget per message allowed' });
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
      id: path.basename(file.filename, path.extname(file.filename)),
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
  }

  const message = createMessage('user', content, attachment);
  notifyAgent('user_message', {
    conversationId: message.conversationId,
    messageId: message.id,
    content: message.content,
    hasAttachment: !!attachment,
  });
  res.json(message);
});

publicApp.delete('/api/messages/:id', (req, res) => {
  const { id } = req.params;
  const message = getMessage(id);
  if (!message) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }
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
}

function getPromptList(): PromptInfo[] {
  if (!promptListFile) return [];
  try {
    const content = fs.readFileSync(promptListFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    return lines.map(line => {
      const filePath = line.trim();
      const name = path.basename(filePath, '.md');
      return { name, path: filePath };
    });
  } catch {
    return [];
  }
}

function resolvePromptPath(promptPath: string): string {
  // If absolute, use as-is; otherwise resolve relative to project root (parent of prompt-list.txt)
  if (path.isAbsolute(promptPath)) {
    return promptPath;
  }
  const projectRoot = path.dirname(promptListFile || '');
  return path.resolve(projectRoot, promptPath);
}

publicApp.get('/api/prompts', (req, res) => {
  const prompts = getPromptList();
  res.json(prompts.map(p => ({ name: p.name })));
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
    const fullPath = resolvePromptPath(prompt.path);
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
    const fullPath = resolvePromptPath(prompt.path);
    fs.writeFileSync(fullPath, content, 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save prompt' });
  }
});

// App state endpoints (widgets are views into app state)
publicApp.get('/api/app-state/:conversationId/:appId', (req, res) => {
  const { conversationId, appId } = req.params;
  const state = getAppState(conversationId, appId);
  if (!state) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(state);
});

publicApp.post('/api/app-state/:conversationId/:appId', (req, res) => {
  const { conversationId, appId } = req.params;
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

  const result = setAppState(conversationId, appId, state, version || 1);

  // Broadcast to other widgets viewing this app
  broadcast({ type: SSEEventType.APP_STATE_UPDATED, conversationId, appId });

  res.json(result);
});

// App action endpoint - extensible by agent
interface AppActionContext {
  conversationId: string;
  appId: string;
  payload: unknown;
}
type AppActionHandler = (ctx: AppActionContext) => Promise<unknown> | unknown;
const appActionHandlers: Map<string, AppActionHandler> = new Map();

export function registerAppAction(action: string, handler: AppActionHandler) {
  appActionHandlers.set(action, handler);
}

// Mock weather data for widget APIs (keyed by lowercase city name)
const mockWeatherData: Record<string, { temp: number; humidity: number; description: string; icon: string }> = {
  // Globe widget capitals
  'washington d.c.': { temp: 14, humidity: 60, description: 'Partly cloudy', icon: '⛅' },
  'london': { temp: 9, humidity: 80, description: 'Rainy', icon: '🌧️' },
  'paris': { temp: 11, humidity: 70, description: 'Overcast', icon: '☁️' },
  'berlin': { temp: 7, humidity: 65, description: 'Cloudy', icon: '☁️' },
  'tokyo': { temp: 18, humidity: 65, description: 'Partly cloudy', icon: '⛅' },
  'canberra': { temp: 22, humidity: 45, description: 'Sunny', icon: '☀️' },
  'brasilia': { temp: 26, humidity: 70, description: 'Warm', icon: '🌤️' },
  'new delhi': { temp: 30, humidity: 55, description: 'Hot', icon: '🔥' },
  'beijing': { temp: 8, humidity: 50, description: 'Hazy', icon: '🌫️' },
  'moscow': { temp: -5, humidity: 75, description: 'Snow', icon: '❄️' },
  'ottawa': { temp: -2, humidity: 70, description: 'Cold', icon: '❄️' },
  'mexico city': { temp: 20, humidity: 50, description: 'Pleasant', icon: '🌤️' },
  'rome': { temp: 16, humidity: 60, description: 'Mild', icon: '🌤️' },
  'madrid': { temp: 18, humidity: 40, description: 'Clear', icon: '☀️' },
  'cairo': { temp: 25, humidity: 35, description: 'Dry', icon: '☀️' },
  'pretoria': { temp: 24, humidity: 50, description: 'Warm', icon: '🌤️' },
  'buenos aires': { temp: 22, humidity: 65, description: 'Mild', icon: '🌤️' },
  'seoul': { temp: 10, humidity: 55, description: 'Cool', icon: '🌤️' },
  'ankara': { temp: 12, humidity: 45, description: 'Dry', icon: '☀️' },
  'stockholm': { temp: 3, humidity: 75, description: 'Cold', icon: '❄️' },
};

registerAppAction('getWeather', ({ payload }) => {
  const { city } = payload as { city?: string };
  if (!city) {
    return { error: 'City required' };
  }
  const key = city.toLowerCase().trim();
  const data = mockWeatherData[key];
  if (data) {
    return { city, ...data };
  }
  // Return random weather for unknown cities
  const temps = [5, 10, 15, 20, 25, 30];
  const conditions = [
    { description: 'Clear', icon: '☀️' },
    { description: 'Cloudy', icon: '☁️' },
    { description: 'Rainy', icon: '🌧️' },
    { description: 'Windy', icon: '💨' },
  ];
  const temp = temps[Math.floor(Math.random() * temps.length)];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];
  return {
    city,
    temp,
    humidity: 50 + Math.floor(Math.random() * 30),
    ...condition,
  };
});

publicApp.post('/api/app-action/:conversationId/:appId', async (req, res) => {
  const { conversationId, appId } = req.params;
  const { action, payload } = req.body;

  if (!action || typeof action !== 'string') {
    res.status(400).json({ ok: false, error: 'Action required' });
    return;
  }

  const handler = appActionHandlers.get(action);
  if (handler) {
    try {
      const result = await handler({ conversationId, appId, payload });
      res.json({ ok: true, result });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  } else {
    // No local handler - notify agent and ack
    notifyAgent('app_action', { conversationId, appId, action, payload });
    res.json({ ok: true });
  }
});

// Widget error endpoint - receives errors from widgets and broadcasts to agent
publicApp.post('/api/widget-error/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const { error, stack, timestamp, appId } = req.body;

  if (!error || typeof error !== 'string') {
    res.status(400).json({ ok: false, error: 'Error message required' });
    return;
  }

  const widgetError: WidgetError = {
    conversationId,
    appId,
    error,
    stack,
    timestamp: timestamp || new Date().toISOString(),
  };

  // Broadcast to SSE clients
  broadcast({ type: SSEEventType.WIDGET_ERROR, ...widgetError });

  // Notify agent
  notifyAgent('widget_error', widgetError);

  // Log for server-side visibility
  console.error('[Widget Error]', conversationId, appId || 'unknown', error);

  res.json({ ok: true });
});

// SPA catch-all - serve index.html for client-side routing
publicApp.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ===================
// Start servers
// ===================

// Initialize push notifications
initPush();

const agentHost = process.env.AGENT_HOST || '127.0.0.1';
agentApp.listen(Number(agentPort), agentHost, () => {
  console.log(`Agent API running on ${agentHost}:${agentPort}`);
});

const publicHost = requireEnv('PUBLIC_HOST');
publicApp.listen(Number(publicPort), publicHost, () => {
  console.log(`Public API running on ${publicHost}:${publicPort}`);
});
