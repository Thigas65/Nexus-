import assert from "node:assert/strict";
import test from "node:test";
import chat from "../netlify/functions/chat.mjs";
import health from "../netlify/functions/health.mjs";
import { GeminiApiError } from "./assistant/geminiClient.mjs";
import { handleApiRequest } from "./chatHandler.mjs";

test("shared chat handler validates input and delegates to the assistant", async () => {
  let received;
  const result = await handleApiRequest({
    pathname: "/api/chat",
    method: "POST",
    body: JSON.stringify({
      message: " Olá ",
      context: [{ role: "user", content: "Oi" }],
    }),
    assistant: {
      async respond(message, options) {
        received = { message, options };
        return "Olá também!";
      },
    },
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { reply: "Olá também!" });
  assert.deepEqual(received, {
    message: "Olá",
    options: { context: [{ role: "user", content: "Oi" }] },
  });
});

test("shared chat handler preserves request validation and health response", async () => {
  const invalid = await handleApiRequest({
    pathname: "/api/chat",
    method: "POST",
    body: "{",
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(typeof invalid.body.error, "string");

  const status = await handleApiRequest({
    pathname: "/api/health",
    method: "GET",
  });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.status, "ok");
  assert.equal(typeof status.body.configured, "boolean");
  assert.equal("key" in status.body, false);
});

test("chat handler returns only Gemini status and sanitized error message", async () => {
  const result = await handleApiRequest({
    pathname: "/api/chat",
    method: "POST",
    body: JSON.stringify({ message: "Olá" }),
    assistant: {
      async respond() {
        throw new GeminiApiError("Invalid API key: [REDACTED]", 503, 403);
      },
    },
  });

  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, {
    status: 403,
    message: "Invalid API key: [REDACTED]",
  });
});

test("Netlify Functions expose the shared API behavior through Fetch requests", async () => {
  const chatResponse = await chat(new Request("https://nexus.example/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  }));
  assert.equal(chatResponse.status, 400);
  assert.equal(typeof (await chatResponse.json()).error, "string");

  const oversizedResponse = await chat(new Request("https://nexus.example/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "x".repeat(256 * 1024) }),
  }));
  assert.equal(oversizedResponse.status, 413);

  const healthResponse = await health(new Request("https://nexus.example/api/health"));
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json()).status, "ok");
});
