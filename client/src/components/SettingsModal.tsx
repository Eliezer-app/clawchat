import { createSignal, onMount, Show, For, createEffect } from 'solid-js';
import { usePushNotifications } from '../hooks/usePushNotifications';

type Tab = 'notifications' | 'prompts' | 'agent' | 'cron' | 'account';

interface SettingsModalProps {
  onClose: () => void;
  onLogout: () => void;
  initialTab?: Tab;
}

export default function SettingsModal(props: SettingsModalProps) {
  const [activeTab, setActiveTab] = createSignal<Tab>(props.initialTab || (localStorage.getItem('settings-tab') as Tab) || 'notifications');
  createEffect(() => localStorage.setItem('settings-tab', activeTab()));
  const { state, subscribe, unsubscribe } = usePushNotifications();

  // Prompts state
  const [prompts, setPrompts] = createSignal<{ name: string; description?: string }[]>([]);
  const [selectedPrompt, setSelectedPrompt] = createSignal<string>('');
  const [promptContent, setPromptContent] = createSignal('');
  const [promptOriginal, setPromptOriginal] = createSignal('');
  const [promptLoading, setPromptLoading] = createSignal(false);
  const [promptSaving, setPromptSaving] = createSignal(false);
  const [promptError, setPromptError] = createSignal<string | null>(null);
  const promptDirty = () => promptContent() !== promptOriginal();

  // Load prompts list
  onMount(async () => {
    try {
      const res = await fetch('/api/prompts');
      if (res.ok) {
        const list = await res.json();
        setPrompts(list);
        if (list.length > 0) {
          setSelectedPrompt(list[0].name);
        }
      }
    } catch {
      // Ignore - prompts may not be configured
    }
  });

  // Load prompt content when selection changes
  createEffect(async () => {
    const name = selectedPrompt();
    if (!name) return;

    setPromptLoading(true);
    setPromptError(null);
    try {
      const res = await fetch(`/api/prompts/${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        setPromptContent(data.content);
        setPromptOriginal(data.content);
      } else {
        setPromptError('Failed to load prompt');
      }
    } catch {
      setPromptError('Failed to load prompt');
    } finally {
      setPromptLoading(false);
    }
  });

  const handlePromptSave = async () => {
    const name = selectedPrompt();
    if (!name) return;

    setPromptSaving(true);
    setPromptError(null);
    try {
      const res = await fetch(`/api/prompts/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: promptContent() }),
      });
      if (res.ok) {
        setPromptOriginal(promptContent());
      } else {
        setPromptError('Failed to save prompt');
      }
    } catch {
      setPromptError('Failed to save prompt');
    } finally {
      setPromptSaving(false);
    }
  };

  // Agent info state
  const [agentState, setAgentState] = createSignal<Record<string, unknown> | null>(null);
  const [agentMemory, setAgentMemory] = createSignal<Record<string, unknown> | null>(null);
  const [agentError, setAgentError] = createSignal<string | null>(null);
  const [agentLoading, setAgentLoading] = createSignal(false);

  // Cron state
  const [crons, setCrons] = createSignal<any[]>([]);

  const fetchAgentInfo = async () => {
    setAgentLoading(true);
    setAgentError(null);
    try {
      const [stateRes, memoryRes] = await Promise.all([
        fetch('/api/agent/state'),
        fetch('/api/agent/memory'),
      ]);
      if (!stateRes.ok || !memoryRes.ok) {
        const err = !stateRes.ok ? await stateRes.json() : await memoryRes.json();
        setAgentError(err.error || 'Failed to fetch agent info');
        return;
      }
      setAgentState(await stateRes.json());
      setAgentMemory(await memoryRes.json());
    } catch {
      setAgentError('Agent unreachable');
    } finally {
      setAgentLoading(false);
    }
  };

  const toggleCron = async (name: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/agent/cron/${encodeURIComponent(name)}/enabled`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setCrons(prev => prev.map(c => c.name === name ? { ...c, enabled } : c));
      }
    } catch {}
  };

  const fetchCrons = async () => {
    try {
      const res = await fetch('/api/agent/cron');
      if (res.ok) setCrons(await res.json());
    } catch {}
  };

  createEffect(() => {
    if (activeTab() === 'agent') fetchAgentInfo();
    if (activeTab() === 'cron') fetchCrons();
  });

  const ucFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtTokens = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);

  const fmtTimestamp = (ts: string) => {
    const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const date = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    let ago: string;
    if (diffMins < 1) ago = 'just now';
    else if (diffMins < 60) ago = `${diffMins}m ago`;
    else if (diffMs < 86400000) {
      const h = Math.floor(diffMins / 60);
      const m = diffMins % 60;
      ago = `${h}h:${String(m).padStart(2,'0')}m ago`;
    } else {
      const days = Math.floor(diffMs / 86400000);
      ago = `${days} day${days > 1 ? 's' : ''} ago`;
    }
    return `${date} - ${ago}`;
  };

  let linesRef: HTMLDivElement | undefined;

  const handlePushToggle = async () => {
    if (state() === 'subscribed') {
      await unsubscribe();
    } else if (state() === 'unsubscribed') {
      await subscribe();
    }
  };

  const renderPushStatus = () => {
    const s = state();
    switch (s) {
      case 'loading':
        return <span class="settings-status">Loading...</span>;
      case 'unsupported':
        return <span class="settings-status">Not supported in this browser</span>;
      case 'denied':
        return <span class="settings-status">Blocked by browser</span>;
      case 'subscribed':
        return (
          <button class="settings-toggle-btn settings-toggle-btn--active" onClick={handlePushToggle}>
            Disable
          </button>
        );
      case 'unsubscribed':
        return (
          <button class="settings-toggle-btn" onClick={handlePushToggle}>
            Enable
          </button>
        );
    }
  };

  return (
    <div class="settings-overlay">
      <div class="settings-page">
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="settings-close" onClick={props.onClose}>×</button>
        </div>

        <div class="settings-tabs">
          <button
            class={`settings-tab ${activeTab() === 'notifications' ? 'settings-tab--active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            Notifications
          </button>
          <Show when={prompts().length > 0}>
            <button
              class={`settings-tab ${activeTab() === 'prompts' ? 'settings-tab--active' : ''}`}
              onClick={() => setActiveTab('prompts')}
            >
              Prompts
            </button>
          </Show>
          <button
            class={`settings-tab ${activeTab() === 'agent' ? 'settings-tab--active' : ''}`}
            onClick={() => setActiveTab('agent')}
          >
            Agent
          </button>
          <button
            class={`settings-tab ${activeTab() === 'cron' ? 'settings-tab--active' : ''}`}
            onClick={() => setActiveTab('cron')}
          >
            Schedule
          </button>
          <button
            class={`settings-tab ${activeTab() === 'account' ? 'settings-tab--active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            Account
          </button>
        </div>

        <div class="settings-content">
          <Show when={activeTab() === 'notifications'}>
            <div class="settings-section">
              <div class="settings-row">
                <div class="settings-row-label">
                  <span class="settings-row-title">Push Notifications</span>
                  <span class="settings-row-desc">Get notified when the agent responds</span>
                </div>
                {renderPushStatus()}
              </div>
            </div>
          </Show>

          <Show when={activeTab() === 'prompts'}>
            <div class="settings-section settings-prompts">
              <div class="settings-prompts-header">
                <div class="settings-prompts-pills">
                  <For each={prompts()}>
                    {(prompt) => (
                      <button
                        class={`settings-prompts-pill ${selectedPrompt() === prompt.name ? 'settings-prompts-pill--active' : ''}`}
                        onClick={() => setSelectedPrompt(prompt.name)}
                      >
                        {ucFirst(prompt.name)}
                      </button>
                    )}
                  </For>
                </div>
                <button
                  class="settings-prompts-save"
                  onClick={handlePromptSave}
                  disabled={!promptDirty() || promptSaving()}
                >
                  {promptSaving() ? 'Saving...' : 'Save'}
                </button>
              </div>
              <Show when={prompts().find(p => p.name === selectedPrompt())?.description}>
                <p class="settings-row-desc">{prompts().find(p => p.name === selectedPrompt())!.description}</p>
              </Show>
              <Show when={promptError()}>
                <div class="settings-prompts-error">{promptError()}</div>
              </Show>
              <div class="settings-prompts-editor">
                <div class="settings-prompts-lines" ref={linesRef}>
                  <For each={promptContent().split('\n')}>
                    {(_, i) => <div class="settings-prompts-line-num">{i() + 1}</div>}
                  </For>
                </div>
                <textarea
                  class="settings-prompts-textarea"
                  value={promptContent()}
                  onInput={(e) => setPromptContent(e.currentTarget.value)}
                  onScroll={(e) => {
                    if (linesRef) linesRef.scrollTop = e.currentTarget.scrollTop;
                  }}
                  disabled={promptLoading()}
                  placeholder={promptLoading() ? 'Loading...' : ''}
                  spellcheck={false}
                />
              </div>
            </div>
          </Show>

          <Show when={activeTab() === 'agent'}>
            <div class="settings-section">
              <div class="settings-agent-header">
                <span class="settings-row-title">Agent Info</span>
                <button class="settings-agent-refresh" onClick={fetchAgentInfo} disabled={agentLoading()}>
                  {agentLoading() ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              <Show when={agentError()}>
                <div class="settings-agent-error">{agentError()}</div>
              </Show>
              <Show when={agentState()}>
                <div class="settings-agent-group">
                  <h4 class="settings-agent-group-title">State</h4>
                  <div class="settings-agent-grid">
                    <Show when={(agentState() as any).currentEvent}>
                      <div class="settings-agent-item">
                        <span class="settings-agent-label">Current Event</span>
                        <span class="settings-agent-value">
                          {(agentState() as any).currentEvent.source}/{(agentState() as any).currentEvent.type}
                        </span>
                      </div>
                    </Show>
                    <div class="settings-agent-item">
                      <span class="settings-agent-label">Queue Depth</span>
                      <span class="settings-agent-value">{(agentState() as any).queueDepth}</span>
                    </div>
                    <div class="settings-agent-item">
                      <span class="settings-agent-label">Tokens Used</span>
                      <span class="settings-agent-value">{((agentState() as any).tokensUsed).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </Show>
              <Show when={agentMemory()}>
                {(() => {
                  const m = agentMemory() as any;
                  const ctx = m.context;
                  return (
                    <>
                      <div class="settings-agent-group">
                        <h4 class="settings-agent-group-title">Context</h4>
                        <div class="settings-context-bar-wrapper">
                          <div class="settings-context-bar">
                            <Show when={ctx.flow.tokens > 0}>
                              <div
                                class="settings-context-segment settings-context-segment--flow"
                                style={{ width: `max(4px, ${(ctx.flow.tokens / ctx.budget * 100)}%)` }}
                                title={`Flow: ${fmtTokens(ctx.flow.tokens)} tokens (${ctx.flow.pct}%)`}
                              />
                            </Show>
                            <Show when={ctx.compacted.tokens > 0}>
                              <div
                                class="settings-context-segment settings-context-segment--compacted"
                                style={{ width: `max(4px, ${(ctx.compacted.tokens / ctx.budget * 100)}%)` }}
                                title={`Compacted: ${fmtTokens(ctx.compacted.tokens)} tokens (${ctx.compacted.pct}%)`}
                              />
                            </Show>
                            <Show when={ctx.memory.tokens > 0}>
                              <div
                                class="settings-context-segment settings-context-segment--memory"
                                style={{ width: `max(4px, ${(ctx.memory.tokens / ctx.budget * 100)}%)` }}
                                title={`Memory: ${fmtTokens(ctx.memory.tokens)} tokens (${ctx.memory.pct}%)`}
                              />
                            </Show>
                            <Show when={ctx.system.tokens > 0}>
                              <div
                                class="settings-context-segment settings-context-segment--system"
                                style={{ width: `max(4px, ${(ctx.system.tokens / ctx.budget * 100)}%)` }}
                                title={`System: ${fmtTokens(ctx.system.tokens)} tokens (${ctx.system.pct}%)`}
                              />
                            </Show>
                          </div>
                          <div class="settings-context-bar-label">
                            {ctx.total.pct}% of {fmtTokens(ctx.budget)} tokens
                          </div>
                        </div>
                        <div class="settings-context-legend">
                          <div class="settings-context-legend-item">
                            <span class="settings-context-dot settings-context-dot--flow" />
                            <span class="settings-context-legend-label">Flow</span>
                            <span class="settings-context-legend-value">{fmtTokens(ctx.flow.tokens)} tokens</span>
                          </div>
                          <div class="settings-context-legend-item">
                            <span class="settings-context-dot settings-context-dot--compacted" />
                            <span class="settings-context-legend-label">Compacted</span>
                            <span class="settings-context-legend-value">{fmtTokens(ctx.compacted.tokens)} tokens{ctx.compacted.originalTokens ? ` (from ${fmtTokens(ctx.compacted.originalTokens)})` : ''}</span>
                          </div>
                          <div class="settings-context-legend-item">
                            <span class="settings-context-dot settings-context-dot--memory" />
                            <span class="settings-context-legend-label">Memory</span>
                            <span class="settings-context-legend-value">{fmtTokens(ctx.memory.tokens)} tokens</span>
                          </div>
                          <div class="settings-context-legend-item">
                            <span class="settings-context-dot settings-context-dot--system" />
                            <span class="settings-context-legend-label">System</span>
                            <span class="settings-context-legend-value">{fmtTokens(ctx.system.tokens)} tokens</span>
                          </div>
                        </div>
                      </div>
                      <div class="settings-agent-group">
                        <h4 class="settings-agent-group-title">History</h4>
                        <div class="settings-agent-grid">
                          <div class="settings-agent-item">
                            <span class="settings-agent-label">Archived Messages</span>
                            <span class="settings-agent-value">{m.archived.messages}</span>
                          </div>
                        </div>
                      </div>
                      <For each={[['Compressions', m.ops.compressions], ['Distillations', m.ops.distillations]] as [string, string[]][]}>
                        {([label, timestamps]) => (
                          <div class="settings-agent-group">
                            <h4 class="settings-agent-group-title">{label}</h4>
                            <div class="settings-agent-grid">
                              <Show when={timestamps.length > 0} fallback={
                                <div class="settings-agent-item">
                                  <span class="settings-agent-ts">None yet</span>
                                </div>
                              }>
                                <For each={timestamps}>
                                  {(ts: string) => (
                                    <div class="settings-agent-item">
                                      <span class="settings-agent-ts">{fmtTimestamp(ts)}</span>
                                    </div>
                                  )}
                                </For>
                              </Show>
                            </div>
                          </div>
                        )}
                      </For>
                    </>
                  );
                })()}
              </Show>
            </div>
          </Show>

          <Show when={activeTab() === 'cron'}>
            <div class="settings-section">
              <For each={crons()}>
                {(cron) => (
                  <div class="settings-row">
                    <div class="settings-row-label">
                      <span class="settings-row-title">{cron.name}</span>
                      <span>{cron.prompt}</span>
                      <span class="settings-row-desc">{cron.cronHuman}</span>
                      <span class="settings-row-desc">Last run: {cron.last_run ? fmtTimestamp(cron.last_run) : 'Never'}</span>
                    </div>
                    <button
                      class={`settings-toggle ${cron.enabled ? 'settings-toggle--on' : ''}`}
                      onClick={() => toggleCron(cron.name, !cron.enabled)}
                    />
                  </div>
                )}
              </For>
              <Show when={crons().length === 0}>
                <span class="settings-row-desc">No crons configured</span>
              </Show>
            </div>
          </Show>

          <Show when={activeTab() === 'account'}>
            <div class="settings-section">
              <p class="settings-hint">If you log out, you'll need to generate a new invite on the server to log back in.</p>
              <button class="settings-logout-btn" onClick={props.onLogout}>Log out</button>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

// Hook to check if we should prompt for notifications
export function useShouldPromptNotifications() {
  const [shouldPrompt, setShouldPrompt] = createSignal(false);

  onMount(async () => {
    // Check if push notifications are supported
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    // Check if permission already denied
    if (Notification.permission === 'denied') {
      return;
    }

    // Check if already subscribed
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          return; // Already subscribed
        }
      }
    } catch {
      // Ignore errors
    }

    // Should prompt
    setShouldPrompt(true);
  });

  const dismiss = () => setShouldPrompt(false);

  return { shouldPrompt, dismiss };
}
