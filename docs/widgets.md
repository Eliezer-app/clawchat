# Widgets

Widgets are interactive HTML/JS components embedded in chat messages.

## Embedding Widgets

### Inline Widget

Embed HTML directly in a message:

~~~markdown
```widget
<html>...</html>
```
~~~

### File-based Widget

Reference an HTML file from the `apps/` directory:

~~~markdown
```widget:globe/widgets/explorer.html
```
~~~

The server expands file references to inline HTML when serving messages. Path traversal (`..`) is blocked.

## Framework

A framework is auto-injected that handles resize detection, state management, and server requests.

## Framework API

### widget.onState(callback)
Register a callback to receive state updates.

```javascript
widget.onState(state => {
  tasks = state?.tasks || [];
  render();
});
widget.getState(APP_ID);
```

### widget.getState(appId)
Request current state from server. Call after registering onState callback.

```javascript
widget.getState(APP_ID);
```

### widget.setState(appId, state)
Save state to the server.

```javascript
widget.setState(APP_ID, { tasks });
```

### widget.request(appId, action, payload)
Make a server request. Returns a promise.

```javascript
const result = await widget.request(APP_ID, 'vote', { option: 'A' });
```

## Best Practice: Define App ID

Define the app ID as a top-level constant for clarity and consistency:

```javascript
const APP_ID = 'my-todo-app';

// Then use it in all state calls
widget.getState(APP_ID);
widget.setState(APP_ID, { tasks });
widget.request(APP_ID, 'addTask', { text: 'New task' });
```

Widgets with the same app ID share state. This is intentional - multiple widgets can be views into the same app.

## Auto Features

- **Resize** - ResizeObserver auto-reports height changes
- **CSS reset** - `box-sizing: border-box`, no margin/padding on body
- **Sandbox** - Runs in `sandbox="allow-scripts"` iframe
- **Live sync** - When one widget updates state, other widgets with the same appId automatically receive the new state via their `onState` callback

## Message Protocol

| Direction | Type | Fields |
|-----------|------|--------|
| Widget → Parent | `getState` | `appId` |
| Widget → Parent | `setState` | `appId`, `state` |
| Widget → Parent | `resize` | `height` |
| Widget → Parent | `request` | `id`, `appId`, `action`, `payload` |
| Parent → Widget | `state` | `state` |
| Parent → Widget | `response` | `id`, `data`, `error?` |
| Parent → Widget | `stateUpdated` | `appId` (triggers auto re-fetch) |

## Example: Todo List

```widget
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
        widget.setState(APP_ID, { tasks });
      }
    }

    widget.onState(state => {
      tasks = state?.tasks || [];
      render();
    });
    widget.getState(APP_ID);
  </script>
</body>
</html>
```

## Example: Stateless Counter

Widgets without state work fine - just don't use state methods:

```widget
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui; padding: 16px; display: flex; gap: 16px; align-items: center; }
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

## Lifecycle

- **Created** when approaching viewport (200px before visible)
- **Stays loaded** once created (not unloaded on scroll)
- Scroll stays at bottom as widgets resize during page load

## Server-Side Actions

Register custom action handlers in `server/src/index.ts`:

```typescript
import { registerAppAction } from './index.js';

registerAppAction('getWeather', ({ conversationId, appId, payload }) => {
  const { city } = payload as { city?: string };
  if (!city) {
    return { error: 'City required' };
  }
  // Return data (will be wrapped in { ok: true, result: ... })
  return { city, temp: 22, description: 'Sunny' };
});
```

Call from widget:

```javascript
const weather = await widget.request('my-app', 'getWeather', { city: 'London' });
console.log(weather.temp); // 22
```

### Handler Context

| Field | Description |
|-------|-------------|
| `conversationId` | Current conversation |
| `appId` | App ID from request |
| `payload` | Request payload object |

### Return Values

- Return an object → success response with `{ ok: true, result: <your object> }`
- Return `{ error: 'message' }` → error response
- Throw an error → error response with error message

## Fullscreen Mode

Click the ⧉ button on a widget to open it in a new tab at `/message/:id/widget`. The widget fills the viewport and the framework sets:

- `document.body.classList.add('widget-fullscreen')`
- CSS variable `--widget-layout: fullscreen`

Use these to adapt layout:

```css
body { height: 450px; }
body.widget-fullscreen { height: 100%; }
```

```javascript
const isFullscreen = getComputedStyle(document.documentElement)
  .getPropertyValue('--widget-layout').trim() === 'fullscreen';
```
