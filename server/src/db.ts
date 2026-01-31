import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { Message } from '@clawchat/shared';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'chat.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL DEFAULT 'default',
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )
`);

export function getMessages(): Message[] {
  return db.prepare('SELECT * FROM messages ORDER BY createdAt ASC').all() as Message[];
}

export function addMessage(message: Message): Message {
  const stmt = db.prepare('INSERT INTO messages (id, conversationId, role, content, createdAt) VALUES (?, ?, ?, ?, ?)');
  stmt.run(message.id, message.conversationId, message.role, message.content, message.createdAt);
  return message;
}
