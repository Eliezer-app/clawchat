import webpush from 'web-push';
import { getAllPushSubscriptions, deletePushSubscription } from './db.js';

let initialized = false;

export function initPush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@localhost';

  if (!publicKey || !privateKey) {
    console.log('[Push] VAPID keys not configured - push notifications disabled');
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
  console.log('[Push] Web push notifications enabled');
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function isPushEnabled(): boolean {
  return initialized;
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!initialized) return;

  const subscriptions = getAllPushSubscriptions();
  if (subscriptions.length === 0) return;

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
          payloadStr
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
