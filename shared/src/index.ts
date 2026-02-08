export * from './widget.js';

export interface Attachment {
  filename: string;
  mimetype: string;
  size: number;
}

export type MessageType = 'message' | 'thought' | 'tool_call' | 'tool_result';

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'agent';
  type: MessageType;
  content: string;
  name?: string; // tool name for tool_call/tool_result
  attachment?: Attachment;
  createdAt: string; // ISO 8601
}

export interface Conversation {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
