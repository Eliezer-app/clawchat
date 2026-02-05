/**
 * Compensates scroll position when content above the viewport resizes.
 * Call BEFORE applying the size change, pass the delta (new - old).
 */
export function compensateScroll(delta: number, elementRect: DOMRect) {
  if (delta === 0) return;

  const container = document.querySelector('.messages');
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const viewCenter = containerRect.top + containerRect.height / 2;
  const isAboveCenter = elementRect.bottom < viewCenter;
  const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 50;

  if (isAtBottom) {
    // Stay at bottom - apply after resize settles
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  } else if (isAboveCenter) {
    // Widget is above viewport center - compensate to keep lower content stable
    container.scrollTop += delta;
  }
}

/**
 * Call on element load (e.g., image onLoad) to stay at bottom if needed.
 */
export function stayAtBottomIfNeeded() {
  const container = document.querySelector('.messages');
  if (!container) return;

  const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 50;
  if (isAtBottom) {
    container.scrollTop = container.scrollHeight;
  }
}
