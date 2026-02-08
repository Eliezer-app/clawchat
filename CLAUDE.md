# Claude Instructions

## Important

- **Do not kill Docker processes** - Multiple projects run on this machine
- Do not use arbitrary sleeps to wait for processes
- When asked to review code, act as a senior SWE with SOLID principles!
  Review uncommitted code for sane architecture, code practices, clean code
- **Use Chrome DevTools MCP** for browser testing and debugging
- **Read docs/widgets.md** before creating or editing widgets
- **CSS: use cascading and inheritance** - Define base styles on containers, override with minimal classes. No per-element classes or inline styles. Read `Main.css` before adding new rules.

## Local Development

```bash
make dev          # Start docker compose
make typecheck    # Run TypeScript checks
make logs         # Follow container logs
```

Client: http://localhost:3102 (dev only, proxies to Public API)
Agent API: http://127.0.0.1:3100 (container-internal only, see below)
Public API: http://127.0.0.1:3101 (nginx proxies to this in prod)

## Agent API

The Agent API is only accessible from inside the container. Use the helper script:

```bash
# Update a message (content from file via stdin - no escaping needed)
cat /tmp/content.txt | ./scripts/update-message.sh <message-id>
```

API docs are in source comments: `make api-docs` to print.

## Project Structure

- `/server` - Express API + AI agent
- `/client` - SolidJS SPA
- `/shared` - Shared TypeScript types
- `/docs` - Documentation (see widgets.md for widget API)
