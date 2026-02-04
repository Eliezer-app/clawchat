# Widgets

Widgets are interactive HTML/JS components embedded in chat messages:

~~~markdown
```widget
<html>...</html>
```
~~~

A framework is auto-injected that handles resize detection. State and request APIs are available but must be explicitly used.

## Framework API

### widget.onState(callback)
Register a callback to receive state updates.

```javascript
widget.onState(state => {
  tasks = state?.tasks || [];
  render();
});
widget.getState(); // fetch initial state
```

### widget.setState(state)
Save state to the server.

```javascript
widget.setState({ tasks });
```

### widget.getState()
Request current state from server. Call after registering onState callback.

```javascript
widget.getState();
```

### widget.request(action, payload)
Make a server request. Returns a promise.

```javascript
const result = await widget.request('vote', { option: 'A' });
```

## Widget ID

Add a comment to set a stable ID for state persistence:

```javascript
// widget-id: my-todo-list
```

Widgets with the same ID share state. If omitted, ID is derived from code hash.

## Auto Features

- **Resize** - ResizeObserver auto-reports height changes
- **CSS reset** - `box-sizing: border-box`, no margin/padding on body
- **Sandbox** - Runs in `sandbox="allow-scripts"` iframe

## Message Protocol

| Direction | Type | Fields |
|-----------|------|--------|
| Widget → Parent | `getState` | - |
| Widget → Parent | `setState` | `state` |
| Widget → Parent | `resize` | `height` |
| Widget → Parent | `request` | `id`, `action`, `payload` |
| Parent → Widget | `state` | `state` |
| Parent → Widget | `response` | `id`, `data`, `error?` |

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
    // widget-id: todo
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
        widget.setState({ tasks });
      }
    }

    widget.onState(state => {
      tasks = state?.tasks || [];
      render();
    });
    widget.getState();
  </script>
</body>
</html>
```

## Example: Stateless Counter

Widgets without state work fine - just don't use `widget.onState`/`widget.setState`:

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
