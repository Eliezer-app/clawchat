#!/bin/bash
# Update a message via the Agent API
# Usage: echo "new content" | ./scripts/update-message.sh <message-id>
#        ./scripts/update-message.sh <message-id> < file.txt

set -e

MESSAGE_ID="$1"

if [ -z "$MESSAGE_ID" ]; then
  echo "Usage: echo 'content' | $0 <message-id>"
  echo "       $0 <message-id> < content.txt"
  exit 1
fi

# Read content from stdin
CONTENT=$(cat)

if [ -z "$CONTENT" ]; then
  echo "Error: No content provided via stdin"
  exit 1
fi

# Create JSON payload using node
JSON=$(printf '%s' "$CONTENT" | node -e "
  let data = '';
  process.stdin.on('data', d => data += d);
  process.stdin.on('end', () => console.log(JSON.stringify({content: data})));
")

echo "Updating message $MESSAGE_ID..."

# Write to container and execute PATCH
echo "$JSON" | docker compose exec -T server node -e "
const http = require('http');
let data = '';
process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const req = http.request({
    hostname: '127.0.0.1',
    port: 3100,
    path: '/messages/$MESSAGE_ID',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  }, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      if (res.statusCode === 200) {
        const msg = JSON.parse(body);
        console.log('Updated:', msg.content.substring(0, 60).replace(/\n/g, '\\\\n') + '...');
      } else {
        console.error('Error:', res.statusCode, body);
        process.exit(1);
      }
    });
  });
  req.write(data);
  req.end();
});
"
