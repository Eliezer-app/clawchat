# Smart Widgets

Widgets are interactive HTML/JS apps embedded in chat messages using ```` ```widget ```` syntax.

## Basic Widget

```widget
<style>body { margin: 0; font: 16px sans-serif; }</style>
<div id="app">Hello</div>
<script>
  // Your code here
</script>
```

Widgets run in sandboxed iframes (`sandbox="allow-scripts"`). No network access, no parent DOM access.

## Lifecycle

- **Created** when scrolled into view (10% visible)
- **Destroyed** when scrolled out of view
- Placeholder preserves height to prevent scroll jumping

## State Persistence

Opt in by sending a `ready` message with a unique widget ID:

```js
// 1. Listen for init FIRST
window.addEventListener('message', e => {
  if (e.data.type === 'init') {
    const savedState = e.data.state;  // null on first load
    // Initialize your app
  }
});

// 2. Register for state
parent.postMessage({ type: 'ready', id: 'my-widget-v1' }, '*');

// 3. Save state (debounced 500ms, max 1MB)
parent.postMessage({ type: 'state', state: { count: 42 }, version: 1 }, '*');
```

State syncs across devices and persists across page refreshes.

**Note:** Widgets with the same ID share state. Use unique IDs per widget instance, or use shared IDs intentionally for linked widgets.

## Resize

Request height changes (min 60px, max 800px):

```js
parent.postMessage({ type: 'resize', height: 400 }, '*');
```

## Server Requests

Call backend actions (registered server-side via `registerWidgetAction()`):

```js
// Send request
const reqId = Math.random();
parent.postMessage({
  type: 'request',
  id: reqId,
  action: 'fetch-data',
  payload: { query: 'test' }
}, '*');

// Receive response
window.addEventListener('message', e => {
  if (e.data.type === 'response' && e.data.id === reqId) {
    if (e.data.error) console.error(e.data.error);
    else console.log(e.data.data);
  }
});
```

## Message Types Summary

| Direction | Type | Fields |
|-----------|------|--------|
| Widget → Parent | `ready` | `id` (widget ID) |
| Widget → Parent | `state` | `state`, `version` |
| Widget → Parent | `resize` | `height` |
| Widget → Parent | `request` | `id`, `action`, `payload` |
| Parent → Widget | `init` | `state`, `stateVersion` |
| Parent → Widget | `response` | `id`, `data`, `error?` |

## Tips

- Use deterministic widget IDs (e.g., `network-viz-v1`) for state to persist correctly
- Send `resize` after content renders for proper sizing
- "Dumb" widgets (no `ready` call) work fine, just no persistence
- Keep state small - 1MB limit enforced server-side
