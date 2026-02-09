/**
 * ClawChat Widget API — reference library (optional)
 *
 * Include via: <script src="/widget/common/widget-api.js"></script>
 *
 * Or just call the REST endpoints directly with fetch().
 * This file is a guide, not a dependency.
 *
 * API Endpoints:
 *   GET  /api/app-state/:appId   — read app state
 *   POST /api/app-state/:appId   — write app state { state }
 *   POST /api/widget-log         — write log { widgetPath, data }
 */

const widgetApi = (() => {
  return {
    async getState(appId) {
      const res = await fetch(`/api/app-state/${appId}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.state || null;
    },

    async setState(appId, state) {
      await fetch(`/api/app-state/${appId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
    },

    log(widgetPath, ...args) {
      const data = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      fetch('/api/widget-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgetPath, data }),
      }).catch(() => {});
    },
  };
})();
