export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'agent';
  content: string;
  createdAt: string; // ISO 8601
}

export interface Conversation {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
