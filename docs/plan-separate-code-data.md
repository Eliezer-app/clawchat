# Separate code and data in apps/

## Problem

`apps/` mixes code (widget HTML/JS, owned by root) and data (logs, compiled handlers, written by the clawchat service user). This forces `apps/` to be writable by the app, violating the principle that application code should be read-only for the process.

## Current

```
apps/
  mywidget/
    public/index.html     ← code (root)
    logs/2025-02-11.log   ← data (clawchat)
    .handler.mjs          ← data (clawchat)
```

## Plan

Move all server-written data out of `apps/` into `server/data/`:

- Widget logs: `apps/<name>/logs/` → `server/data/widget-logs/<name>/`
- Compiled handlers: `apps/<name>/.handler.mjs` → `server/data/handlers/<name>.mjs`

After this, `apps/` is entirely code — owned by root, read-only for clawchat.

## Changes

### `server/src/index.ts`

- Widget log endpoint: change `logDir` from `path.join(appsDir, widgetPath, 'logs')` to `path.join(dataDir, 'widget-logs', widgetPath)`
- `loadAppHandlers`: change `tmpFile` from `path.join(appsDir, entry.name, '.handler.mjs')` to `path.join(dataDir, 'handlers', entry.name + '.mjs')`
- Add `dataDir` derived from `DB_PATH` dirname or a new env var

### `deploy/Makefile`

- Remove `apps/` from clawchat ownership
- `server/data/` already owned by clawchat — covers the new paths

### `docs/widgets.md`

- Update log path reference

## Migration

On deployed instances, run after code update:

```bash
# Move existing widget logs
for d in /opt/clawchat/apps/*/logs; do
  name=$(basename $(dirname "$d"))
  mkdir -p /opt/clawchat/server/data/widget-logs/$name
  mv "$d"/* /opt/clawchat/server/data/widget-logs/$name/ 2>/dev/null
  rmdir "$d" 2>/dev/null
done

# Remove compiled handler temp files
rm -f /opt/clawchat/apps/*/.handler.mjs

# Fix ownership
chown -R clawchat:clawchat /opt/clawchat/server/data
chown -R root:root /opt/clawchat/apps
```

Add as a `migrate` target in `deploy/Makefile` so it runs once on deploy.

## Permissions after

```
/opt/clawchat/
  apps/                    ← root:root (read-only for clawchat)
  server/data/             ← clawchat:clawchat
    chat.db
    widget-logs/
    handlers/
  .env                     ← clawchat:clawchat
```
