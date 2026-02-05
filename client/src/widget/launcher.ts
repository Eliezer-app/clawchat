// Widget launcher - opens widgets in new tabs

// Open widget in a new browser tab using message ID
export function openWidgetInNewTab(messageId: string, conversationId: string): Window | null {
  let url = `/message/${messageId}/widget`;
  if (conversationId && conversationId !== 'default') {
    url += `?conversationId=${encodeURIComponent(conversationId)}`;
  }
  return window.open(url, '_blank');
}
