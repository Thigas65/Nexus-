export interface AssistantContextMessage {
  role: "assistant" | "user";
  content: string;
}

export interface AssistantService {
  sendMessage(
    message: string,
    context: AssistantContextMessage[],
    options?: {
      onChunk?: (chunk: string) => void;
      signal?: AbortSignal;
    },
  ): Promise<string>;
}
