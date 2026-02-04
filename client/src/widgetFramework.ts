// Widget Framework - injected into widget iframes
// Provides automatic resize detection, state management, and request handling

const WIDGET_CSS_RESET = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; overflow: hidden; }
`;

const WIDGET_FRAMEWORK_JS = `
(function() {
  'use strict';

  const widget = window.widget = {};
  let stateCallback = null;
  let requestId = 0;
  const pendingRequests = new Map();
  let lastHeight = 0;

  // Report height to parent
  function reportHeight() {
    const height = document.body.scrollHeight;
    if (height !== lastHeight) {
      lastHeight = height;
      parent.postMessage({ type: 'resize', height }, '*');
    }
  }

  // Set up ResizeObserver for auto-resize detection
  function setupResizeObserver() {
    new ResizeObserver(() => reportHeight()).observe(document.body);
    new MutationObserver(() => setTimeout(reportHeight, 0)).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }

  // Handle messages from parent
  window.addEventListener('message', (e) => {
    const { type, state, id, data, error } = e.data || {};

    if (type === 'state' && stateCallback) {
      stateCallback(state);
    }

    if (type === 'response' && pendingRequests.has(id)) {
      const { resolve, reject } = pendingRequests.get(id);
      pendingRequests.delete(id);
      error ? reject(new Error(error)) : resolve(data);
    }
  });

  // Register callback for state updates
  widget.onState = function(callback) {
    stateCallback = callback;
  };

  // Request current state from parent (manual call)
  widget.getState = function() {
    parent.postMessage({ type: 'getState' }, '*');
  };

  // Save state to parent
  widget.setState = function(state) {
    parent.postMessage({ type: 'setState', state }, '*');
  };

  // Make a request to the server
  widget.request = function(action, payload) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pendingRequests.set(id, { resolve, reject });
      parent.postMessage({ type: 'request', id, action, payload }, '*');
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  };

  // Initialize
  function init() {
    setupResizeObserver();
    reportHeight();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;

// Extract widget ID from code comment or generate hash
function extractWidgetId(code: string): string {
  const match = code.match(/widget-id:\s*([\w-]+)/i);
  if (match) return match[1];

  // Hash the code for consistent ID
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = ((hash << 5) - hash) + code.charCodeAt(i);
    hash |= 0;
  }
  return 'w' + Math.abs(hash).toString(36);
}

// Wrap widget HTML with framework
export function wrapWidgetHtml(html: string): string {
  const hasHtmlTag = /<html[\s>]/i.test(html);
  const hasHeadTag = /<head[\s>]/i.test(html);

  if (hasHtmlTag) {
    let result = html;
    if (hasHeadTag) {
      result = result.replace(/<head([^>]*)>/i, `<head$1><style>${WIDGET_CSS_RESET}</style><script>${WIDGET_FRAMEWORK_JS}</script>`);
    } else {
      result = result.replace(/<html([^>]*)>/i, `<html$1><head><style>${WIDGET_CSS_RESET}</style><script>${WIDGET_FRAMEWORK_JS}</script></head>`);
    }
    return result;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${WIDGET_CSS_RESET}</style>
<script>${WIDGET_FRAMEWORK_JS}</script>
</head>
<body>
${html}
</body>
</html>`;
}

export { extractWidgetId };
