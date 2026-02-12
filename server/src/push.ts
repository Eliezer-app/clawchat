import webpush from 'web-push';
import { getAllPushSubscriptions, deletePushSubscription, getVisibleSessionIds } from './db.js';

let publicKey: string;

export function initPush(requireEnv: (name: string) => string): void {
  publicKey = requireEnv('VAPID_PUBLIC_KEY');
  const privateKey = requireEnv('VAPID_PRIVATE_KEY');
  const subject = requireEnv('VAPID_SUBJECT');
  webpush.setVapidDetails(subject, publicKey, privateKey);
  console.log('[Push] Web push notifications enabled');
}

export function getVapidPublicKey(): string {
  return publicKey;
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const subscriptions = getAllPushSubscriptions();
  if (subscriptions.length === 0) return;

  // If any device is viewing chat, skip all notifications
  const visibleSessionIds = getVisibleSessionIds();
  if (visibleSessionIds.length > 0) {
    console.log('[Push] User viewing chat on another device, skipping notifications');
    return;
  }

  const payloadStr = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payloadStr,
          { urgency: 'high' }
        );
      } catch (err) {
        const error = err as { statusCode?: number };
        // 410 Gone or 404 means subscription is no longer valid
        if (error.statusCode === 410 || error.statusCode === 404) {
          deletePushSubscription(sub.endpoint);
        } else {
          throw err;
        }
      }
    })
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.log(`[Push] Failed to send to ${failed}/${subscriptions.length} subscriptions`);
  }
}
