import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import 'express-async-errors';
import express from 'express';

const app = express();
app.use(express.json());

const CHAT_URL = process.env.FAKE_AGENT_CHAT_URL || 'http://127.0.0.1:3100';

let abortController: AbortController | null = null;
let agentState = 'idle';

function setState(state: string) {
  agentState = state;
  fetch(`${CHAT_URL}/state-changed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  }).catch(() => {});
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
  });
}

async function processMessage(content: string, signal: AbortSignal) {
  const states = content === 'compact'
    ? ['compaction', 'inference', 'tool_execution', 'inference']
    : ['inference', 'tool_execution', 'inference'];

  for (const s of states) {
    setState(s);
    await sleep(1500, signal);
  }

  await fetch(`${CHAT_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `Echo: ${content}` }),
  });
  setState('idle');
}

app.post('/events', (req, res) => {
  const { source, type, payload } = req.body;
  console.log(`[Agent] Event: ${source}/${type}`);
  res.json({ ok: true });

  if (source === 'chat' && type === 'user_message') {
    abortController?.abort();
    abortController = new AbortController();
    processMessage(payload.content, abortController.signal).catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('[Agent] Aborted');
        setState('idle');
      } else {
        console.error('[Agent] Error:', err);
        setState('idle');
      }
    });
  }
});

app.post('/stop', (req, res) => {
  console.log('[Agent] Stop requested');
  abortController?.abort();
  abortController = null;
  setState('idle');
  res.json({ ok: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/info/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/info/state', (req, res) => {
  res.json({ state: agentState });
});

// Error handler - return JSON instead of HTML
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Agent] Error:', err.message);
  res.status(500).json({ error: err.message });
});

const port = process.env.FAKE_AGENT_PORT || 3200;
app.listen(port, () => {
  console.log(`Echo agent running on port ${port}`);
});
