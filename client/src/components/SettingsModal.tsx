import { createSignal, onMount, Show } from 'solid-js';
import { usePushNotifications } from '../hooks/usePushNotifications';

type Tab = 'notifications' | 'account';

interface SettingsModalProps {
  onClose: () => void;
  onLogout: () => void;
  initialTab?: Tab;
}

export default function SettingsModal(props: SettingsModalProps) {
  const [activeTab, setActiveTab] = createSignal<Tab>(props.initialTab || 'notifications');
  const { state, subscribe, unsubscribe } = usePushNotifications();

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
