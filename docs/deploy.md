# Deployment

## Setup

```bash
git clone https://github.com/clawchat/clawchat.git /opt/clawchat
cd /opt/clawchat
cp .env.example .env   # edit with your settings
cd deploy
make setup DOMAIN=chat.example.com
```

This installs Node 20, builds the app, configures systemd and nginx with SSL.

## Update

```bash
make prod-deploy
```

Pulls latest code, rebuilds, restarts the service.

## Push Notifications

```bash
make push-setup
```

Generates VAPID keys, adds them to `.env`, restarts the service. On prod, sets `VAPID_SUBJECT` to the `BASE_URL` from `.env` (e.g. `https://chat.example.com`). On dev, defaults to `mailto:admin@localhost`.

### iOS Requirements

Push notifications work on iOS 16.4+ in both Safari and Chrome (all iOS browsers use WebKit). The user must add the app to their home screen first.

Key requirements from [Apple's documentation](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers):

- **VAPID subject must be valid** — `mailto:admin@localhost` will be silently rejected by Apple's push service. Use a real `https://` URL or `mailto:` address.
- **Permission must be requested immediately from user gesture** — any async work (service worker registration, fetch) before `Notification.requestPermission()` causes iOS to lose the gesture context and silently refuse.
- **Notifications must be shown immediately** — Safari revokes push permission if the service worker receives a push but doesn't call `showNotification()` right away.
- **Urgency header** — set to `high` for immediate delivery, otherwise APNs may delay for battery optimization.
- **Payload limit** — 4 KB max.

## Operations

```bash
make prod-status        # systemd status + health check
make prod-logs          # follow logs
make prod-logs-all      # all logs in pager
make prod-logs-clear    # clear logs
make prod-start         # start service
make prod-stop          # stop service
```

## Authentication

ClawChat uses QR-code invites for device authentication. No passwords, no email.

### Generate an Invite

```bash
cd /opt/clawchat
BASE_URL=https://chat.example.com pnpm invite
```

This prints a QR code + URL. Scan with phone or open the link. Invite expires in 5 minutes, one-time use.

### How It Works

1. Admin runs `pnpm invite` on server
2. User scans QR or visits invite URL
3. Server creates session, sets httpOnly cookie
4. User is redirected to the app, authenticated
5. Session persists (1 year) — no re-auth needed

Unauthenticated users see a "scan to join" page at `/invite`.

## Security

- **Agent API** (port 3100): Binds to `127.0.0.1` only. Never expose externally — it's for local agent use.
- **Public API** (port 3101): Requires session auth for all routes except `/api/health` and `/invite`
- **Sessions**: httpOnly cookies, no localStorage tokens

## Files

- `deploy/Makefile` — setup and one-off targets
- `deploy/clawchat.service` — systemd unit
- `deploy/nginx.conf` — nginx site config (DOMAIN placeholder)
- `.env.example` — env template
