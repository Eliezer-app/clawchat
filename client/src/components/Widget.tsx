import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { wrapWidgetHtml, extractWidgetId } from '../widgetFramework';
import { compensateScroll } from '../scrollAnchor';

const MIN_HEIGHT = 60;
const MAX_HEIGHT = 800;
const DEFAULT_HEIGHT = 100;
const PRELOAD_MARGIN = '200px';

export default function Widget(props: { code: string; conversationId?: string }) {
  const [visible, setVisible] = createSignal(false);
  const [height, setHeight] = createSignal(DEFAULT_HEIGHT);
  let containerRef: HTMLDivElement | undefined;
  let iframeRef: HTMLIFrameElement | undefined;
  let previousHeight = DEFAULT_HEIGHT;

  const widgetId = () => extractWidgetId(props.code);
  const convId = () => props.conversationId || 'default';

  const postToWidget = (message: object) => {
    iframeRef?.contentWindow?.postMessage(message, '*');
  };

  const handleGetState = async () => {
    try {
      const res = await fetch(`/api/widget-state/${convId()}/${widgetId()}`);
      const saved = res.ok ? await res.json() : null;
      postToWidget({ type: 'state', state: saved?.state || null });
    } catch {
      postToWidget({ type: 'state', state: null });
    }
  };

  const handleSetState = (state: unknown) => {
    fetch(`/api/widget-state/${convId()}/${widgetId()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    }).catch(() => {});
  };

  const handleResize = (newHeight: number) => {
    if (!iframeRef || !containerRef) return;

    const h = Math.min(Math.max(newHeight, MIN_HEIGHT), MAX_HEIGHT);
    const delta = h - previousHeight;
    if (delta === 0) return;

    const widgetRect = containerRef.getBoundingClientRect();
    compensateScroll(delta, widgetRect);

    previousHeight = h;
    iframeRef.style.height = h + 'px';
    setHeight(h);
  };

  const handleRequest = async (id: string, action: string, payload: unknown) => {
    try {
      const res = await fetch(`/api/widget-action/${convId()}/${widgetId()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const data = await res.json();
      postToWidget({ type: 'response', id, data });
    } catch (err) {
      postToWidget({ type: 'response', id, error: (err as Error).message });
    }
  };

  const handleMessage = (e: MessageEvent) => {
    if (!iframeRef || !iframeRef.isConnected || e.source !== iframeRef.contentWindow) return;

    const { type, state, id, action, payload, height } = e.data || {};

    switch (type) {
      case 'getState':
        handleGetState();
        break;
      case 'setState':
        handleSetState(state);
        break;
      case 'resize':
        if (height) handleResize(height);
        break;
      case 'request':
        if (action) handleRequest(id, action, payload);
        break;
    }
  };

  onMount(() => {
    if (!containerRef) return;

    window.addEventListener('message', handleMessage);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { rootMargin: PRELOAD_MARGIN, threshold: 0 }
    );
    observer.observe(containerRef);

    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener('message', handleMessage);
    });
  });

  const wrappedCode = () => wrapWidgetHtml(props.code);

  return (
    <div class="widget-container" ref={containerRef}>
      <Show when={visible()} fallback={
        <div class="widget-placeholder" style={{ height: height() + 'px' }}>
          Widget paused
        </div>
      }>
        <iframe
          ref={iframeRef}
          srcdoc={wrappedCode()}
          sandbox="allow-scripts"
          class="widget-iframe"
          style={{ height: height() + 'px' }}
        />
      </Show>
    </div>
  );
}
