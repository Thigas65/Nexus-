import type {
  AssistantContextMessage,
  AssistantService,
} from "../domain/AssistantService";
import { consumeChatResponse } from "./chatStream.mjs";

const BACKEND_URL_STORAGE_KEY = "nexus-backend-url";
const DEFAULT_LOCAL_BACKEND_URL = "http://10.0.2.2:3001";
const CONFIGURED_BACKEND_URL = import.meta.env.VITE_BACKEND_URL?.trim();

function readStoredBackendUrl(): string | null {
  if (typeof window === "undefined") return null;
  const storedValue = window.localStorage.getItem(BACKEND_URL_STORAGE_KEY)?.trim();
  return storedValue && storedValue.length > 0 ? storedValue : null;
}

export function resolveBackendUrl(): string {
  const storedUrl = readStoredBackendUrl();
  if (storedUrl) return storedUrl.replace(/\/$/, "");
  if (CONFIGURED_BACKEND_URL) return CONFIGURED_BACKEND_URL.replace(/\/$/, "");

  if (typeof window === "undefined") {
    return DEFAULT_LOCAL_BACKEND_URL;
  }

  const { hostname, protocol, origin } = window.location;
  const isAndroidWebView = protocol === "capacitor:" || /android/i.test(navigator.userAgent);
  const isLocalRuntime = ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname);

  if (isAndroidWebView) return DEFAULT_LOCAL_BACKEND_URL;
  if (isLocalRuntime) return "http://127.0.0.1:3001";
  if (origin && origin !== "null") return origin;
  return DEFAULT_LOCAL_BACKEND_URL;
}

export class HttpAssistantService implements AssistantService {
  private readonly baseUrl: string;

  constructor(options: { baseUrl?: string } = {}) {
    this.baseUrl = options.baseUrl?.trim() ? options.baseUrl.replace(/\/$/, "") : resolveBackendUrl();
  }

  async sendMessage(
    message: string,
    context: AssistantContextMessage[],
    options: { onChunk?: (chunk: string) => void; signal?: AbortSignal } = {},
  ): Promise<string> {
    const requestUrl = new URL("/api/chat", this.baseUrl);
    let response: Response;

    try {
      response = await fetch(requestUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
        },
        body: JSON.stringify({ message, context }),
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new Error("Não foi possível conectar ao servidor. Verifique se o backend do N.E.X.U.S. está em execução.");
    }

    return consumeChatResponse(response, options.onChunk);
  }
}
