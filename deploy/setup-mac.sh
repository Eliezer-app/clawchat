#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== ClawChat Mac Setup ==="
echo "Directory: $REPO_DIR"
echo

# Check dependencies
for cmd in node pnpm; do
  if ! command -v $cmd &>/dev/null; then
    echo "ERROR: $cmd not found. Install with: brew install $cmd"
    exit 1
  fi
done

echo "Node: $(node -v)"
echo "pnpm: $(pnpm -v)"
echo

# Install and build
echo "--- Installing dependencies ---"
cd "$REPO_DIR"
pnpm install

echo
echo "--- Building client ---"
pnpm --filter @clawchat/client build

echo
echo "--- Building server ---"
pnpm --filter @clawchat/server build

# Env file
if [ ! -f "$REPO_DIR/.env" ]; then
  cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
  echo
  echo "Created .env from .env.example — edit it before starting:"
  echo "  $REPO_DIR/.env"
fi

# Data directories
mkdir -p "$REPO_DIR/server/data"

echo
echo "=== Done ==="
echo
echo "Start:"
echo "  cd $REPO_DIR && pnpm --filter @clawchat/server start"
echo
echo "Or with widget server:"
echo "  pnpm --filter @clawchat/server start & pnpm --filter @clawchat/widget-server start"
