# Widgets v2: Static Pages with Server-Side Code

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
| `/api/app-state/:appId` | GET | Read app state |
| `/api/app-state/:appId` | POST | Write app state |
| `/api/widget-log` | POST | Write to log file `{ widgetPath, data }` |
| `/widget/:app/api/*` | * | App-specific server-side routes (from `index.mts`) |

### Server-side code

Agent writes `apps/todos/index.mts` exporting a default function that receives an Express Router:

```ts
export default (router) => {
  router.get('/items', (req, res) => { /* ... */ });
  router.post('/items', (req, res) => { /* ... */ });
};
```

Mounted at `/widget/todos/api/`. Widget calls `fetch('/widget/todos/api/items')`.

**Loading**: at server startup, scan `apps/*/index.mts`, transpile with esbuild, import, mount router.

**Hot-reload**: agent restarts the server after modifying code. Restart takes milliseconds. SSE reconnects automatically. No eval, no file watching, no memory leak risk.

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
- `apps/common/public/widget-api.js` — optional JS library (`getState`, `setState`, `log`)

## Data: `apps/common/apps.db`

Widget state is currently in `server/data/chat.db` (`app_state` table). Move it to a dedicated `apps/common/apps.db` so all widget data lives under `apps/`. This keeps the main db for chat concerns (messages, sessions) and widget data separate and portable.

- Single shared db for all apps — not per-app
- `widget-api.js` in `apps/common/public/`
- `apps/common/` is tracked in git (except `*.db`)

## TODO

- [ ] Remove conversationId completely — partially removed from widget API routes (hardcoded to `'default'`), still in `shared/src/widget.ts` URL helper, db schema, and message system
- [ ] Update agent prompt — teach agent how to create widgets (in agent project)
- [ ] Server-side handlers — loading mechanism exists (`loadAppHandlers`), no apps use it yet
- [ ] Move app_state table from main db into `apps/common/apps.db`
