# Widgets

Widgets are interactive HTML/JS components embedded in chat messages via iframes.

## Embedding Widgets

### File-based Widget

Create `apps/<name>/public/index.html`, then embed in a message:

```
<iframe src="/widget/<name>/"></iframe>
```

The server serves static files from `apps/<name>/public/` at `/widget/<name>/`.

### Inline Widget (data URL)

Embed HTML directly as a base64 data URL:

```
<iframe src="data:text/html;base64,PCFET0NUWVB..."></iframe>
```

Inline widgets have no state (opaque origin — no API access). Use for simple, self-contained content.

## API

Widgets use standard REST calls. State is scoped by app ID.

### Read State

```javascript
const APP_ID = 'my-app';

const res = await fetch(`/api/app-state/${APP_ID}`);
const data = await res.json(); // { state: {...}, version: N }
```

### Write State

```javascript
await fetch(`/api/app-state/${APP_ID}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ state: { tasks } }),
});
```

### Logging

```javascript
fetch('/api/widget-log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ widgetPath: 'my-app', data: { msg: 'hello' } }),
}).catch(() => {});
```

Logs are written to `server/data/widget-logs/`.

## Auto Features

- **Resize** — Parent-side ResizeObserver auto-sizes the iframe to fit content (file-based only)
- **Injected CSS** — `html, body { height: auto; min-height: 0; overflow: hidden; }` prevents scrollbars and viewport unit issues
- **Sandbox** — File-based: none (same-origin, full trust). Data URL: `allow-scripts` only
- **Lazy loading** — Widgets are created when within 500px of the viewport and destroyed when scrolled away

## Shared State

Widgets with the same `APP_ID` share state. Multiple widgets can be views into the same app data. When one widget updates state, the server broadcasts an SSE event so other widgets can re-fetch.

## Example: Counter (data URL, no state)

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui; padding: 16px; display: flex; gap: 16px; align-items: center; color: white; }
    button { padding: 8px 16px; font-size: 16px; }
    span { font-size: 24px; min-width: 40px; text-align: center; }
  </style>
</head>
<body>
  <button onclick="count--; update()">-</button>
  <span id="v">0</span>
  <button onclick="count++; update()">+</button>
  <script>
    let count = 0;
    const update = () => document.getElementById('v').textContent = count;
  </script>
</body>
</html>
```

Base64-encode and embed as `<iframe src="data:text/html;base64,...">`.

## Example: File-based Widget with State

`apps/todo/public/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui; padding: 16px; }
    input { padding: 8px; margin-right: 8px; }
    button { padding: 8px 16px; }
    ul { list-style: none; padding: 0; margin-top: 12px; }
    li { padding: 8px; background: #f5f5f5; margin: 4px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <input id="inp" placeholder="Add task..." />
  <button onclick="add()">Add</button>
  <ul id="list"></ul>
  <script>
    const APP_ID = 'todo';
    let tasks = [];

    async function loadState() {
      try {
        const res = await fetch(`/api/app-state/${APP_ID}`);
        if (res.ok) {
          const data = await res.json();
          tasks = data.state?.tasks || [];
          render();
        }
      } catch {}
    }

    function saveState() {
      fetch(`/api/app-state/${APP_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: { tasks } }),
      }).catch(() => {});
    }

    function render() {
      document.getElementById('list').innerHTML =
        tasks.map(t => `<li>${t}</li>`).join('');
    }

    function add() {
      const inp = document.getElementById('inp');
      if (inp.value.trim()) {
        tasks.push(inp.value.trim());
        inp.value = '';
        render();
        saveState();
      }
    }

    loadState();
  </script>
</body>
</html>
```

Embed: `<iframe src="/widget/todo/"></iframe>`

## Fullscreen

The ⧉ button on widget messages opens the widget in a new browser tab.

## File Structure

```
apps/
  mywidget/
    public/
      index.html    # Entry point, served at /widget/mywidget/
      style.css     # Optional additional files
      ...
```
