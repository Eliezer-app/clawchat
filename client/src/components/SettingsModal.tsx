import { createSignal, onMount, Show, For, createEffect } from 'solid-js';
import { usePushNotifications } from '../hooks/usePushNotifications';

type Tab = 'notifications' | 'prompts' | 'account';

interface SettingsModalProps {
  onClose: () => void;
  onLogout: () => void;
  initialTab?: Tab;
}

export default function SettingsModal(props: SettingsModalProps) {
  const [activeTab, setActiveTab] = createSignal<Tab>(props.initialTab || 'notifications');
  const { state, subscribe, unsubscribe } = usePushNotifications();

  // Prompts state
  const [prompts, setPrompts] = createSignal<{ name: string }[]>([]);
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

  const ucFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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

    // Check if user has dismissed the prompt before (localStorage)
    const dismissed = localStorage.getItem('push-prompt-dismissed');
    if (dismissed) {
      return;
    }

    // Should prompt
    setShouldPrompt(true);
  });

  const dismiss = () => {
    localStorage.setItem('push-prompt-dismissed', 'true');
    setShouldPrompt(false);
  };

  return { shouldPrompt, dismiss };
}
