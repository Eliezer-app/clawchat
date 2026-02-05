// Widget launcher - opens widgets in new tabs

import { wrapWidgetHtmlStandalone } from './wrapper';

// Track blob URLs for cleanup
const activeBlobUrls = new Set<string>();

// Cleanup blob URLs when tab closes (best effort)
function scheduleCleanup(url: string, windowRef: Window | null): void {
  activeBlobUrls.add(url);

  // Try to detect when the window closes
  const checkClosed = setInterval(() => {
    if (!windowRef || windowRef.closed) {
      clearInterval(checkClosed);
      URL.revokeObjectURL(url);
      activeBlobUrls.delete(url);
    }
  }, 5000);

  // Fallback: cleanup after 1 hour regardless
  setTimeout(() => {
    clearInterval(checkClosed);
    if (activeBlobUrls.has(url)) {
      URL.revokeObjectURL(url);
      activeBlobUrls.delete(url);
    }
  }, 60 * 60 * 1000);
}

// Clean up all blob URLs (call on page unload if needed)
export function cleanupAllBlobUrls(): void {
  activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
  activeBlobUrls.clear();
}

// Open widget in a new browser tab
export function openWidgetInNewTab(widgetCode: string, conversationId: string): Window | null {
  const html = wrapWidgetHtmlStandalone(widgetCode, conversationId);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const windowRef = window.open(url, '_blank');
  scheduleCleanup(url, windowRef);

  return windowRef;
}
