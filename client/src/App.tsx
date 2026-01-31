import { createSignal, onMount, For } from 'solid-js';
import type { Message } from '@clawchat/shared';

export default function App() {
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [input, setInput] = createSignal('');

  onMount(async () => {
    // Load existing messages
    try {
      const res = await fetch('/api/messages');
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (e) {
      console.error('Failed to load messages:', e);
    }

    // Subscribe to new messages with auto-reconnect
    function connectSSE() {
      const events = new EventSource('/api/events');
      events.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'message') {
          setMessages(msgs => [...msgs, data.message]);
        }
      };
      events.onerror = () => {
        events.close();
        setTimeout(connectSSE, 3000);
      };
    }
    connectSSE();
  });

  const send = async () => {
    const content = input().trim();
    if (!content) return;
    setInput('');
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  };

  return (
    <main style={{
      "max-width": "600px",
      margin: "0 auto",
      padding: "1rem",
      "font-family": "system-ui, sans-serif"
    }}>
      <h1>ClawChat</h1>

      <div style={{
        border: "1px solid #ccc",
        "border-radius": "8px",
        height: "400px",
        "overflow-y": "auto",
        padding: "1rem",
        "margin-bottom": "1rem"
      }}>
        <For each={messages()}>
          {(msg) => (
            <div style={{
              "margin-bottom": "0.5rem",
              "text-align": msg.role === 'user' ? 'right' : 'left'
            }}>
              <span style={{
                display: "inline-block",
                padding: "0.5rem 1rem",
                "border-radius": "1rem",
                background: msg.role === 'user' ? '#007bff' : '#e9ecef',
                color: msg.role === 'user' ? 'white' : 'black'
              }}>
                {msg.content}
              </span>
            </div>
          )}
        </For>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: "0.5rem",
            "border-radius": "4px",
            border: "1px solid #ccc"
          }}
        />
        <button onClick={() => send()} style={{ padding: "0.5rem 1rem" }}>
          Send
        </button>
      </div>
    </main>
  );
}
