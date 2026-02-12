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
        // 400/404/410 means subscription is no longer valid
        if (error.statusCode === 400 || error.statusCode === 404 || error.statusCode === 410) {
          deletePushSubscription(sub.endpoint);
        } else {
          throw err;
        }
      }
    })
  );

  const failed = results.filter((r) => r.status === 'rejected');
  for (const r of failed) {
    const err = (r as PromiseRejectedResult).reason;
    console.log(`[Push] Error: ${err.statusCode || 'unknown'} ${err.body || err.message}`);
  }
}
