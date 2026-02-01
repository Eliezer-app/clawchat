# Deployment

## Prerequisites

```bash
# Node 20+, pnpm
corepack enable
```

## Build

```bash
git clone https://github.com/clawchat/clawchat.git && cd clawchat
pnpm install
pnpm --filter @clawchat/client build   # outputs to client/dist
pnpm --filter @clawchat/server build   # outputs to server/dist
```

## Run Server

```bash
cd server
PUBLIC_HOST=0.0.0.0 PUBLIC_PORT=3101 AGENT_PORT=3100 node dist/index.js
```

Data persists in `server/data/` (SQLite DB + uploads).

## Nginx + SSL

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/clawchat`:

```nginx
server {
    listen 80;
    server_name chat.example.com;

    location /api/ {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection '';  # SSE
        proxy_buffering off;             # SSE
        proxy_read_timeout 86400;        # SSE long-lived
    }

    location / {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable and get SSL:

```bash
sudo ln -s /etc/nginx/sites-available/clawchat /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d chat.example.com
```

Certbot auto-renews via systemd timer.

## systemd Service

Create `/etc/systemd/system/clawchat.service`:

```ini
[Unit]
Description=ClawChat Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/clawchat/server
ExecStart=/usr/bin/node dist/index.js
Environment=PUBLIC_HOST=127.0.0.1
Environment=PUBLIC_PORT=3101
Environment=AGENT_PORT=3100
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now clawchat
```

## Authentication

ClawChat uses QR-code invites for device authentication. No passwords, no email.

### Generate an Invite

```bash
cd /opt/clawchat/server
PUBLIC_URL=https://chat.example.com pnpm agent-invite
```

This prints a QR code + URL. Scan with phone or open the link. Invite expires in 5 minutes, one-time use.

### How It Works

1. Admin runs `pnpm agent-invite` on server
2. User scans QR or visits invite URL
3. Server creates session, sets httpOnly cookie
4. User is redirected to the app, authenticated
5. Session persists (1 year) — no re-auth needed

Unauthenticated users see a "scan to join" page at `/invite`.

### Endpoints

- `GET /api/auth/invite?token=...` — verify invite, create session
- `GET /api/auth/me` — check authentication status
- `POST /api/auth/logout` — clear session

## Security

- **Agent API** (port 3100): Binds to `127.0.0.1` only. Never expose externally — it's for local agent use (OpenClaw, scripts, etc.)
- **Public API** (port 3101): Requires session auth for all routes except `/api/health` and `/invite`
- **Sessions**: httpOnly cookies, no localStorage tokens
