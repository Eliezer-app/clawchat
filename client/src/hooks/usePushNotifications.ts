import { createSignal, onMount } from 'solid-js';

export type PushState = 'loading' | 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}

export function usePushNotifications() {
  const [state, setState] = createSignal<PushState>('loading');

  async function checkState(): Promise<void> {
    // Check browser support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }

    // Check permission
    const permission = Notification.permission;
    if (permission === 'denied') {
      setState('denied');
      return;
    }

    // Check if already subscribed
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!registration) {
        setState('unsubscribed');
        return;
      }
      const subscription = await registration.pushManager.getSubscription();
      setState(subscription ? 'subscribed' : 'unsubscribed');
    } catch {
      setState('unsubscribed');
    }
  }

  async function subscribe(): Promise<boolean> {
    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Get VAPID public key
      const keyResponse = await fetch('/api/push/vapid-public-key');
      if (!keyResponse.ok) {
        console.error('Push not configured on server');
        return false;
      }
      const { publicKey } = await keyResponse.json();

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return false;
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      setState('subscribed');
      return true;
    } catch (err) {
      console.error('Failed to subscribe:', err);
      return false;
    }
  }

  async function unsubscribe(): Promise<boolean> {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Notify server
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          credentials: 'include',
        });

        // Unsubscribe locally
        await subscription.unsubscribe();
      }

      setState('unsubscribed');
      return true;
    } catch (err) {
      console.error('Failed to unsubscribe:', err);
      return false;
    }
  }

  onMount(() => {
    checkState();
  });

  return { state, subscribe, unsubscribe };
}
