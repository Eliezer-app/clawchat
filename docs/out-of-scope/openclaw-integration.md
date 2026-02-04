# OpenClaw Integration

ClawChat can serve as a chat interface for [OpenClaw](https://github.com/openclaw/openclaw) AI agents.

## Overview

OpenClaw has a built-in `clawchat` channel that connects to ClawChat's Agent API. Messages flow:

```
User (browser) → ClawChat Server → OpenClaw → AI Model → OpenClaw → ClawChat Server → User
```

## Setup

### 1. Deploy ClawChat

Follow [deploy.md](./deploy.md) to get ClawChat running with SSL.

### 2. Configure OpenClaw

Add ClawChat as a channel in your OpenClaw config (`~/.openclaw/config.yaml`):

```yaml
channels:
  clawchat:
    agentUrl: http://127.0.0.1:3100  # ClawChat's Agent API (localhost only)
    publicUrl: https://chat.example.com  # Your ClawChat public URL
```

### 3. Restart OpenClaw

```bash
openclaw gateway restart
```

## How It Works

1. **User sends message** via ClawChat web UI
2. **ClawChat stores message** in SQLite, broadcasts via SSE
3. **OpenClaw polls** or receives webhook from ClawChat
4. **OpenClaw processes** the message with the configured AI model
5. **OpenClaw responds** via ClawChat's Agent API (`POST /send`)
6. **ClawChat broadcasts** the agent response via SSE to all connected clients

## Agent API Endpoints

These are called by OpenClaw (localhost only, no auth):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/send` | POST | Send a message as the agent |
| `/upload` | POST | Send a message with file attachment |
| `/messages/:id` | DELETE | Delete a message |
| `/messages/:id` | PATCH | Edit a message |
| `/health` | GET | Health check |

### Example: Send a Message

```bash
curl -X POST http://127.0.0.1:3100/send \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello from the agent!"}'
```

## Tools Available to OpenClaw

When ClawChat is configured, OpenClaw gains these tools:

- `clawchat_send` — Send a message (supports markdown + widget blocks)
- `clawchat_edit` — Edit a previously sent message
- `clawchat_delete` — Delete a message
- `clawchat_messages` — Get recent message history
- `clawchat_widget_state` — Get/set server-side state for interactive widgets

## Widgets

ClawChat supports interactive widgets via markdown code blocks. See [widgets.md](./widgets.md) for details.

Example (agent can send this):

````markdown
```widget
type: poll
question: "What should we build next?"
options:
  - Push notifications
  - Dark mode
  - File sharing
```
````

## Multiple Instances

You can run multiple ClawChat instances for different purposes:

- Personal assistant chat
- Team/group chat
- Project-specific workspace

Each needs its own:
- Domain/subdomain
- ClawChat server instance
- OpenClaw channel config entry
