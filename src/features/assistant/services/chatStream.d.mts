export function consumeChatResponse(
  response: Response,
  onChunk?: (chunk: string) => void,
): Promise<string>;
