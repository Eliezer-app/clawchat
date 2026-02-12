import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import 'express-async-errors';
import express from 'express';

const app = express();
app.use(express.json());

const CHAT_URL = process.env.FAKE_AGENT_CHAT_URL || 'http://127.0.0.1:3100';

let abortController: AbortController | null = null;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
  });
}

app.post('/events', async (req, res) => {
  const { source, type, payload } = req.body;
  console.log(`[Agent] Event: ${source}/${type}`);

  if (source === 'chat' && type === 'user_message') {
    abortController?.abort();
    abortController = new AbortController();
    const { signal } = abortController;

    // Set typing indicator
    await fetch(`${CHAT_URL}/typing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true }),
    });

    // Crash if message is "crash"
    if (payload.content === 'crash') {
      console.log('[Agent] Crashing in 1s...');
      await sleep(1000, signal);
      throw new Error('Agent crashed on purpose');
    }

    try {
      await sleep(3000, signal);

      // Echo the message back
      console.log(`[Agent] Calling ${CHAT_URL}/send`);
      await fetch(`${CHAT_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `Echo: ${payload.content}` }),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('[Agent] Aborted');
        await fetch(`${CHAT_URL}/typing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: false }),
        });
        return res.json({ ok: true });
      }
      throw err;
    }
  }

  res.json({ ok: true });
});

app.post('/stop', (req, res) => {
  console.log('[Agent] Stop requested');
  abortController?.abort();
  abortController = null;
  res.json({ ok: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/info/health', (req, res) => {
  res.json({ status: 'ok' });
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
