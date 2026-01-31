# Claude Instructions

## Important

- **Do not kill Docker processes** - Multiple projects run on this machine
- Do not use arbitrary sleeps to wait for processes
- When asked to review code, review uncommitted code for sane architecture, code practices, clean code

## Local Development

```bash
docker compose up
```

Client: http://localhost:3101
Server: http://localhost:3100

## Project Structure

- `/server` - Express API + AI agent
- `/client` - SolidJS SPA
- `/shared` - Shared TypeScript types
