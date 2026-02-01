# Auth Plan

> ✅ **Status: Implemented** (2026-02-01)
> 
> Core auth flow is complete: QR invites, sessions, middleware.
> Push notifications not yet implemented.

## Requirements

- User must authenticate to access chat
- Push notifications must reach the user across devices
- Agent API remains local-only (no auth needed)
- No email/SMTP required - self-hosters just need server access

## Approach: QR Code Invites + Device Sessions

### Flow

1. **Admin runs invite command**: `pnpm agent-invite` prints QR code to terminal
2. **User scans QR**: Phone camera opens invite link
3. **Session created**: Device gets session token in httpOnly cookie
4. **Push subscription**: Browser prompts for notification permission, subscription stored
5. **Multi-device**: Run invite again for additional devices

### CLI Output

```
$ pnpm agent-invite

Scan to join:
█████████████████
█ ▄▄▄▄▄ █▀▄▀█▄█ █
█ █   █ █▄▀▄▀▄▄ █
█ █▄▄▄█ █ ▄▄▄▀█ █
█▄▄▄▄▄▄▄█▄█▄█▄█▄█

Or visit: http://192.168.1.10:3100/invite?token=abc123
Expires in 5 minutes.
```

### Data Model

```
Session
  id
  token (httpOnly cookie)
  createdAt
  expiresAt

Invite
  token
  expiresAt
  used (boolean)

PushSubscription
  id
  sessionId
  endpoint
  keys (p256dh, auth)
  createdAt
```

### Endpoints

```
GET  /api/auth/invite?token  - verify invite, create session, redirect to app
POST /api/auth/logout        - clear session
GET  /api/auth/me            - check if authenticated (200 or 401)

POST /api/push/subscribe     - save push subscription for session
DELETE /api/push/subscribe   - remove subscription
```

### Middleware

- All `/api/*` routes except `/api/auth/invite` and `/api/health` require valid session
- Agent API binds to localhost only, bypasses auth
- Static files (client) require valid session (redirect to "scan to join" page if not)

### Agent Notifications

When agent sends a message:
1. Message saved to DB
2. Broadcast via SSE to connected clients
3. Send push notification to all subscriptions (for offline devices)

## Implementation Order

1. Add Session, Invite tables
2. Add auth middleware
3. Add invite verification endpoint
4. Add CLI invite command with QR generation (use `qrcode-terminal`)
5. Add PushSubscription table
6. Add push subscribe/unsubscribe endpoints
7. Trigger push on agent message
8. Add "scan to join" landing page for unauthenticated users
