# Development

## Prerequisites

- Docker & Docker Compose

## Run Locally

```bash
docker compose up --build
```

- Client: http://localhost:5173
- Server: http://localhost:3000

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
