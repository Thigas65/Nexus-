import { handleApiRequest } from "../../server/chatHandler.mjs";

export default async function chat(request) {
  const result = await handleApiRequest({
    pathname: "/api/chat",
    method: request.method,
    headers: {
      origin: request.headers.get("origin"),
      "access-control-request-method": request.headers.get("access-control-request-method"),
      "access-control-request-headers": request.headers.get("access-control-request-headers"),
    },
    body: request.body,
  });

  return new Response(result.body === null ? null : JSON.stringify(result.body), {
    status: result.statusCode,
    headers: result.headers,
  });
}
