export type MessageRole = "assistant" | "user";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}
