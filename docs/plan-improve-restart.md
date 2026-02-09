# Improve Server Restart Resilience

> **Status: Draft**

## Problem

The agent (eliezer) is self-modifying — it edits code and restarts the server regularly. The current SSE reconnection is fragile:

1. **3s reconnect delay** — too slow for a millisecond restart
2. **No message re-fetch** — messages sent during the gap are silently lost
3. **No exponential backoff** — if server is down longer, client hammers with retries

## Requirements

- Server restart should be invisible to the user
- No messages lost during restart
- Fast reconnect (< 1 second for normal restarts)
- Backoff for longer outages (server actually down)

## Changes

### SSE reconnection (`client/src/Main.tsx`)

```
connectSSE():
  on error:
    close EventSource
    attempt reconnect after 500ms
    on success:
      re-fetch all messages from /api/messages
      reset retry delay
    on failure:
      exponential backoff: 500ms → 1s → 2s → 4s (cap at 5s)
```

- Re-fetch messages on every successful reconnect
- Short initial delay (500ms) for normal restarts
- Backoff with cap for longer outages
- The agent-offline header indicator already shows connection status

### Optional: restart endpoint

`POST /api/restart` — agent calls this instead of `docker compose restart`. Server responds 200, then exits. Docker restarts it. Cleaner than shelling out.

## Scope

Small change — ~20 lines in Main.tsx SSE reconnection logic. No server changes needed (unless adding restart endpoint).
