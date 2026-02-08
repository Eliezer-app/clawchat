// Widget message types and API paths - shared between client and server

export const WidgetMessageType = {
  // Widget → Parent
  GET_STATE: 'getState',
  SET_STATE: 'setState',
  RESIZE: 'resize',
  REQUEST: 'request',
  ERROR: 'widgetError',
  LOG: 'widgetLog',

  // Parent → Widget
  STATE: 'state',
  RESPONSE: 'response',
  STATE_UPDATED: 'stateUpdated',
} as const;

export type WidgetMessageType = typeof WidgetMessageType[keyof typeof WidgetMessageType];

export const WidgetApi = {
  appState: (conversationId: string, appId: string) => `/api/app-state/${conversationId}/${appId}`,
  appAction: (conversationId: string, appId: string) => `/api/app-action/${conversationId}/${appId}`,
  widgetError: (conversationId: string) => `/api/widget-error/${conversationId}`,
  widgetLog: '/api/widget-log',
  events: '/api/events',
} as const;

export const SSEEventType = {
  MESSAGE: 'message',
  DELETE: 'delete',
  UPDATE: 'update',
  APP_STATE_UPDATED: 'appStateUpdated',
  WIDGET_ERROR: 'widgetError',
  AGENT_STATUS: 'agentStatus',
  AGENT_TYPING: 'agentTyping',
  SCROLL_TO_MESSAGE: 'scrollToMessage',
} as const;

export interface WidgetError {
  conversationId: string;
  appId?: string;
  error: string;
  stack?: string;
  timestamp: string;
}
