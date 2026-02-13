#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../client/public"

for size in 180 192 512; do
  rsvg-convert -w "$size" -h "$size" icon.svg -o "icon-${size}.png"
  echo "icon-${size}.png"
done
