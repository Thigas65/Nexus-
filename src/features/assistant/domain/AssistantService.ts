export interface AssistantContextMessage {
  role: "assistant" | "user";
  content: string;
}

export interface AssistantService {
  sendMessage(message: string, context: AssistantContextMessage[]): Promise<string>;
}
