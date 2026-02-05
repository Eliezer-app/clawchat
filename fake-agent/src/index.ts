import express from 'express';

const app = express();
app.use(express.json());

const CHAT_URL = process.env.FAKE_AGENT_CHAT_URL || 'http://127.0.0.1:3100';

app.post('/events', async (req, res) => {
  const { source, type, payload } = req.body;
  console.log(`[Agent] Event: ${source}/${type}`);

  res.json({ ok: true });

  if (source === 'chat' && type === 'user_message') {
    // Set typing indicator
    console.log(`[Agent] Calling ${CHAT_URL}/typing`);
    const typingRes = await fetch(`${CHAT_URL}/typing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true }),
    });
    console.log(`[Agent] Typing response: ${typingRes.status}`);

    // Wait 3 seconds
    await new Promise(r => setTimeout(r, 3000));

    // Echo the message back
    console.log(`[Agent] Calling ${CHAT_URL}/send`);
    const sendRes = await fetch(`${CHAT_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `Echo: ${payload.content}` }),
    });
    console.log(`[Agent] Send response: ${sendRes.status}`);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.FAKE_AGENT_PORT || 3200;
app.listen(port, () => {
  console.log(`Echo agent running on port ${port}`);
});
