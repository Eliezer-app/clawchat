import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { WidgetMessageType, WidgetApi } from '@clawchat/shared';
import { wrapWidgetHtml } from '../widget';
import { compensateScroll } from '../scrollAnchor';

const MIN_HEIGHT = 60;
const MAX_HEIGHT = 800;
const DEFAULT_HEIGHT = 100;
const PRELOAD_MARGIN = '200px';

interface WidgetProps {
  code: string;
  conversationId?: string;
}

export default function Widget(props: WidgetProps) {
  const [visible, setVisible] = createSignal(false);
  const [height, setHeight] = createSignal(DEFAULT_HEIGHT);
  let containerRef: HTMLDivElement | undefined;
  let iframeRef: HTMLIFrameElement | undefined;
  let previousHeight = DEFAULT_HEIGHT;
  const trackedAppIds = new Set<string>();

  const convId = () => props.conversationId || 'default';

  const postToWidget = (message: object) => {
    iframeRef?.contentWindow?.postMessage(message, '*');
  };

  const reportErrorToAgent = async (error: string, stack?: string) => {
    try {
      await fetch(WidgetApi.widgetError(convId()), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error,
          stack,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Best effort - don't fail if error reporting fails
      console.error('[Widget Error]', error, stack);
    }
  };

  const handleGetState = async (appId: string) => {
    if (!appId || typeof appId !== 'string') {
      reportErrorToAgent(`Invalid appId in getState: ${appId}`);
      postToWidget({ type: WidgetMessageType.STATE, state: null });
      return;
    }

    trackedAppIds.add(appId);
    try {
      const res = await fetch(WidgetApi.appState(convId(), appId));
      const saved = res.ok ? await res.json() : null;
      postToWidget({ type: WidgetMessageType.STATE, state: saved?.state || null });
    } catch (err) {
      reportErrorToAgent(`getState failed for ${appId}: ${(err as Error).message}`);
      postToWidget({ type: WidgetMessageType.STATE, state: null });
    }
  };

  const handleSetState = async (appId: string, state: unknown) => {
    if (!appId || typeof appId !== 'string') {
      reportErrorToAgent(`Invalid appId in setState: ${appId}`);
      return;
    }

    try {
      await fetch(WidgetApi.appState(convId(), appId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
    } catch (err) {
      reportErrorToAgent(`setState failed for ${appId}: ${(err as Error).message}`);
    }
  };

  const handleResize = (newHeight: number) => {
    if (!iframeRef || !containerRef) return;

    if (typeof newHeight !== 'number' || isNaN(newHeight) || newHeight < 0) {
      reportErrorToAgent(`Invalid resize height: ${newHeight}`);
      return;
    }

    const h = Math.min(Math.max(newHeight, MIN_HEIGHT), MAX_HEIGHT);
    const delta = h - previousHeight;
    if (delta === 0) return;

    const widgetRect = containerRef.getBoundingClientRect();
    compensateScroll(delta, widgetRect);

    previousHeight = h;
    iframeRef.style.height = h + 'px';
    setHeight(h);
  };

  const handleRequest = async (id: string | number, appId: string, action: string, payload: unknown) => {
    if (!appId || typeof appId !== 'string') {
      postToWidget({ type: WidgetMessageType.RESPONSE, id, error: 'Invalid appId' });
      reportErrorToAgent(`Invalid appId in request: ${appId}`);
      return;
    }

    if (!action || typeof action !== 'string') {
      postToWidget({ type: WidgetMessageType.RESPONSE, id, error: 'Invalid action' });
      reportErrorToAgent(`Invalid action in request: ${action}`);
      return;
    }

    try {
      const res = await fetch(WidgetApi.appAction(convId(), appId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const data = await res.json();
      postToWidget({ type: WidgetMessageType.RESPONSE, id, data });
    } catch (err) {
      const errorMsg = (err as Error).message;
      postToWidget({ type: WidgetMessageType.RESPONSE, id, error: errorMsg });
      reportErrorToAgent(`request failed for ${appId}/${action}: ${errorMsg}`);
    }
  };

  const handleWidgetError = (error: string, stack?: string) => {
    reportErrorToAgent(error, stack);
  };

  const handleMessage = (e: MessageEvent) => {
    if (!iframeRef || !iframeRef.isConnected || e.source !== iframeRef.contentWindow) return;

    try {
      const data = e.data;
      if (!data || typeof data !== 'object') return;

      const { type, appId, state, id, action, payload, height, error, stack } = data;

      switch (type) {
        case WidgetMessageType.GET_STATE:
          handleGetState(appId);
          break;
        case WidgetMessageType.SET_STATE:
          handleSetState(appId, state);
          break;
        case WidgetMessageType.RESIZE:
          handleResize(height);
          break;
        case WidgetMessageType.REQUEST:
          handleRequest(id, appId, action, payload);
          break;
        case WidgetMessageType.ERROR:
          handleWidgetError(error, stack);
          break;
        default:
          if (type) {
            reportErrorToAgent(`Unknown message type from widget: ${type}`);
          }
      }
    } catch (err) {
      reportErrorToAgent(`Error handling widget message: ${(err as Error).message}`, (err as Error).stack);
    }
  };

  onMount(() => {
    if (!containerRef) return;

    window.addEventListener('message', handleMessage);

    const handleAppStateUpdate = (e: Event) => {
      try {
        const { conversationId, appId } = (e as CustomEvent).detail;
        if (conversationId === convId() && trackedAppIds.has(appId)) {
          postToWidget({ type: WidgetMessageType.STATE_UPDATED, appId });
        }
      } catch (err) {
        reportErrorToAgent(`Error handling state update: ${(err as Error).message}`);
      }
    };
    window.addEventListener('appStateUpdated', handleAppStateUpdate);

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
      window.removeEventListener('appStateUpdated', handleAppStateUpdate);
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
