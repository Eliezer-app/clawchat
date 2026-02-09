let container: Element | null = null;

export function initScrollTracking(el: Element) {
  container = el;
}

export function scrollToBottom() {
  if (!container) return;
  container.scrollTop = container.scrollHeight;
}
