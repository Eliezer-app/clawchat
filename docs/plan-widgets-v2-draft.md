# Widgets v2: Static Pages with Server-Side Code

> **Status: Draft** — design brainstorm, not finalized

## Problem

Widgets are currently inlined — server reads HTML files, embeds them in chat messages, client renders in `srcdoc` iframes with injected JS framework. This prevents widgets from loading external assets (CSS, JS, images) and limits them to single-file apps.

## Vision

The agent creates arbitrarily complex web apps: frontend (HTML/CSS/JS) + backend (TypeScript handlers). Each app is a directory with static files and optional server-side code.

## Architecture

```
apps/
  todos/
    public/              ← served at /widget/todos/
      index.html         ← main view
      view-only.html     ← another view into same app
      style.css
      app.js
    index.mts            ← server-side action handlers (TypeScript)
    logs/                ← widget.log() output
```

### Message format

Agent sends: `widget:todos/index.html` — chat renders as iframe.

### Static serving

`/widget/*` route serves `apps/*/public/*` via `express.static`. Behind auth middleware. Vite dev proxy forwards `/widget/` to server.

New files appear instantly — `express.static` resolves on each request.

### Iframe embedding

```html
<iframe src="/widget/todos/index.html" sandbox="allow-scripts allow-same-origin">
```

- `allow-same-origin`: parent can access iframe's contentDocument
- Resize: parent-side ResizeObserver on `iframe.contentDocument.body` — zero widget code needed, all widgets auto-resize
- Fullscreen: open `/widget/todos/index.html` in new tab — it's just a page

### API — no library, just REST endpoints

Widgets call endpoints directly via `fetch()`. No JS framework injected, no `widget-api.js` required. A reference `widget-api.js` exists as a guide.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/app-state/:convId/:appId` | GET | Read app state |
| `/api/app-state/:convId/:appId` | POST | Write app state |
| `/api/app-action/:convId/:appId` | POST | Call server action `{ action, payload }` |
| `/api/widget-log` | POST | Write to log file `{ widgetPath, data }` |

### Server-side code

Agent writes `apps/todos/index.mts` with exported action handlers:

```ts
export const getItems = async ({ payload, appId }) => {
  // read from file, database, external API, etc.
  return items;
};

export const addItem = async ({ payload }) => {
  // write to storage
  return { ok: true };
};
```

**Loading**: at server startup, scan `apps/*/index.mts`, transpile with esbuild, import, register as action handlers.

**Hot-reload**: agent restarts the server after modifying code. Restart takes milliseconds. SSE reconnects automatically. No eval, no file watching, no memory leak risk.

### ConversationId

Widget needs conversationId for API calls. Parent includes it in iframe URL: `/widget/todos/index.html?c=default`.

## Changes

### Delete
- `client/src/widget/wrapper.ts` — framework injection
- `client/src/widget/parser.ts` — inline widget extraction
- `client/src/widget/launcher.ts` — fullscreen via message fetch
- `client/src/WidgetPage.tsx` — fullscreen SolidJS wrapper
- Widget route in `client/src/index.tsx`
- `expandWidgetFiles`, `expandMessage` in server

### Rewrite
- `client/src/components/Widget.tsx` — simple iframe + ResizeObserver (~40 lines)

### Edit
- `server/src/index.ts` — static serving, remove expansion, app handler loading
- `client/src/Main.tsx` — detect `widget:path` in renderContent
- `client/src/components/MessageBubble.tsx` — fullscreen = open URL
- `shared/src/widget.ts` — simplify types
- `client/vite.config.ts` — add `/widget` proxy
- `docs/widgets.md` — rewrite

### New
- `server/src/widget-api.js` — reference/guide (optional include)

## Phase 2

Auto-extract inline widgets: agent writes `widget\n<html>` in message, server saves to `apps/_inline/<msg-id>/public/index.html`. All widgets are URL-based from client's perspective.

## Open Questions

- Per-app SQLite database? Or is app-state (JSON blob) sufficient?
- Existing widget migration: `apps/drummachine/sequencer.html` → `apps/drummachine/public/sequencer.html`
- Should `widget-api.js` be in `apps/_lib/` or served from a special route?
