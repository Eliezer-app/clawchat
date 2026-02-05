import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { getMessages, addMessage, deleteMessage, updateMessage, getAppState, setAppState, getSessionByToken, createSession, deleteSession, getInvite, markInviteUsed, createPushSubscription, deletePushSubscription } from './db.js';
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
const agentUrl = process.env.AGENT_URL; // Optional - agent may not be running

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
  if (!agentUrl) return;

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
  return content.replace(/```widget:([^\n]+)\n?```/g, (_, filePath) => {
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
  // Auto-clear typing indicator when agent sends a message
  broadcast({ type: SSEEventType.AGENT_TYPING, active: false });
  const message = createMessage('agent', content);
  res.json(message);
});

agentApp.post('/typing', (req, res) => {
  const { active } = req.body;
  broadcast({ type: SSEEventType.AGENT_TYPING, active: !!active });
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

  const message = createMessage('agent', content, attachment);
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
  const message = updateMessage(id, content);
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
  
  // Show "scan to join" page
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Join ClawChat</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
    .container { text-align: center; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    p { color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔒 ClawChat</h1>
    <p>Scan an invite QR code to join.</p>
    <p style="margin-top: 2rem; font-size: 0.875rem;">Run <code>pnpm agent-invite</code> on the server to generate one.</p>
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

publicApp.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));

  // Send initial agent status to this client
  if (agentUrl) {
    fetch(`${agentUrl}/health`, { signal: AbortSignal.timeout(2000) })
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
  const message = createMessage('user', content);
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
  const deleted = deleteMessage(id);
  if (!deleted) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }
  broadcast({ type: 'delete', id });
  notifyAgent('message_deleted', {
    conversationId: 'default', // TODO: get from message before delete
    messageId: id,
  });
  res.json({ ok: true });
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

agentApp.listen(Number(agentPort), '127.0.0.1', () => {
  console.log(`Agent API running on 127.0.0.1:${agentPort}`);
});

const publicHost = requireEnv('PUBLIC_HOST');
publicApp.listen(Number(publicPort), publicHost, () => {
  console.log(`Public API running on ${publicHost}:${publicPort}`);
});
