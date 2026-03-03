#!/bin/bash
# Manage Chrome split-screen panels.
# Usage:
#   chrome-panel.sh right <url>    — open URL on right half
#   chrome-panel.sh left <url>     — open URL on left half
#   chrome-panel.sh close-right    — close right panel
#   chrome-panel.sh close-left     — close left panel
#
# Requires: Accessibility permissions for osascript (System Events)

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 left|right|close-left|close-right [url]"
  exit 1
fi
SIDE="$1"
URL="$2"
PROFILE="Default"

# Screen geometry (detect dynamically)
read SCREEN_W SCREEN_H <<< "$(system_profiler SPDisplaysDataType -json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for d in data['SPDisplaysDataType']:
  for nd in d.get('spdisplays_ndrvs', []):
    res = nd.get('_spdisplays_resolution', '')
    w, h = res.split(' @ ')[0].split(' x ')
    print(f'{w.strip()} {h.strip()}')
    sys.exit()
")"
HALF=$((SCREEN_W / 2))

case "$SIDE" in
  left)       X=0;     W=$HALF; CLOSE_SIDE=left ;;
  right)      X=$HALF; W=$HALF; CLOSE_SIDE=right ;;
  close-left)  CLOSE_SIDE=left ;;
  close-right) CLOSE_SIDE=right ;;
  *) echo "Unknown side: $SIDE" >&2; exit 1 ;;
esac

close_panel() {
  local side=$1
  local min_x max_x
  if [ "$side" = "left" ]; then
    min_x=0; max_x=$((HALF - 1))
  else
    min_x=$HALF; max_x=$SCREEN_W
  fi
  osascript -e "
    tell application \"System Events\"
      tell process \"Google Chrome\"
        repeat with w in (every window)
          set {wx, wy} to position of w
          if wx >= $min_x and wx < $max_x then
            click button 1 of w
            return true
          end if
        end repeat
      end tell
    end tell
    return false"
}

# Close existing window at that position
close_panel "${CLOSE_SIDE}"

# If just closing, we're done
if [ "$SIDE" = "close-left" ] || [ "$SIDE" = "close-right" ]; then
  exit 0
fi

[ -z "$URL" ] && { echo "URL required" >&2; exit 1; }

# Open new window
open -na "Google Chrome" --args --profile-directory="$PROFILE" --new-window "$URL"
sleep 1

# Position the new window (it has focus, so it's window 1)
osascript -e "
tell application \"System Events\"
  tell process \"Google Chrome\"
    set position of window 1 to {$X, 0}
    set size of window 1 to {$W, $SCREEN_H}
  end tell
end tell"
