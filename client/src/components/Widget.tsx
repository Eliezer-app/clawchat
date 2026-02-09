import { createSignal, onMount, onCleanup, Show } from 'solid-js';

const MIN_HEIGHT = 60;
const MAX_HEIGHT = 5000;
const DEFAULT_HEIGHT = 100;
const VIEWPORT_MARGIN = '500px';

const INJECTED_STYLE = 'html, body { height: auto !important; min-height: 0 !important; overflow: hidden !important; }';

interface WidgetProps {
  src: string;
}

export default function Widget(props: WidgetProps) {
  const [visible, setVisible] = createSignal(false);
  const [height, setHeight] = createSignal(DEFAULT_HEIGHT);
  let iframeRef: HTMLIFrameElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let resizeObs: ResizeObserver | undefined;
  let previousHeight = DEFAULT_HEIGHT;

  const isDataUrl = () => props.src.startsWith('data:');

  const updateHeight = () => {
    if (!iframeRef) return;
    try {
      const doc = iframeRef.contentDocument;
      if (!doc?.body) return;
      const h = Math.min(Math.max(Math.ceil(doc.documentElement.getBoundingClientRect().height), MIN_HEIGHT), MAX_HEIGHT);
      if (h === previousHeight) return;
      previousHeight = h;
      iframeRef.style.height = h + 'px';
      setHeight(h);
    } catch {}
  };

  const handleLoad = () => {
    resizeObs?.disconnect();
    resizeObs = undefined;
    if (isDataUrl()) return; // opaque origin — no contentDocument access
    try {
      const doc = iframeRef?.contentDocument;
      if (!doc?.body) return;
      const style = doc.createElement('style');
      style.textContent = INJECTED_STYLE;
      doc.head.appendChild(style);
      resizeObs = new ResizeObserver(updateHeight);
      resizeObs.observe(doc.body);
      updateHeight();
    } catch {}
  };

  onMount(() => {
    if (!containerRef) return;
    const io = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    }, { rootMargin: VIEWPORT_MARGIN });
    io.observe(containerRef);
    onCleanup(() => { io.disconnect(); resizeObs?.disconnect(); });
  });

  return (
    <div class="widget-container" ref={containerRef}>
      <Show when={visible()} fallback={
        <div class="widget-placeholder" style={{ height: height() + 'px' }} />
      }>
        <iframe
          ref={(el) => { iframeRef = el; el.addEventListener('load', handleLoad); }}
          src={props.src}
          sandbox={isDataUrl() ? 'allow-scripts' : 'allow-scripts allow-same-origin'}
          class="widget-iframe"
          style={{ height: height() + 'px' }}
        />
      </Show>
    </div>
  );
}
