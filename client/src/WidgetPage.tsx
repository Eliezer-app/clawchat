import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { WidgetMessageType, WidgetApi, SSEEventType } from '@clawchat/shared';
import { extractWidgets, wrapWidgetHtml } from './widget';

interface WidgetPageProps {
  messageId: string;
}

export default function WidgetPage(props: WidgetPageProps) {
  const [error, setError] = createSignal<string | null>(null);
  const [widgetHtml, setWidgetHtml] = createSignal<string | null>(null);
  const [conversationId, setConversationId] = createSignal('default');

  let iframeRef: HTMLIFrameElement | undefined;
  let eventsRef: EventSource | undefined;
  const trackedAppIds = new Set<string>();

  const postToWidget = (message: object) => {
    iframeRef?.contentWindow?.postMessage(message, '*');
  };

  const handleMessage = async (e: MessageEvent) => {
    if (!iframeRef || e.source !== iframeRef.contentWindow) return;

    const { type, appId, state, id, action, payload, error: widgetError, stack } = e.data || {};
    const convId = conversationId();

    switch (type) {
      case WidgetMessageType.GET_STATE:
        if (!appId) return;
        trackedAppIds.add(appId);
        try {
          const res = await fetch(WidgetApi.appState(convId, appId));
          const data = res.ok ? await res.json() : null;
          postToWidget({ type: WidgetMessageType.STATE, state: data?.state || null });
        } catch {
          postToWidget({ type: WidgetMessageType.STATE, state: null });
        }
        break;

      case WidgetMessageType.SET_STATE:
        if (!appId) return;
        try {
          await fetch(WidgetApi.appState(convId, appId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state }),
          });
        } catch {}
        break;

      case WidgetMessageType.REQUEST:
        if (!appId || !action) {
          postToWidget({ type: WidgetMessageType.RESPONSE, id, error: 'Invalid request' });
          return;
        }
        try {
          const res = await fetch(WidgetApi.appAction(convId, appId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload }),
          });
          const data = await res.json();
          postToWidget({ type: WidgetMessageType.RESPONSE, id, data });
        } catch (err) {
          postToWidget({ type: WidgetMessageType.RESPONSE, id, error: (err as Error).message });
        }
        break;

      case WidgetMessageType.RESIZE:
        // Ignore resize in fullscreen - widget fills viewport
        break;

      case WidgetMessageType.ERROR:
        console.error('[Widget Error]', widgetError, stack);
        fetch(WidgetApi.widgetError(convId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: widgetError, stack }),
        }).catch(() => {});
        break;
    }
  };

  // Register cleanup at component scope (synchronously)
  window.addEventListener('message', handleMessage);
  onCleanup(() => {
    window.removeEventListener('message', handleMessage);
    eventsRef?.close();
  });

  onMount(async () => {
    // Fetch message
    try {
      const res = await fetch(`/api/widget/${props.messageId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load widget');
        return;
      }
      const message = await res.json();

      // Get conversationId from URL param or message
      const params = new URLSearchParams(window.location.search);
      setConversationId(params.get('conversationId') || message.conversationId || 'default');

      const widgets = extractWidgets(message.content);
      if (widgets.length !== 1) {
        setError('Message does not contain exactly one widget');
        return;
      }
      setWidgetHtml(wrapWidgetHtml(widgets[0].code, 'fullscreen'));
    } catch (e) {
      setError('Failed to load widget');
    }

    // Listen for app state updates via SSE
    eventsRef = new EventSource(WidgetApi.events);
    eventsRef.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === SSEEventType.APP_STATE_UPDATED &&
            data.conversationId === conversationId() &&
            trackedAppIds.has(data.appId)) {
          postToWidget({ type: WidgetMessageType.STATE_UPDATED, appId: data.appId });
        }
      } catch {}
    };
  });

  return (
    <Show when={!error()} fallback={
      <div style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        height: '100vh',
        'font-family': 'system-ui',
        color: '#666'
      }}>
        {error()}
      </div>
    }>
      <Show when={widgetHtml()}>
        <iframe
          ref={iframeRef}
          srcdoc={widgetHtml()!}
          sandbox="allow-scripts"
          style={{
            width: '100%',
            height: '100vh',
            border: 'none',
            display: 'block'
          }}
        />
      </Show>
    </Show>
  );
}
