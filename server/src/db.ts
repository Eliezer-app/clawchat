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
