import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Message, Attachment } from '@clawchat/shared';

const dbPath = process.env.DB_PATH;
if (!dbPath) throw new Error('DB_PATH environment variable is required');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

// Migration: add attachment column if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL DEFAULT 'default',
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    attachment TEXT,
    createdAt TEXT NOT NULL
  )
`);

// Add attachment column to existing tables (migration)
try {
  db.exec(`ALTER TABLE messages ADD COLUMN attachment TEXT`);
} catch {
  // Column already exists
}

// App state table (widgets are views into app state)
db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    conversationId TEXT NOT NULL,
    appId TEXT NOT NULL,
    state TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY (conversationId, appId)
  )
`);

// Migration: rename old tables/columns
try {
  db.exec(`ALTER TABLE widget_state RENAME TO app_state`);
} catch {
  // Table already renamed or doesn't exist
}
try {
  db.exec(`ALTER TABLE app_state RENAME COLUMN widgetStateId TO appId`);
} catch {
  // Column already renamed or doesn't exist
}
try {
  db.exec(`ALTER TABLE app_state RENAME COLUMN widgetId TO appId`);
} catch {
  // Column already renamed or doesn't exist
}

// Session table for authenticated devices
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    createdAt TEXT NOT NULL,
    expiresAt TEXT
  )
`);

// Invite table for QR code auth
db.exec(`
  CREATE TABLE IF NOT EXISTS invites (
    token TEXT PRIMARY KEY,
    expiresAt TEXT NOT NULL,
    used INTEGER DEFAULT 0
  )
`);

interface DbMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'agent';
  content: string;
  attachment: string | null;
  createdAt: string;
}

export function getMessages(): Message[] {
  const rows = db.prepare('SELECT * FROM messages ORDER BY createdAt ASC').all() as DbMessage[];
  return rows.map(row => ({
    ...row,
    attachment: row.attachment ? JSON.parse(row.attachment) as Attachment : undefined,
  }));
}

export function addMessage(message: Message): Message {
  const stmt = db.prepare('INSERT INTO messages (id, conversationId, role, content, attachment, createdAt) VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run(
    message.id,
    message.conversationId,
    message.role,
    message.content,
    message.attachment ? JSON.stringify(message.attachment) : null,
    message.createdAt
  );
  return message;
}

export function deleteMessage(id: string): boolean {
  const result = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateMessage(id: string, content: string): Message | null {
  const stmt = db.prepare('UPDATE messages SET content = ? WHERE id = ?');
  const result = stmt.run(content, id);
  if (result.changes === 0) return null;
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as DbMessage | undefined;
  if (!row) return null;
  return {
    ...row,
    attachment: row.attachment ? JSON.parse(row.attachment) as Attachment : undefined,
  };
}

export interface AppState {
  conversationId: string;
  appId: string;
  state: unknown;
  version: number;
  updatedAt: string;
}

export function getAppState(conversationId: string, appId: string): AppState | null {
  const row = db.prepare('SELECT * FROM app_state WHERE conversationId = ? AND appId = ?').get(conversationId, appId) as {
    conversationId: string;
    appId: string;
    state: string;
    version: number;
    updatedAt: string;
  } | undefined;
  if (!row) return null;
  return {
    ...row,
    state: JSON.parse(row.state),
  };
}

export function setAppState(conversationId: string, appId: string, state: unknown, version: number = 1): AppState {
  const updatedAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO app_state (conversationId, appId, state, version, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(conversationId, appId) DO UPDATE SET
      state = excluded.state,
      version = excluded.version,
      updatedAt = excluded.updatedAt
  `);
  stmt.run(conversationId, appId, JSON.stringify(state), version, updatedAt);
  return { conversationId, appId, state, version, updatedAt };
}

// ===================
// Session Management
// ===================

export interface Session {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
}

export function createSession(expiresInMs?: number): Session {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = expiresInMs ? new Date(Date.now() + expiresInMs).toISOString() : null;
  
  db.prepare('INSERT INTO sessions (id, token, createdAt, expiresAt) VALUES (?, ?, ?, ?)').run(id, token, createdAt, expiresAt);
  return { id, token, createdAt, expiresAt };
}

export function getSessionByToken(token: string): Session | null {
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as Session | undefined;
  if (!row) return null;
  // Check expiry
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    return null;
  }
  return row;
}

export function deleteSession(token: string): boolean {
  const result = db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  return result.changes > 0;
}

// ===================
// Invite Management
// ===================

export interface Invite {
  token: string;
  expiresAt: string;
  used: boolean;
}

export function createInvite(expiresInMs: number = 5 * 60 * 1000): Invite {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresInMs).toISOString();
  
  db.prepare('INSERT INTO invites (token, expiresAt, used) VALUES (?, ?, 0)').run(token, expiresAt);
  return { token, expiresAt, used: false };
}

export function getInvite(token: string): Invite | null {
  const row = db.prepare('SELECT * FROM invites WHERE token = ?').get(token) as { token: string; expiresAt: string; used: number } | undefined;
  if (!row) return null;
  return { token: row.token, expiresAt: row.expiresAt, used: row.used === 1 };
}

export function markInviteUsed(token: string): boolean {
  const result = db.prepare('UPDATE invites SET used = 1 WHERE token = ? AND used = 0').run(token);
  return result.changes > 0;
}

export function cleanExpiredInvites(): number {
  const result = db.prepare('DELETE FROM invites WHERE expiresAt < ?').run(new Date().toISOString());
  return result.changes;
}

// ===================
// Push Subscriptions
// ===================

db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )
`);

export interface PushSubscription {
  id: string;
  sessionId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
}

export function createPushSubscription(sessionId: string, endpoint: string, p256dh: string, auth: string): PushSubscription {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  // Upsert - if endpoint exists, update it
  db.prepare(`
    INSERT INTO push_subscriptions (id, sessionId, endpoint, p256dh, auth, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      sessionId = excluded.sessionId,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      createdAt = excluded.createdAt
  `).run(id, sessionId, endpoint, p256dh, auth, createdAt);

  return { id, sessionId, endpoint, p256dh, auth, createdAt };
}

export function getAllPushSubscriptions(): PushSubscription[] {
  return db.prepare('SELECT * FROM push_subscriptions').all() as PushSubscription[];
}

export function deletePushSubscription(endpoint: string): boolean {
  const result = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  return result.changes > 0;
}
