# Claude Instructions

## Important

- **Do not kill Docker processes** - Multiple projects run on this machine
- Do not use arbitrary sleeps to wait for processes
- When asked to review code, review uncommitted code for sane architecture, code practices, clean code
- **Use Chrome DevTools MCP** for browser testing and debugging

## Local Development

```bash
make dev          # Start docker compose
make typecheck    # Run TypeScript checks
make logs         # Follow container logs
```

Client: http://localhost:3102 (dev only, proxies to Public API)
Agent API: http://127.0.0.1:3100 (localhost only)
Public API: http://127.0.0.1:3101 (nginx proxies to this in prod)

## Project Structure

- `/server` - Express API + AI agent
- `/client` - SolidJS SPA
- `/shared` - Shared TypeScript types
