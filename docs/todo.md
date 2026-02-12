# TODO

## Push Notifications (Chrome)

Implement Web Push for message notifications when the tab is closed.

- [x] Generate VAPID keys (server-side)
- [x] Service worker for push handling
- [x] `PushSubscription` table (endpoint, keys, sessionId)
- [x] Subscribe UI in settings
- [x] Server sends push on new agent messages
- [x] Suppress notifications when window is focused
- [x] Token login form for PWA authentication

Scope: Chrome only (uses standard Web Push API).

Known issues:
- macOS 15 + Chrome: `notificationclick` doesn't work with `requireInteraction: true` (Chromium bug #370536109)

## Agent Typing Indicator

Allow the agent API to signal "typing" state to the chat UI.

- [x] Agent API endpoint: `POST /typing` with `{ active: boolean }`
- [x] Broadcast typing state via SSE: `{ type: 'agentTyping', active: boolean }`
- [x] Client shows typing indicator (animated dots) below messages
- [x] Auto-clear on agent disconnect or message send
- [x] Typing indicator disappears when new agent message arrives
- [x] Move stop button by the typing bubble
- [ ] Fix scroll to bottom on page load — does not reliably stay at bottom when images/widgets load
