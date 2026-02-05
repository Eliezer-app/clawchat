# TODO

## Push Notifications (Chrome)

Implement Web Push for message notifications when the tab is closed.

Requirements:
- Generate VAPID keys (server-side)
- Service worker for push handling
- `PushSubscription` table (endpoint, keys, sessionId)
- Subscribe UI in settings
- Server sends push on new agent messages

Scope: Chrome only (uses standard Web Push API).

## Agent Typing Indicator

Allow the agent API to signal "typing" state to the chat UI.

Requirements:
- Agent API endpoint: `POST /typing` with `{ typing: boolean }`
- Broadcast typing state via SSE: `{ type: 'typing', typing: boolean }`
- Client shows typing indicator (animated dots) below messages when `typing: true`
- Auto-clear typing state after timeout (e.g., 30s) if agent doesn't send `typing: false`
- Typing indicator disappears when new agent message arrives
