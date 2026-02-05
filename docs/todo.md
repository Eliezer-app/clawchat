# TODO

## Push Notifications (Chrome)

Implement Web Push for message notifications when the tab is closed.

- [ ] Generate VAPID keys (server-side)
- [ ] Service worker for push handling
- [ ] `PushSubscription` table (endpoint, keys, sessionId)
- [ ] Subscribe UI in settings
- [ ] Server sends push on new agent messages

Scope: Chrome only (uses standard Web Push API).

## Agent Typing Indicator

Allow the agent API to signal "typing" state to the chat UI.

- [x] Agent API endpoint: `POST /typing` with `{ active: boolean }`
- [x] Broadcast typing state via SSE: `{ type: 'agentTyping', active: boolean }`
- [x] Client shows typing indicator (animated dots) below messages
- [x] Auto-clear on agent disconnect or message send
- [x] Typing indicator disappears when new agent message arrives
