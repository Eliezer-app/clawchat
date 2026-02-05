# Architecture

## Stack

- **Runtime**: Node.js + TypeScript
- **Backend**: Express
- **Frontend**: SolidJS (Vite)
- **Database**: SQLite (simple, single-file, no setup)
- **Push**: Web Push API with service workers

## Structure

```
/server     - Express API + AI agent logic
/client     - SolidJS SPA
/shared     - Shared types
```

## Key Decisions

1. **Monorepo**: Client and server in one repo for simplicity
2. **SQLite**: No external DB dependency; sufficient for single-server use case
3. **Web Push**: Native browser push via VAPID keys; no third-party service
4. **SSE for chat**: Server-sent events for real-time messages; simpler than WebSocket
5. **PWA**: Service worker enables push notifications and offline access

## Push Notifications Setup

Push notifications require VAPID keys. Generate them once per deployment:

```bash
make setup-push
```

This creates keys in `.env`:
```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@localhost
```

For production with nginx + HTTPS:

1. Generate VAPID keys on the server
2. Add to environment (docker-compose or systemd)
3. Ensure nginx proxies these paths to the backend:
   - `/api/push/*` - Push subscription endpoints
   - `/sw.js` - Service worker (must be served from root)
   - `/manifest.json` - PWA manifest

### iOS Requirements

- iOS 16.4+ required
- User must "Add to Home Screen" first
- `display: standalone` in manifest (already configured)

### Known Issues

- **macOS 15 + Chrome**: `notificationclick` event doesn't fire due to Chrome bug. Notifications appear but clicking doesn't focus the app.
- **iOS**: Only works as installed PWA, not in browser
