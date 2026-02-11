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
cd /opt/clawchat/deploy
make push-setup
```

Generates VAPID keys, adds them to `.env`, restarts the service.

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
