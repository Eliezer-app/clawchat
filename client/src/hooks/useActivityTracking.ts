import { onMount, onCleanup } from 'solid-js';

export function useActivityTracking() {
  function sendVisibility(visible: boolean, keepalive = false) {
    fetch('/api/visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible }),
      credentials: 'include',
      keepalive, // Allows request to outlive the page
    }).catch(() => {
      // Ignore errors - visibility tracking is best-effort
    });
  }

  function handleFocus() {
    sendVisibility(true);
  }

  function handleBlur() {
    sendVisibility(false);
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      sendVisibility(false);
    }
  }

  function handlePageHide() {
    // Fires when page is being unloaded - use keepalive for reliability
    sendVisibility(false, true);
  }

  onMount(() => {
    // Send initial state - focused only if document has focus
    sendVisibility(document.hasFocus());

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
  });

  onCleanup(() => {
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('blur', handleBlur);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handlePageHide);
    sendVisibility(false);
  });
}
