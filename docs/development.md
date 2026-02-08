# Development

## Prerequisites

- Docker & Docker Compose

## Run Locally

```bash
docker compose up
```

- Client: http://localhost:3102
- Agent API: http://127.0.0.1:3100 (localhost only, `make api-docs`)
- Public API: http://localhost:3101

## Hot Reload

Source directories are mounted as volumes. Changes to `/client/src`, `/server/src`, and `/shared/src` reload automatically.

## Useful Commands

```bash
# Rebuild containers
docker compose up --build

# Stop
docker compose down

# View logs
docker compose logs -f server
docker compose logs -f client
```
