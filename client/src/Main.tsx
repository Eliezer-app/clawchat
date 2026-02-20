import { createSignal, onMount, For, createEffect, Show, Switch, Match, JSX } from 'solid-js';
import { SSEEventType } from '@clawchat/shared';
import type { Message } from '@clawchat/shared';
import { marked } from 'marked';
import CodeBlock from './components/CodeBlock';
import Widget from './components/Widget';
import MessageBubble from './components/MessageBubble';
import InputArea from './components/InputArea';
import Lightbox from './components/Lightbox';
import SettingsModal, { useShouldPromptNotifications } from './components/SettingsModal';
import { AuthChecking, AuthLocked } from './components/AuthScreens';
import Toast from './components/Toast';
import { useActivityTracking } from './hooks/useActivityTracking';
import { initScrollTracking, scrollToBottom } from './scrollAnchor';
import './Main.css';

marked.use({ breaks: true, gfm: true });

export default function Main() {
  const [authState, setAuthState] = createSignal<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [lightbox, setLightbox] = createSignal<{ src: string; filename: string } | null>(null);
  const [showSettings, setShowSettings] = createSignal(false);
  const [agentConnected, setAgentConnected] = createSignal(true);
  const [agentState, setAgentState] = createSignal<string>('idle');
  const agentBusy = () => agentState() !== 'idle';
  const stateLabels: Record<string, string> = {
    inference: 'Thinking…',
    tool_execution: 'Running tool…',
    compaction: 'Compacting…',
  };
  const stateLabel = () => stateLabels[agentState()] || 'Working…';
  const [toast, setToast] = createSignal<string | null>(null);
  const { shouldPrompt: shouldPromptNotifications, dismiss: dismissNotificationPrompt } = useShouldPromptNotifications();
  const [hasMore, setHasMore] = createSignal(false);
  const [loadingOlder, setLoadingOlder] = createSignal(false);

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
  // `ready` stays false during initial load so we can respect URL hash anchors
  let ready = false;
  createEffect(() => {
    messages();
    agentBusy();
    if (ready) scrollToBottom();
  });

  let sse: EventSource | null = null;

  function connectSSE() {
    sse?.close();
    const events = new EventSource('/api/events');
    sse = events;
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
          case SSEEventType.APP_STATE_UPDATED: {
            const ch = new BroadcastChannel(`app:${data.appId}`);
            ch.postMessage({ type: 'stateUpdated', appId: data.appId });
            ch.close();
            break;
          }
          case SSEEventType.AGENT_STATUS:
            const wasConnected = agentConnected();
            setAgentConnected(data.connected);
            if (data.connected && !wasConnected) {
              setToast('Agent connected');
              setTimeout(() => setToast(null), 4000);
            } else if (!data.connected && (wasConnected || data.error)) {
              setToast(`Agent offline: ${data.error || 'Connection failed'}`);
              setTimeout(() => setToast(null), 4000);
            }
            break;
          case SSEEventType.AGENT_STATE:
            setAgentState(data.state || 'idle');
            break;
          case SSEEventType.SCROLL_TO_MESSAGE: {
            const el = document.getElementById(`msg-${data.messageId}`);
            if (el) {
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
            } else {
              fetch(`/api/messages?around=${encodeURIComponent(data.messageId)}`)
                .then(r => r.ok ? r.json() : null)
                .then(result => {
                  if (!result) return;
                  setMessages(result.messages);
                  setHasMore(result.hasMore);
                  requestAnimationFrame(() => {
                    document.getElementById(`msg-${data.messageId}`)?.scrollIntoView({ behavior: 'instant', block: 'center' });
                  });
                });
            }
            break;
          }
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

  /** Splice fetched messages into the existing list, preserving unchanged references */
  function mergeMessages(prev: Message[], next: Message[]): Message[] {
    if (!prev.length) return next;
    const prevMap = new Map(prev.map(m => [m.id, m]));
    let changed = prev.length !== next.length;
    const result = next.map(m => {
      const existing = prevMap.get(m.id);
      if (existing && existing.content === m.content) return existing;
      changed = true;
      return m;
    });
    return changed ? result : prev;
  }

  async function pollAgentState() {
    try {
      const res = await fetch('/api/agent/state');
      if (res.ok) {
        const data = await res.json();
        setAgentState(data.state || 'idle');
      }
    } catch {}
  }

  async function refreshMessages() {
    try {
      const res = await fetch('/api/messages');
      if (res.ok) {
        const data: { messages: Message[]; hasMore: boolean } = await res.json();
        setMessages(prev => {
          if (!prev.length) return data.messages;
          const newIds = new Set(data.messages.map(m => m.id));
          const oldestNew = data.messages.length ? data.messages[0].createdAt : '';
          const olderKept = prev.filter(m => m.createdAt < oldestNew && !newIds.has(m.id));
          const merged = mergeMessages(prev, data.messages);
          return olderKept.length ? [...olderKept, ...merged] : merged;
        });
        setHasMore(data.hasMore);
      }
    } catch {}
    connectSSE();
  }

  async function loadOlderMessages() {
    if (loadingOlder() || !hasMore()) return;
    const msgs = messages();
    if (!msgs.length) return;
    const oldest = msgs[0].createdAt;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/messages?before=${encodeURIComponent(oldest)}`);
      if (res.ok) {
        const data: { messages: Message[]; hasMore: boolean } = await res.json();
        if (data.messages.length) {
          // Anchor to the first current child (skip loading indicator)
          const anchor = messagesContainer?.querySelector('.message, .annotation');
          const prevTop = anchor?.getBoundingClientRect().top ?? 0;
          setMessages(prev => [...data.messages, ...prev]);
          setLoadingOlder(false);
          // SolidJS updates DOM synchronously — restore scroll position now
          if (anchor && messagesContainer) {
            const newTop = anchor.getBoundingClientRect().top;
            messagesContainer.scrollTop += newTop - prevTop;
          }
        } else {
          setLoadingOlder(false);
        }
        setHasMore(data.hasMore);
        return;
      }
    } catch (e) {
      console.error('Failed to load older messages:', e);
    }
    setLoadingOlder(false);
  }

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


    // Load messages
    try {
      const hashId = location.hash?.match(/^#msg-(.+)/)?.[1];
      const url = hashId
        ? `/api/messages?around=${encodeURIComponent(hashId)}`
        : '/api/messages';
      const res = await fetch(url);
      if (res.ok) {
        const data: { messages: Message[]; hasMore: boolean } = await res.json();
        setMessages(data.messages);
        setHasMore(data.hasMore);
        if (hashId) {
          requestAnimationFrame(() => {
            document.getElementById(`msg-${hashId}`)?.scrollIntoView({ behavior: 'instant', block: 'start' });
          });
        } else {
          scrollToBottom(true);
          setTimeout(() => scrollToBottom(true), 500);
        }
        ready = true;
      }
    } catch (e) {
      console.error('Failed to load messages:', e);
    }

    connectSSE();
    pollAgentState();
    setInterval(pollAgentState, 30000);

    // Re-fetch messages when app returns from background (iOS kills SSE)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshMessages();
        pollAgentState();
        setTimeout(pollAgentState, 1000);
        navigator.clearAppBadge?.();
        navigator.serviceWorker?.controller?.postMessage('clearBadge');
      }
    });

    // Escape to stop agent
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && agentBusy()) stopAgent();
    });
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

  const deleteMessages = async (ids: string[]) => {
    if (!confirm('Delete internal work?')) return;
    await Promise.all(ids.map(id => fetch(`/api/messages/${id}`, { method: 'DELETE' })));
  };

  const forgetFrom = async (id: string) => {
    const res = await fetch('/api/forget/from', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: id }),
    });
    const data = await res.json();
    if (!res.ok) setToast(data.error || 'Failed to forget');
  };

  const stopAgent = () => {
    fetch('/api/stop', { method: 'POST' });
    setToast('Stopped');
    setTimeout(() => setToast(null), 2000);
  };

  const isInternal = (m: Message) => m.role === 'agent' && m.type && m.type !== 'message';

  const formatToolCall = (content: string): { tool: string; args: string } => {
    try {
      const parsed = JSON.parse(content);
      const tool = parsed.tool || '?';
      const input = parsed.input;
      if (!input || typeof input !== 'object') return { tool, args: '' };
      const keys = Object.keys(input);
      if (keys.length === 1) return { tool, args: String(input[keys[0]]) };
      return { tool, args: keys.map(k => `${k}=${input[k]}`).join(', ') };
    } catch { return { tool: '?', args: content }; }
  };

  const formatToolResult = (content: string): { tool: string; result: string; isError: boolean } => {
    try {
      const parsed = JSON.parse(content);
      return { tool: parsed.tool || '?', result: parsed.result ?? '', isError: !!parsed.isError };
    } catch { return { tool: '?', result: content, isError: false }; }
  };

  const getGroup = (idx: number): Message[] => {
    const msgs = messages();
    const group: Message[] = [];
    for (let i = idx; i < msgs.length && isInternal(msgs[i]); i++) group.push(msgs[i]);
    return group;
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthState('unauthenticated');
    setShowSettings(false);
  };

  const escapeHtml = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const renderMarkdown = (text: string) => {
    const html = marked.parse(escapeHtml(text), { async: false }) as string;
    return <div class="markdown" innerHTML={html} />;
  };

  const renderContent = (text: string, messageId?: string): JSX.Element[] => {
    // Match code blocks and widget iframes (served or inline data URLs)
    const blockRegex = /```(\w*)\n?([\s\S]*?)```|<iframe\s+[^>]*?src="(\/widget\/[^"]+|data:text\/html[^"]+)"[^>]*>(?:\s*<\/iframe>)?/gi;
    const parts: JSX.Element[] = [];
    let lastIndex = 0;
    let match;

    while ((match = blockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(renderMarkdown(text.slice(lastIndex, match.index)));
      }
      if (match[1] !== undefined || match[2] !== undefined) {
        // Code block
        const lang = match[1] || '';
        const code = (match[2] || '').trim();
        parts.push(<CodeBlock lang={lang} code={code} />);
      } else if (match[3]) {
        // Widget iframe — render as component
        const src = match[3];
        parts.push(<Widget src={src} messageId={messageId} />);
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(renderMarkdown(text.slice(lastIndex)));
    }

    return parts;
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
              <a href="/" class="header-title" onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); history.replaceState(null, '', '/'); scrollToBottom(); } }}>{(window as any).__APP_NAME__}</a>
              <button class="settings-btn" onClick={() => { refreshMessages(); scrollToBottom(true); }} title="Refresh">↻</button>
              <button class="settings-btn" onClick={() => setShowSettings(true)} title="Settings">⚙</button>
            </header>

            <Show when={showSettings() || shouldPromptNotifications()}>
              <SettingsModal
                onClose={() => { setShowSettings(false); dismissNotificationPrompt(); }}
                onLogout={logout}
                initialTab={!showSettings() && shouldPromptNotifications() ? 'notifications' : undefined}
              />
            </Show>

            <div class="messages" ref={(el) => {
              messagesContainer = el;
              initScrollTracking(el);
            }} onClick={(e) => {
              const img = (e.target as HTMLElement).closest('.markdown img') as HTMLImageElement;
              if (img) openLightbox(img.src, img.alt || 'image');
            }}>
              <div class="loading-older" ref={(el) => {
                new IntersectionObserver((entries) => {
                  if (entries[0].isIntersecting && hasMore() && !loadingOlder()) loadOlderMessages();
                }, { root: el.parentElement }).observe(el);
              }}>
                <Show when={loadingOlder()}>Loading older messages...</Show>
              </div>
              {messages().length === 0 ? (
                <div class="empty">No messages yet</div>
              ) : (
                <For each={messages()}>
                  {(msg, idx) => {
                    if (isInternal(msg)) {
                      // Only the first message in a group renders the block
                      const prev = idx() > 0 ? messages()[idx() - 1] : undefined;
                      if (prev && isInternal(prev)) return null;
                      const group = () => getGroup(idx());
                      const isLast = () => idx() + group().length >= messages().length;
                      return (
                        <details class="annotation">
                          <summary>
                            Internal work ({group().length})
                            <button class="annotation-delete" onClick={() => deleteMessages(group().map(m => m.id))}>×</button>
                          </summary>
                          <For each={group()}>
                            {(m) => (
                              <div class="annotation-item">
                                <Show when={m.type === 'thought'}><em>{m.content}</em></Show>
                                <Show when={m.type === 'tool_call'}>
                                  {(() => { const tc = formatToolCall(m.content); return (
                                    <>
                                      <span class="tool-tag">{tc.tool}</span>
                                      <Show when={tc.args}><pre>{tc.args}</pre></Show>
                                    </>
                                  ); })()}
                                </Show>
                                <Show when={m.type === 'tool_result'}>
                                  {(() => { const tr = formatToolResult(m.content); return (
                                    <pre classList={{ 'tool-error': tr.isError }}>{tr.result}</pre>
                                  ); })()}
                                </Show>
                              </div>
                            )}
                          </For>
                          <Show when={isLast()}>
                            <button class="annotation-stop" onClick={stopAgent}>Stop</button>
                          </Show>
                        </details>
                      );
                    }
                    return (
                      <MessageBubble
                        message={msg}
                        onDelete={deleteMsg}
                        onForget={forgetFrom}
                        onImageClick={openLightbox}
                        renderContent={renderContent}
                      />
                    );
                  }}
                </For>
              )}
              <Show when={agentBusy()}>
                <div class="message agent">
                  <div class="bubble typing-indicator">
                    <span class="state-label">{stateLabel()}</span>
                    <button class="typing-stop" onClick={stopAgent}>Stop</button>
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
