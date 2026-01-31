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
