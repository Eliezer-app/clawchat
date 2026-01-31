export interface Attachment {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'agent';
  content: string;
  attachment?: Attachment;
  createdAt: string; // ISO 8601
}

export interface Conversation {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
