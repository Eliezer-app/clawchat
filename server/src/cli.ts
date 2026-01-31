#!/usr/bin/env tsx

const AGENT_URL = process.env.AGENT_URL || 'http://127.0.0.1:3100';

async function sendMessage(content: string) {
  const res = await fetch(`${AGENT_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

const content = process.argv.slice(2).join(' ');
if (!content) {
  console.error('Usage: agent-send <message>');
  process.exit(1);
}

sendMessage(content)
  .then(msg => console.log(`Sent: ${msg.id}`))
  .catch(err => {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  });
