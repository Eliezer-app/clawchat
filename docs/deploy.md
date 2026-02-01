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

## Nginx

```nginx
server {
    listen 80;
    server_name chat.example.com;

    root /path/to/clawchat/client/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_set_header Connection '';  # SSE
        proxy_buffering off;             # SSE
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## systemd (optional)

```ini
[Unit]
Description=ClawChat Server

[Service]
WorkingDirectory=/path/to/clawchat/server
ExecStart=/usr/bin/node dist/index.js
Environment=PUBLIC_HOST=0.0.0.0
Restart=always

[Install]
WantedBy=multi-user.target
```

## Security

Agent API (port 3100) binds to `127.0.0.1` only. Don't expose it externally - it's for local agent use.
