import express from 'express';
import type { Message } from '@clawchat/shared';

let slaveUrls: string[] = [];
let postMessage: (content: string) => Message;

export const slaveApp = express();
slaveApp.use(express.json());

export function initSlave(urls: string[], deps: { createUserMessage: (content: string) => Message }) {
  slaveUrls = urls;
  postMessage = deps.createUserMessage;
  if (urls.length) console.log(`[Slave] Forwarding to: ${urls.join(', ')}`);
}

// POST /slave/send — Send a message as user.
//   Request body:
//     role     string — must be "user"
//     content  string — message text
//   Response: 204 No Content
slaveApp.post('/slave/send', (req, res) => {
  const { role, content } = req.body;
  if (role !== 'user') {
    res.status(400).json({ error: 'role must be "user"' });
    return;
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content required' });
    return;
  }
  postMessage(content.trim());
  res.status(204).end();
});

/** Called by createMessage — delivers agent messages to all slaves */
export function notifySlaves(message: Message) {
  if (message.role !== 'agent' || message.type !== 'message') return;
  const { conversationId, ...payload } = message;
  const body = JSON.stringify(payload);
  for (const url of slaveUrls) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch((err) => {
      console.log(`[Slave] ${url} unreachable: ${err.message}`);
    });
  }
}
