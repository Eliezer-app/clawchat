// ClawChat Service Worker for Push Notifications

let unreadCount = 0;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data === 'clearBadge') {
    unreadCount = 0;
    self.registration.getNotifications().then((n) => n.forEach((n) => n.close()));
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'New message', body: event.data.text() };
  }

  unreadCount++;

  const options = {
    body: payload.body || 'New message',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'clawchat-message',
    data: payload.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'New message', options)
      .then(() => navigator.setAppBadge?.(unreadCount))
      .then(() => clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((windowClients) => {
        if (windowClients.some((c) => c.visibilityState === 'visible')) {
          unreadCount = 0;
          navigator.clearAppBadge?.();
          return self.registration.getNotifications().then((ns) => ns.forEach((n) => n.close()));
        }
      })
      .catch(() => {})
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Focus existing window or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Re-subscribe automatically when subscription expires
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch('/api/push/vapid-public-key');
        if (!response.ok) return;

        const { publicKey } = await response.json();
        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
          credentials: 'include',
        });
      } catch (err) {
        console.error('[SW] Failed to re-subscribe:', err);
      }
    })()
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
