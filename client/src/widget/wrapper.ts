// Widget HTML wrapping - injects framework into widget HTML

import { WidgetMessageType, WidgetApi } from '@clawchat/shared';

const CSS_RESET_BASE = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
`;

const CSS_RESET_IFRAME = CSS_RESET_BASE + `
  html, body { overflow: hidden; }
  :root { --widget-layout: embedded; }
`;

const CSS_RESET_FULLSCREEN = CSS_RESET_BASE + `
  html, body { height: 100% !important; min-height: 100% !important; }
  :root { --widget-layout: fullscreen; }
`;

// Shared widget API
const WIDGET_API_SHARED = `
  const widget = window.widget = {};
  let stateCallback = null;
  const trackedAppIds = new Set();

  widget.onState = function(callback) {
    if (typeof callback !== 'function') {
      reportError('onState requires a function callback');
      return;
    }
    stateCallback = callback;
  };
`;

// Framework for iframe - uses postMessage
function createWidgetFramework(mode: 'embedded' | 'fullscreen'): string {
  return `
(function() {
  'use strict';

  const LAYOUT_MODE = '${mode}';
  let lastHeight = 0;
  let requestId = 0;
  const pendingRequests = new Map();

  function reportError(message, stack) {
    parent.postMessage({
      type: '${WidgetMessageType.ERROR}',
      error: message,
      stack: stack || new Error().stack
    }, '*');
  }

  // Wrap in try-catch to report initialization errors
  try {
    ${WIDGET_API_SHARED}

    function reportHeight() {
      const height = document.body.scrollHeight;
      if (height !== lastHeight) {
        lastHeight = height;
        parent.postMessage({ type: '${WidgetMessageType.RESIZE}', height }, '*');
      }
    }

    function setupResizeObserver() {
      new ResizeObserver(() => reportHeight()).observe(document.body);
      new MutationObserver(() => setTimeout(reportHeight, 0)).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }

    window.addEventListener('message', (e) => {
      try {
        const { type, state, id, data, error, appId } = e.data || {};

        if (type === '${WidgetMessageType.STATE}' && stateCallback) {
          stateCallback(state);
        }

        if (type === '${WidgetMessageType.RESPONSE}' && pendingRequests.has(id)) {
          const { resolve, reject } = pendingRequests.get(id);
          pendingRequests.delete(id);
          if (error) {
            reject(new Error(error));
          } else if (data && !data.ok) {
            reject(new Error(data.error || 'Request failed'));
          } else {
            resolve(data?.result);
          }
        }

        if (type === '${WidgetMessageType.STATE_UPDATED}' && appId && trackedAppIds.has(appId)) {
          widget.getState(appId);
        }
      } catch (err) {
        reportError('Message handler error: ' + err.message, err.stack);
      }
    });

    widget.getState = function(appId) {
      if (!appId || typeof appId !== 'string') {
        reportError('getState: appId must be a non-empty string');
        return;
      }
      trackedAppIds.add(appId);
      parent.postMessage({ type: '${WidgetMessageType.GET_STATE}', appId }, '*');
    };

    widget.setState = function(appId, state) {
      if (!appId || typeof appId !== 'string') {
        reportError('setState: appId must be a non-empty string');
        return;
      }
      parent.postMessage({ type: '${WidgetMessageType.SET_STATE}', appId, state }, '*');
    };

    widget.request = function(appId, action, payload) {
      if (!appId || typeof appId !== 'string') {
        return Promise.reject(new Error('request: appId must be a non-empty string'));
      }
      if (!action || typeof action !== 'string') {
        return Promise.reject(new Error('request: action must be a non-empty string'));
      }
      return new Promise((resolve, reject) => {
        const id = ++requestId;
        pendingRequests.set(id, { resolve, reject });
        parent.postMessage({ type: '${WidgetMessageType.REQUEST}', id, appId, action, payload }, '*');
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error('Request timeout after 30s'));
          }
        }, 30000);
      });
    };

    function init() {
      document.body.classList.add('widget-' + LAYOUT_MODE);
      setupResizeObserver();
      reportHeight();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    // Report height again after all resources (scripts, images) have loaded
    window.addEventListener('load', () => reportHeight());

    // Catch unhandled errors
    window.onerror = function(msg, url, line, col, err) {
      reportError(msg + ' at line ' + line, err?.stack);
    };
    window.onunhandledrejection = function(e) {
      reportError('Unhandled promise rejection: ' + e.reason, e.reason?.stack);
    };

  } catch (err) {
    reportError('Widget initialization error: ' + err.message, err.stack);
  }
})();
`;
}

// Inject CSS and JS into HTML document
function injectIntoHtml(html: string, css: string, js: string): string {
  const hasHtmlTag = /<html[\s>]/i.test(html);
  const hasHeadTag = /<head[\s>]/i.test(html);

  const injection = `<style>${css}</style><script>${js}</script>`;

  if (hasHtmlTag) {
    if (hasHeadTag) {
      return html.replace(/<head([^>]*)>/i, `<head$1>${injection}`);
    }
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${injection}</head>`);
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${injection}
</head>
<body>
${html}
</body>
</html>`;
}

// Wrap widget HTML for iframe embedding
// mode: 'embedded' (default) = overflow hidden, 'fullscreen' = fill viewport
export function wrapWidgetHtml(html: string, mode: 'embedded' | 'fullscreen' = 'embedded'): string {
  const css = mode === 'fullscreen' ? CSS_RESET_FULLSCREEN : CSS_RESET_IFRAME;
  return injectIntoHtml(html, css, createWidgetFramework(mode));
}
