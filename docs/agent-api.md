# Agent API

The Agent API runs on `127.0.0.1:3100` (localhost only) and allows programmatic control of the chat.

## Endpoints

### GET /messages
List all messages, optionally filtered by search term.

```bash
# List all messages
wget -qO- 'http://127.0.0.1:3100/messages'

# Search messages
wget -qO- 'http://127.0.0.1:3100/messages?search=widget'
```

### POST /send
Send a message as the agent.

```bash
wget -qO- --post-data='{"content":"Hello from agent"}' \
  --header='Content-Type: application/json' \
  'http://127.0.0.1:3100/send'
```

### POST /upload
Send a message with file attachment.

```bash
curl -F "file=@image.png" -F "content=Check this out" \
  http://127.0.0.1:3100/upload
```

### PATCH /messages/:id
Update a message's content.

```bash
# See "Updating Messages from Docker" below
```

### DELETE /messages/:id
Delete a message.

```bash
wget -qO- --method=DELETE 'http://127.0.0.1:3100/messages/{id}'
```

### GET /health
Health check.

```bash
wget -qO- 'http://127.0.0.1:3100/health'
```

## Updating Messages from Docker

The Agent API binds to localhost inside the container, so you need to run requests from within the container. BusyBox wget doesn't support PATCH, so use node:

```bash
# 1. Create a JSON file with the update
cat > /tmp/update.json << 'EOF'
{"content":"Updated message content"}
EOF

# 2. Copy to container and run PATCH via node
docker cp /tmp/update.json clawchat-server-1:/tmp/update.json

docker compose exec server node -e "
const http = require('http');
const fs = require('fs');
const data = fs.readFileSync('/tmp/update.json');
const req = http.request({
  hostname: '127.0.0.1',
  port: 3100,
  path: '/messages/MESSAGE_ID_HERE',
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(res.statusCode, body));
});
req.write(data);
req.end();
"
```

Or write the JSON directly to the mounted data directory:

```bash
# Write JSON to server/data (mounted in container)
cat > server/data/update.json << 'EOF'
{"content":"Updated content"}
EOF

# Run from container
docker compose exec server node -e "
const http = require('http');
const fs = require('fs');
const data = fs.readFileSync('/app/server/data/update.json');
const req = http.request({
  hostname: '127.0.0.1',
  port: 3100,
  path: '/messages/MESSAGE_ID',
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(res.statusCode, body));
});
req.write(data);
req.end();
"

# Clean up
rm server/data/update.json
```
