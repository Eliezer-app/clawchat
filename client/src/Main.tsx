import { createSignal, onMount, For, createEffect, Show, Switch, Match, JSX } from 'solid-js';
import { SSEEventType, WidgetApi } from '@clawchat/shared';
import type { Message } from '@clawchat/shared';
import CodeBlock from './components/CodeBlock';
import Widget from './components/Widget';
import MessageBubble from './components/MessageBubble';
import InputArea from './components/InputArea';
import Lightbox from './components/Lightbox';
import SettingsModal, { useShouldPromptNotifications } from './components/SettingsModal';
import { AuthChecking, AuthLocked } from './components/AuthScreens';
import Toast from './components/Toast';
import { useActivityTracking } from './hooks/useActivityTracking';
import './Main.css';

export default function Main() {
  const [authState, setAuthState] = createSignal<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [lightbox, setLightbox] = createSignal<{ src: string; filename: string } | null>(null);
  const [showSettings, setShowSettings] = createSignal(false);
  const [agentConnected, setAgentConnected] = createSignal(true);
  const [agentTyping, setAgentTyping] = createSignal(false);
  const [toast, setToast] = createSignal<string | null>(null);
  const { shouldPrompt: shouldPromptNotifications, dismiss: dismissNotificationPrompt } = useShouldPromptNotifications();

  // Track user activity for push notification suppression
  useActivityTracking();

  let messagesContainer: HTMLDivElement | undefined;

  const openLightbox = (src: string, filename: string) => {
    setLightbox({ src, filename });
    history.pushState({ lightbox: true }, '');
  };

  const closeLightbox = () => {
    if (lightbox()) {
      setLightbox(null);
    }
  };

  // Auto-scroll to bottom when new messages arrive or typing indicator shows
  createEffect(() => {
    messages();
    agentTyping();
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  onMount(async () => {
    // Check authentication
    try {
      const authRes = await fetch('/api/auth/me');
      if (authRes.ok) {
        const data = await authRes.json();
        if (data.authenticated) {
          setAuthState('authenticated');
        } else {
          setAuthState('unauthenticated');
          return;
        }
      } else {
        setAuthState('unauthenticated');
        return;
      }
    } catch {
      setAuthState('unauthenticated');
      return;
    }

    // Handle Android back button
    window.addEventListener('popstate', () => closeLightbox());

    // Scroll to bottom on focus/visibility
    const scrollToBottom = () => {
      const container = document.querySelector('.messages');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    };
    window.addEventListener('focus', scrollToBottom);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') scrollToBottom();
    });

    // Load messages
    try {
      const res = await fetch('/api/messages');
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (e) {
      console.error('Failed to load messages:', e);
    }

    // SSE connection
    function connectSSE() {
      const events = new EventSource(WidgetApi.events);
      events.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          switch (data.type) {
            case SSEEventType.MESSAGE:
              setMessages(msgs => [...msgs, data.message]);
              break;
            case SSEEventType.DELETE:
              setMessages(msgs => msgs.filter(m => m.id !== data.id));
              break;
            case SSEEventType.UPDATE:
              setMessages(msgs => msgs.map(m => m.id === data.message.id ? data.message : m));
              break;
            case SSEEventType.APP_STATE_UPDATED:
              window.dispatchEvent(new CustomEvent('appStateUpdated', {
                detail: { conversationId: data.conversationId, appId: data.appId }
              }));
              break;
            case SSEEventType.AGENT_STATUS:
              const wasConnected = agentConnected();
              setAgentConnected(data.connected);
              // Show toast on state change, or on new error while already disconnected
              if (data.connected && !wasConnected) {
                setToast('Agent connected');
                setTimeout(() => setToast(null), 4000);
              } else if (!data.connected && (wasConnected || data.error)) {
                setToast(`Agent offline: ${data.error || 'Connection failed'}`);
                setTimeout(() => setToast(null), 4000);
              }
              break;
            case SSEEventType.AGENT_TYPING:
              setAgentTyping(data.active);
              break;
            case SSEEventType.SCROLL_TO_MESSAGE:
              document.getElementById(`msg-${data.messageId}`)?.scrollIntoView({ behavior: 'instant', block: 'center' });
              break;
          }
        } catch (err) {
          console.error('SSE parse error:', err);
        }
      };
      events.onerror = () => {
        events.close();
        setTimeout(connectSSE, 3000);
      };
    }
    connectSSE();
  });

  const handleSend = async (content: string, file: File | null) => {
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('content', content);
      await fetch('/api/upload', { method: 'POST', body: formData });
    } else {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    }
  };

  const deleteMsg = async (id: string) => {
    if (!confirm('Delete this message?')) return;
    await fetch(`/api/messages/${id}`, { method: 'DELETE' });
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthState('unauthenticated');
    setShowSettings(false);
  };

  const linkify = (text: string): JSX.Element[] => {
    const urlRegex = /(https?:\/\/[^\s<>\"')\]]+[^\s<>\"')\].,;:!?])/g;
    const parts = text.split(urlRegex);
    return parts.map((part) =>
      urlRegex.test(part)
        ? <a href={part} target="_blank" rel="noopener noreferrer" class="message-link">{part}</a>
        : <span>{part}</span>
    ) as JSX.Element[];
  };

  const renderContent = (text: string, conversationId: string): JSX.Element[] => {
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
    const parts: (string | { lang: string; code: string })[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const lang = match[1] || '';
      const code = match[2]?.trim() || '';
      parts.push({ lang, code });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.map((part) =>
      typeof part === 'string'
        ? linkify(part)
        : part.lang === 'widget'
          ? <Widget code={part.code} conversationId={conversationId} />
          : <CodeBlock lang={part.lang} code={part.code} />
    ) as JSX.Element[];
  };

  return (
    <Switch>
      <Match when={authState() === 'checking'}>
        <AuthChecking />
      </Match>

      <Match when={authState() === 'unauthenticated'}>
        <AuthLocked />
      </Match>

      <Match when={authState() === 'authenticated'}>
        <>
          <div class="app">
            <header class={`header ${agentConnected() ? '' : 'agent-offline'}`}>
              <span class="header-title">ClawChat</span>
              <button class="settings-btn" onClick={() => setShowSettings(true)} title="Settings">⚙</button>
            </header>

            <Show when={showSettings() || shouldPromptNotifications()}>
              <SettingsModal
                onClose={() => {
                  setShowSettings(false);
                  dismissNotificationPrompt();
                }}
                onLogout={logout}
                initialTab="notifications"
              />
            </Show>

            <div class="messages" ref={messagesContainer}>
              {messages().length === 0 ? (
                <div class="empty">No messages yet</div>
              ) : (
                <For each={messages()}>
                  {(msg) => (
                    <MessageBubble
                      message={msg}
                      onDelete={deleteMsg}
                      onImageClick={openLightbox}
                      renderContent={renderContent}
                    />
                  )}
                </For>
              )}
              <Show when={agentTyping()}>
                <div class="message agent">
                  <div class="bubble typing-indicator">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                  </div>
                </div>
              </Show>
            </div>

            <InputArea onSend={handleSend} />
          </div>

          <Show when={lightbox()}>
            {(lb) => (
              <Lightbox
                src={lb().src}
                filename={lb().filename}
                onClose={() => history.back()}
              />
            )}
          </Show>

          <Toast message={toast()} type={agentConnected() ? 'success' : 'error'} />
        </>
      </Match>
    </Switch>
  );
}
