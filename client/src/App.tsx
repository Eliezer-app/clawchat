import { createSignal, onMount, For, createEffect } from 'solid-js';
import type { Message } from '@clawchat/shared';

export default function App() {
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [input, setInput] = createSignal('');
  let messagesContainer: HTMLDivElement | undefined;

  // Auto-scroll to bottom when new messages arrive
  createEffect(() => {
    messages();
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  onMount(async () => {
    try {
      const res = await fetch('/api/messages');
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (e) {
      console.error('Failed to load messages:', e);
    }

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

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <style>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html, body, #root {
          height: 100%;
          overflow: hidden;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: #f5f5f5;
          color: #1a1a1a;
          -webkit-font-smoothing: antialiased;
        }

        .app {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-width: 768px;
          margin: 0 auto;
          background: #fff;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }

        .header {
          padding: 16px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-weight: 600;
          font-size: 18px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .header::before {
          content: '';
          width: 10px;
          height: 10px;
          background: #4ade80;
          border-radius: 50%;
          box-shadow: 0 0 6px #4ade80;
        }

        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: #fafafa;
        }

        .message {
          display: flex;
          flex-direction: column;
          max-width: 85%;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .message.user {
          align-self: flex-end;
          align-items: flex-end;
        }

        .message.agent {
          align-self: flex-start;
          align-items: flex-start;
        }

        .bubble {
          padding: 10px 14px;
          border-radius: 18px;
          font-size: 15px;
          line-height: 1.4;
          word-wrap: break-word;
        }

        .message.user .bubble {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .message.agent .bubble {
          background: #fff;
          color: #1a1a1a;
          border: 1px solid #e5e5e5;
          border-bottom-left-radius: 4px;
        }

        .time {
          font-size: 11px;
          color: #999;
          margin-top: 4px;
          padding: 0 4px;
        }

        .input-area {
          padding: 12px 16px;
          background: #fff;
          border-top: 1px solid #eee;
          display: flex;
          gap: 10px;
          flex-shrink: 0;
        }

        .input-area input {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid #e0e0e0;
          border-radius: 24px;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-area input:focus {
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .input-area button {
          padding: 12px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 24px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.2s;
        }

        .input-area button:active {
          transform: scale(0.96);
        }

        .input-area button:hover {
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          font-size: 15px;
        }

        @media (max-width: 768px) {
          .app {
            max-width: 100%;
            box-shadow: none;
          }
        }

        @media (prefers-color-scheme: dark) {
          body {
            background: #1a1a1a;
            color: #fff;
          }
          .app {
            background: #242424;
          }
          .messages {
            background: #1a1a1a;
          }
          .message.agent .bubble {
            background: #333;
            color: #fff;
            border-color: #444;
          }
          .input-area {
            background: #242424;
            border-top-color: #333;
          }
          .input-area input {
            background: #333;
            border-color: #444;
            color: #fff;
          }
          .input-area input::placeholder {
            color: #888;
          }
          .time {
            color: #666;
          }
        }
      `}</style>

      <div class="app">
        <header class="header">ClawChat</header>

        <div class="messages" ref={messagesContainer}>
          {messages().length === 0 ? (
            <div class="empty">No messages yet</div>
          ) : (
            <For each={messages()}>
              {(msg) => (
                <div class={`message ${msg.role}`}>
                  <div class="bubble">{msg.content}</div>
                  <span class="time">{formatTime(msg.createdAt)}</span>
                </div>
              )}
            </For>
          )}
        </div>

        <div class="input-area">
          <input
            type="text"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type a message..."
          />
          <button onClick={() => send()}>Send</button>
        </div>
      </div>
    </>
  );
}
