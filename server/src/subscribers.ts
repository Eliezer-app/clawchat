import type { Message } from '@clawchat/shared';

let subscriberUrls: string[] = [];

export function initSubscribers(urls: string[]) {
  subscriberUrls = urls;
  if (urls.length) console.log(`[Subscribers] Forwarding to: ${urls.join(', ')}`);
}

/** Delivers agent messages to all subscribers */
export function notifySubscribers(message: Message) {
  if (message.role !== 'agent' || message.type !== 'message') return;
  const body = JSON.stringify(message);
  for (const url of subscriberUrls) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch((err) => {
      console.log(`[Subscribers] ${url} unreachable: ${err.message}`);
    });
  }
}
