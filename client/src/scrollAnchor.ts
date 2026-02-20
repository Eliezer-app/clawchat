let container: Element | null = null;
let anchored = true;

export function initScrollTracking(el: Element) {
  container = el;
  el.addEventListener('scroll', () => {
    if (!container) return;
    anchored = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  });
}

export function scrollToBottom(force?: boolean) {
  if (!container) return;
  if (!force && !anchored) return;
  container.scrollTop = container.scrollHeight;
  anchored = true;
}

