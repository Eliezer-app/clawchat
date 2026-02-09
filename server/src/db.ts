import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Message, Attachment, MessageType } from '@clawchat/shared';

let _db: Database.Database | undefined;

function db(): Database.Database {
  if (!_db) {
    const dbPath = process.env.DB_PATH;
    if (!dbPath) throw new Error('DB_PATH environment variable is required');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    _db = new Database(dbPath);
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
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

  try { db.exec(`ALTER TABLE messages ADD COLUMN attachment TEXT`); } catch {}

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

  try { db.exec(`ALTER TABLE widget_state RENAME TO app_state`); } catch {}
  try { db.exec(`ALTER TABLE app_state RENAME COLUMN widgetStateId TO appId`); } catch {}
  try { db.exec(`ALTER TABLE app_state RENAME COLUMN widgetId TO appId`); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      createdAt TEXT NOT NULL,
      expiresAt TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS invites (
      token TEXT PRIMARY KEY,
      expiresAt TEXT NOT NULL,
      used INTEGER DEFAULT 0
    )
  `);

  try { db.exec(`ALTER TABLE sessions ADD COLUMN lastActiveAt TEXT`); } catch {}
  try { db.exec(`ALTER TABLE sessions ADD COLUMN isVisible INTEGER DEFAULT 0`); } catch {}

  try { db.exec(`ALTER TABLE messages ADD COLUMN annotations TEXT`); } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN type TEXT NOT NULL DEFAULT 'message'`); } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN name TEXT`); } catch {}

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
}

interface DbMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'agent';
  type: MessageType;
  content: string;
  name: string | null;
  attachment: string | null;
  createdAt: string;
}

function parseDbMessage(row: DbMessage): Message {
  return {
    ...row,
    name: row.name ?? undefined,
    attachment: row.attachment ? JSON.parse(row.attachment) as Attachment : undefined,
  };
}

export function getMessages(): Message[] {
  const rows = db().prepare('SELECT * FROM messages ORDER BY createdAt ASC').all() as DbMessage[];
  return rows.map(parseDbMessage);
}

export function getMessage(id: string): Message | null {
  const row = db().prepare('SELECT * FROM messages WHERE id = ?').get(id) as DbMessage | undefined;
  if (!row) return null;
  return parseDbMessage(row);
}

export function addMessage(message: Message): Message {
  const stmt = db().prepare('INSERT INTO messages (id, conversationId, role, type, content, name, attachment, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  stmt.run(
    message.id,
    message.conversationId,
    message.role,
    message.type,
    message.content,
    message.name ?? null,
    message.attachment ? JSON.stringify(message.attachment) : null,
    message.createdAt
  );
  return message;
}

export function deleteMessage(id: string): boolean {
  const result = db().prepare('DELETE FROM messages WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateMessage(id: string, content: string): Message | null {
  const stmt = db().prepare('UPDATE messages SET content = ? WHERE id = ?');
  const result = stmt.run(content, id);
  if (result.changes === 0) return null;
  const row = db().prepare('SELECT * FROM messages WHERE id = ?').get(id) as DbMessage | undefined;
  if (!row) return null;
  return parseDbMessage(row);
}

export interface AppState {
  appId: string;
  state: unknown;
  version: number;
  updatedAt: string;
}

export function getAppState(appId: string): AppState | null {
  const row = db().prepare('SELECT * FROM app_state WHERE conversationId = ? AND appId = ?').get('default', appId) as {
    appId: string;
    state: string;
    version: number;
    updatedAt: string;
  } | undefined;
  if (!row) return null;
  return {
    appId: row.appId,
    state: JSON.parse(row.state),
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export function setAppState(appId: string, state: unknown, version: number = 1): AppState {
  const updatedAt = new Date().toISOString();
  const stmt = db().prepare(`
    INSERT INTO app_state (conversationId, appId, state, version, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(conversationId, appId) DO UPDATE SET
      state = excluded.state,
      version = excluded.version,
      updatedAt = excluded.updatedAt
  `);
  stmt.run('default', appId, JSON.stringify(state), version, updatedAt);
  return { appId, state, version, updatedAt };
}

// ===================
// Session Management
// ===================

export interface Session {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  lastActiveAt: string | null;
  isVisible: boolean;
}

export function createSession(expiresInMs?: number): Session {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = expiresInMs ? new Date(Date.now() + expiresInMs).toISOString() : null;

  db().prepare('INSERT INTO sessions (id, token, createdAt, expiresAt) VALUES (?, ?, ?, ?)').run(id, token, createdAt, expiresAt);
  return { id, token, createdAt, expiresAt, lastActiveAt: null, isVisible: false };
}

interface DbSession {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  lastActiveAt: string | null;
  isVisible: number | null;
}

export function getSessionByToken(token: string): Session | null {
  const row = db().prepare('SELECT * FROM sessions WHERE token = ?').get(token) as DbSession | undefined;
  if (!row) return null;
  // Check expiry
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
    db().prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    return null;
  }
  return { ...row, isVisible: row.isVisible === 1 };
}

export function deleteSession(token: string): boolean {
  const result = db().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  return result.changes > 0;
}

export function updateSessionActivity(sessionId: string): void {
  const now = new Date().toISOString();
  db().prepare('UPDATE sessions SET lastActiveAt = ? WHERE id = ?').run(now, sessionId);
}

export function setSessionVisibility(sessionId: string, isVisible: boolean): void {
  db().prepare('UPDATE sessions SET isVisible = ? WHERE id = ?').run(isVisible ? 1 : 0, sessionId);
}

const STALE_SESSION_MS = 5 * 60 * 1000; // 5 minutes

export function getVisibleSessionIds(): string[] {
  // Only return sessions that are both visible AND recently active
  // This handles orphaned sessions where pagehide failed to fire
  const cutoff = new Date(Date.now() - STALE_SESSION_MS).toISOString();
  const rows = db().prepare('SELECT id FROM sessions WHERE isVisible = 1 AND lastActiveAt > ?').all(cutoff) as { id: string }[];
  return rows.map(r => r.id);
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
  
  db().prepare('INSERT INTO invites (token, expiresAt, used) VALUES (?, ?, 0)').run(token, expiresAt);
  return { token, expiresAt, used: false };
}

export function getInvite(token: string): Invite | null {
  const row = db().prepare('SELECT * FROM invites WHERE token = ?').get(token) as { token: string; expiresAt: string; used: number } | undefined;
  if (!row) return null;
  return { token: row.token, expiresAt: row.expiresAt, used: row.used === 1 };
}

export function markInviteUsed(token: string): boolean {
  const result = db().prepare('UPDATE invites SET used = 1 WHERE token = ? AND used = 0').run(token);
  return result.changes > 0;
}

export function cleanExpiredInvites(): number {
  const result = db().prepare('DELETE FROM invites WHERE expiresAt < ?').run(new Date().toISOString());
  return result.changes;
}

// ===================
// Push Subscriptions
// ===================

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
  db().prepare(`
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
  return db().prepare('SELECT * FROM push_subscriptions').all() as PushSubscription[];
}

export function deletePushSubscription(endpoint: string): boolean {
  const result = db().prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  return result.changes > 0;
}
