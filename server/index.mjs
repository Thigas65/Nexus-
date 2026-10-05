import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AssistantError } from "./assistant/geminiClient.mjs";
import { handleApiRequest } from "./chatHandler.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDirectory = resolve(projectRoot, "dist");
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const maxBodyBytes = 256 * 1024;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      throw new AssistantError("A mensagem excede o tamanho permitido.", 413);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function sendApiResponse(response, result) {
  response.writeHead(result.statusCode, result.headers);
  response.end(result.body === null ? undefined : JSON.stringify(result.body));
}

async function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 404, { error: "Rota não encontrada." });
    return;
  }

  const requestedPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).slice(1);
  let filePath = resolve(publicDirectory, requestedPath);
  const relativePath = relative(publicDirectory, filePath);

  if (relativePath.startsWith(`..${sep}`) || relativePath === "..") {
    sendJson(response, 404, { error: "Arquivo não encontrado." });
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = resolve(publicDirectory, "index.html");
  }

  if (!existsSync(filePath)) {
    sendJson(response, 404, { error: "Interface não compilada. Execute npm run build." });
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    try {
      const body = url.pathname === "/api/chat" && request.method === "POST"
        ? await readJsonBody(request)
        : undefined;
      const result = await handleApiRequest({
        pathname: url.pathname,
        method: request.method,
        headers: request.headers,
        body,
      });
      sendApiResponse(response, result);
    } catch (error) {
      if (error instanceof AssistantError) {
        sendJson(response, error.statusCode, { error: error.message });
      } else {
        console.error("Erro inesperado ao processar a solicitação do assistente.");
        sendJson(response, 500, { error: "Ocorreu um erro interno. Tente novamente." });
      }
    }
    return;
  }

  try {
    await serveStatic(request, response, url.pathname);
  } catch {
    sendJson(response, 400, { error: "Caminho de arquivo inválido." });
  }
});

server.listen(port, host, () => {
  console.log(`N.E.X.U.S. server listening at http://${host}:${port}`);
});
