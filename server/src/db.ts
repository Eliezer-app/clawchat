import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Message, Attachment } from '@clawchat/shared';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'chat.db');
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

// Widget state table
db.exec(`
  CREATE TABLE IF NOT EXISTS widget_state (
    conversationId TEXT NOT NULL,
    widgetId TEXT NOT NULL,
    state TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY (conversationId, widgetId)
  )
`);

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

export interface WidgetState {
  conversationId: string;
  widgetId: string;
  state: unknown;
  version: number;
  updatedAt: string;
}

export function getWidgetState(conversationId: string, widgetId: string): WidgetState | null {
  const row = db.prepare('SELECT * FROM widget_state WHERE conversationId = ? AND widgetId = ?').get(conversationId, widgetId) as {
    conversationId: string;
    widgetId: string;
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

export function setWidgetState(conversationId: string, widgetId: string, state: unknown, version: number = 1): WidgetState {
  const updatedAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO widget_state (conversationId, widgetId, state, version, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(conversationId, widgetId) DO UPDATE SET
      state = excluded.state,
      version = excluded.version,
      updatedAt = excluded.updatedAt
  `);
  stmt.run(conversationId, widgetId, JSON.stringify(state), version, updatedAt);
  return { conversationId, widgetId, state, version, updatedAt };
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
