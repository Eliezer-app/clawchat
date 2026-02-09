// Widget API paths and SSE event types - shared between client and server

export const WidgetApi = {
  appState: (conversationId: string, appId: string) => `/api/app-state/${conversationId}/${appId}`,
  widgetLog: '/api/widget-log',
} as const;

export const SSEEventType = {
  MESSAGE: 'message',
  DELETE: 'delete',
  UPDATE: 'update',
  APP_STATE_UPDATED: 'appStateUpdated',
  AGENT_STATUS: 'agentStatus',
  AGENT_TYPING: 'agentTyping',
  SCROLL_TO_MESSAGE: 'scrollToMessage',
} as const;
