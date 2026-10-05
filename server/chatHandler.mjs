import { AssistantError } from "./assistant/geminiClient.mjs";
import { AssistantService } from "./assistant/assistantService.mjs";
import { getCorsDecision, parseAllowedOrigins } from "./cors.mjs";

const maxBodyBytes = 256 * 1024;
const maxContextMessages = 40;
const maxMessageLength = 8_000;
const maxContextCharacters = 32_000;
const assistantService = new AssistantService();
const allowedOrigins = parseAllowedOrigins();

function jsonResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
    body,
  };
}

async function parseRequestBody(body) {
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        throw new AssistantError("A mensagem excede o tamanho permitido.", 413);
      }
      chunks.push(Buffer.from(value));
    }
    body = Buffer.concat(chunks, size).toString("utf8");
  }
  if (typeof body !== "string") return body;
  if (Buffer.byteLength(body, "utf8") > maxBodyBytes) {
    throw new AssistantError("A mensagem excede o tamanho permitido.", 413);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new AssistantError("A solicitação precisa conter JSON válido.", 400);
  }
}

function validateChatBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AssistantError("A solicitação precisa conter JSON válido.", 400);
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    throw new AssistantError("Escreva uma mensagem antes de enviar.", 400);
  }
  if (body.message.length > maxMessageLength) {
    throw new AssistantError("A mensagem excede o tamanho permitido.", 413);
  }

  const context = body.context ?? [];
  if (!Array.isArray(context) || context.length > maxContextMessages) {
    throw new AssistantError("O histórico da conversa é inválido ou muito longo.", 400);
  }

  let contextCharacters = 0;
  for (const item of context) {
    if (
      !item ||
      !["assistant", "user"].includes(item.role) ||
      typeof item.content !== "string" ||
      !item.content.trim() ||
      item.content.length > maxMessageLength
    ) {
      throw new AssistantError("Uma mensagem do histórico é inválida.", 400);
    }
    contextCharacters += item.content.length;
    if (contextCharacters > maxContextCharacters) {
      throw new AssistantError("O histórico da conversa é muito longo.", 413);
    }
  }
  return { message: body.message.trim(), context };
}

export async function handleApiRequest({
  pathname,
  method,
  headers = {},
  body,
  assistant = assistantService,
}) {
  const cors = getCorsDecision({
    origin: headers.origin,
    requestedMethod: headers["access-control-request-method"],
    requestedHeaders: headers["access-control-request-headers"],
  }, allowedOrigins);

  if (!cors.allowed && method === "OPTIONS" && headers.origin) {
    return jsonResponse(403, { error: "Origem ou solicitação não autorizada." });
  }

  if (method === "OPTIONS" && headers.origin) {
    return { statusCode: 204, headers: cors.headers, body: null };
  }

  if (pathname === "/api/health" && method === "GET") {
    return jsonResponse(200, {
      status: "ok",
      configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    }, cors.headers);
  }

  if (pathname === "/api/chat" && method === "POST") {
    try {
      const { message, context } = validateChatBody(await parseRequestBody(body));
      const reply = await assistant.respond(message, { context });
      return jsonResponse(200, { reply }, cors.headers);
    } catch (error) {
      if (error instanceof AssistantError) {
        return jsonResponse(error.statusCode, { error: error.message }, cors.headers);
      }
      console.error("Erro inesperado ao processar a solicitação do assistente.");
      return jsonResponse(500, { error: "Ocorreu um erro interno. Tente novamente." }, cors.headers);
    }
  }

  return jsonResponse(404, { error: "Rota não encontrada." }, cors.headers);
}
