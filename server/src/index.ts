import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  getMessages, addMessage, deleteMessage, updateMessage,
  getWidgetState, setWidgetState,
  getInvite, markInviteUsed, createSession, getSessionByToken, deleteSession,
  addPushSubscription, deletePushSubscription, getPushSubscriptions,
  cleanupExpiredSessions, cleanupExpiredInvites,
} from './db.js';
import type { Message, Attachment } from '@clawchat/shared';

const agentPort = process.env.AGENT_PORT || 3100;
const publicPort = process.env.PUBLIC_PORT || 3101;
const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'data', 'uploads');
const SESSION_COOKIE = 'clawchat_session';

// Ensure uploads directory exists
fs.mkdirSync(uploadsDir, { recursive: true });

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

// Cleanup expired sessions/invites periodically
setInterval(() => {
  cleanupExpiredSessions();
  cleanupExpiredInvites();
}, 60 * 60 * 1000); // Every hour

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
  broadcast({ type: 'message', message });
  return message;
}

// ===================
// Agent API (localhost only, no auth)
// ===================
const agentApp = express();
agentApp.use(express.json());

agentApp.post('/send', (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Content required' });
    return;
  }
  const message = createMessage('agent', content);
  res.json(message);
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
  broadcast({ type: 'update', message });
  res.json(message);
});

agentApp.get('/health', (req, res) => {
  res.json({ status: 'ok', api: 'agent' });
});

// ===================
// Public API (with auth)
// ===================
const publicApp = express();
publicApp.use(express.json());
publicApp.use(cookieParser());

// Serve uploaded files (protected by auth middleware below)
publicApp.use('/api/files', express.static(uploadsDir));

// ===================
// Auth middleware
// ===================
declare global {
  namespace Express {
    interface Request {
      session?: { id: string; token: string };
    }
  }
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const session = getSessionByToken(token);
  if (!session) {
    res.clearCookie(SESSION_COOKIE);
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  req.session = { id: session.id, token: session.token };
  next();
}

// ===================
// Auth routes (no auth required)
// ===================

// Verify invite and create session
publicApp.get('/api/auth/invite', (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Invite token required' });
    return;
  }

  const invite = getInvite(token);
  if (!invite) {
    res.status(404).json({ error: 'Invalid invite' });
    return;
  }
  if (invite.used) {
    res.status(400).json({ error: 'Invite already used' });
    return;
  }
  if (new Date(invite.expiresAt) < new Date()) {
    res.status(400).json({ error: 'Invite expired' });
    return;
  }

  // Mark invite as used and create session
  markInviteUsed(token);
  const session = createSession();

  // Set httpOnly cookie
  res.cookie(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  // Redirect to app root
  res.redirect('/');
});

// Check auth status
publicApp.get('/api/auth/me', (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ authenticated: false });
    return;
  }
  const session = getSessionByToken(token);
  if (!session) {
    res.clearCookie(SESSION_COOKIE);
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, sessionId: session.id });
});

// Logout
publicApp.post('/api/auth/logout', (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    deleteSession(token);
    res.clearCookie(SESSION_COOKIE);
  }
  res.json({ ok: true });
});

// Health check (no auth)
publicApp.get('/api/health', (req, res) => {
  res.json({ status: 'ok', api: 'public' });
});

// ===================
// Protected routes (auth required)
// ===================

publicApp.get('/api/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

publicApp.get('/api/messages', requireAuth, (req, res) => {
  res.json(getMessages());
});

publicApp.post('/api/messages', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Content required' });
    return;
  }
  const message = createMessage('user', content);
  res.json(message);
});

// File upload endpoint
publicApp.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
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
  res.json(message);
});

publicApp.delete('/api/messages/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const deleted = deleteMessage(id);
  if (!deleted) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }
  broadcast({ type: 'delete', id });
  res.json({ ok: true });
});

// Widget state endpoints
publicApp.get('/api/widget-state/:conversationId/:widgetId', requireAuth, (req, res) => {
  const { conversationId, widgetId } = req.params;
  const state = getWidgetState(conversationId, widgetId);
  if (!state) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(state);
});

publicApp.post('/api/widget-state/:conversationId/:widgetId', requireAuth, (req, res) => {
  const { conversationId, widgetId } = req.params;
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

  const result = setWidgetState(conversationId, widgetId, state, version || 1);
  res.json(result);
});

// Widget action endpoint - extensible by agent
interface WidgetActionContext {
  conversationId: string;
  widgetId: string;
  payload: unknown;
}
type WidgetActionHandler = (ctx: WidgetActionContext) => Promise<unknown> | unknown;
const widgetActionHandlers: Map<string, WidgetActionHandler> = new Map();

export function registerWidgetAction(action: string, handler: WidgetActionHandler) {
  widgetActionHandlers.set(action, handler);
}

publicApp.post('/api/widget-action/:conversationId/:widgetId', requireAuth, async (req, res) => {
  const { conversationId, widgetId } = req.params;
  const { action, payload } = req.body;

  if (!action || typeof action !== 'string') {
    res.status(400).json({ ok: false, error: 'Action required' });
    return;
  }

  const handler = widgetActionHandlers.get(action);
  if (handler) {
    try {
      const result = await handler({ conversationId, widgetId, payload });
      res.json({ ok: true, result });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  } else {
    // Default: echo back for testing
    res.json({ ok: true, echo: { conversationId, widgetId, action, payload } });
  }
});

// Push subscription endpoints
publicApp.post('/api/push/subscribe', requireAuth, (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: 'Invalid subscription' });
    return;
  }
  const subscription = addPushSubscription(req.session!.id, endpoint, keys.p256dh, keys.auth);
  res.json({ ok: true, id: subscription.id });
});

publicApp.delete('/api/push/subscribe', requireAuth, (req, res) => {
  deletePushSubscription(req.session!.id);
  res.json({ ok: true });
});

// ===================
// Start servers
// ===================
agentApp.listen(Number(agentPort), '127.0.0.1', () => {
  console.log(`Agent API running on 127.0.0.1:${agentPort}`);
});

const publicHost = process.env.PUBLIC_HOST || '127.0.0.1';
publicApp.listen(Number(publicPort), publicHost, () => {
  console.log(`Public API running on ${publicHost}:${publicPort}`);
});
