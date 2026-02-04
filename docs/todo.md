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
