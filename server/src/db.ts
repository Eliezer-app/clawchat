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
