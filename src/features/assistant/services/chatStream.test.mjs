import assert from "node:assert/strict";
import test from "node:test";
import { consumeChatResponse } from "./chatStream.mjs";

function responseWithByteChunks(text, chunkSize) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

function chunkEvent(text) {
  return `event: chunk\ndata: ${JSON.stringify({ text })}\n\n`;
}

test("consumes a normal stream and returns the complete text after its done event", async () => {
  const chunks = [];
  const result = await consumeChatResponse(
    responseWithByteChunks(`${chunkEvent("Resposta completa.")}event: done\ndata: {}\n\n`, 256),
    (chunk) => chunks.push(chunk),
  );

  assert.equal(result, "Resposta completa.");
  assert.deepEqual(chunks, ["Resposta completa."]);
});

test("appends multiple stream chunks in order", async () => {
  const chunks = [];
  const result = await consumeChatResponse(
    responseWithByteChunks(
      `${chunkEvent("Olá ")}${chunkEvent("mundo!") }event: done\ndata: {}\n\n`,
      256,
    ),
    (chunk) => chunks.push(chunk),
  );

  assert.equal(result, "Olá mundo!");
  assert.deepEqual(chunks, ["Olá ", "mundo!"]);
});

test("handles event delimiters and UTF-8 characters split between network chunks", async () => {
  const chunks = [];
  const body = `${chunkEvent("Ação: 🌎")}event: done\ndata: {}\n\n`;
  const result = await consumeChatResponse(
    responseWithByteChunks(body, 1),
    (chunk) => chunks.push(chunk),
  );

  assert.equal(result, "Ação: 🌎");
  assert.deepEqual(chunks, ["Ação: 🌎"]);
});

test("surfaces stream errors after already received text", async () => {
  const partial = chunkEvent("Parcial");
  const failure = `event: error\ndata: ${JSON.stringify({ error: "Gemini indisponível." })}\n\n`;
  await assert.rejects(
    consumeChatResponse(responseWithByteChunks(`${partial}${failure}`, 7)),
    /Gemini indisponível/,
  );
});

test("rejects an incomplete stream instead of treating it as a successful response", async () => {
  await assert.rejects(
    consumeChatResponse(responseWithByteChunks(chunkEvent("Parcial"), 4)),
    /encerrou o streaming antes de concluir/,
  );
});

test("keeps compatibility with the existing JSON reply format", async () => {
  const result = await consumeChatResponse(Response.json({ reply: "Resposta JSON." }));
  assert.equal(result, "Resposta JSON.");
});

test("reports errors returned before streaming starts", async () => {
  await assert.rejects(
    consumeChatResponse(Response.json(
      { error: "Configuração ausente." },
      { status: 503 },
    )),
    /Configuração ausente/,
  );
});
