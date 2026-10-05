import assert from "node:assert/strict";
import test from "node:test";
import { AssistantError, generateResponse } from "./geminiClient.mjs";
import { assistantPersonality, unknownProjectInformation } from "./personality.mjs";
import { formatProjectSelfKnowledge, projectSelfKnowledge } from "./selfKnowledge.mjs";

test("reports a missing Gemini API key without making a request", async () => {
  await assert.rejects(
    generateResponse("Olá", { apiKey: "", fetchImpl: () => assert.fail("fetch must not run") }),
    (error) =>
      error instanceof AssistantError &&
      error.statusCode === 503 &&
      error.message.includes("GEMINI_API_KEY"),
  );
});

test("sends the personality, context, and message to Gemini and returns its text", async () => {
  let requestUrl;
  let requestOptions;
  const reply = await generateResponse("Explique fotossíntese", {
    context: [
      { role: "user", content: "O que é fotossíntese?" },
      { role: "assistant", content: "É como as plantas produzem alimento." },
    ],
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return Response.json({
        candidates: [{ content: { parts: [{ text: "As plantas transformam luz em energia." }] } }],
      });
    },
  });

  assert.equal(reply, "As plantas transformam luz em energia.");
  assert.equal(
    requestUrl,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  assert.equal(requestOptions.headers["x-goog-api-key"], "test-key");
  const body = JSON.parse(requestOptions.body);
  assert.match(body.system_instruction.parts[0].text, /N\.E\.X\.U\.S\./);
  assert.match(body.system_instruction.parts[0].text, /senhor/);
  assert.match(body.system_instruction.parts[0].text, /não é consciente/);
  assert.match(body.system_instruction.parts[1].text, /React com Vite/);
  assert.match(body.system_instruction.parts[1].text, /Gemini/);
  assert.match(body.system_instruction.parts[1].text, /somente fatos presentes/);
  assert.ok(body.system_instruction.parts[1].text.includes(unknownProjectInformation));
  assert.deepEqual(
    body.contents.map(({ role, parts }) => ({ role, text: parts[0].text })),
    [
      { role: "user", text: "O que é fotossíntese?" },
      { role: "model", text: "É como as plantas produzem alimento." },
      { role: "user", text: "Explique fotossíntese" },
    ],
  );
});

test("includes a verified tool result in Gemini instructions for composing the response", async () => {
  let body;
  const reply = await generateResponse("Que horas são?", {
    apiKey: "test-key",
    toolResult: {
      request: { toolName: "get_current_time", parameters: {} },
      result: { ok: true, tool: "get_current_time", time: "14:47:20", timezone: "UTC" },
    },
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return Response.json({
        candidates: [{ content: { parts: [{ text: "São 14:47 UTC." }] } }],
      });
    },
  });

  test("includes only an approved response-style setting without relaxing safety rules", async () => {
    let body;
    await generateResponse("Ajude com uma pergunta.", {
      apiKey: "test-key",
      supervisedSettings: { responseStyle: "concise" },
      fetchImpl: async (_url, options) => {
        body = JSON.parse(options.body);
        return Response.json({
          candidates: [{ content: { parts: [{ text: "Claro." }] } }],
        });
      },
    });

    assert.match(body.system_instruction.parts[2].text, /estilo "concise"/);
    assert.match(body.system_instruction.parts[2].text, /não altera regras de segurança nem permissões/);
  });

  assert.equal(reply, "São 14:47 UTC.");
  assert.match(body.system_instruction.parts[2].text, /get_current_time/);
  assert.match(body.system_instruction.parts[2].text, /14:47:20/);
  assert.match(body.system_instruction.parts[2].text, /valores calculados\/retornados como dados/);
  assert.match(body.system_instruction.parts[2].text, /Quando ok for false, informe que a solicitação não foi concluída/);
});

test("keeps personality and project facts in separate server-side sources", () => {
  assert.match(assistantPersonality, /assistente virtual pessoal/);
  assert.match(assistantPersonality, /professor e mentor/);
  assert.match(assistantPersonality, /resposta curta/);
  assert.equal(projectSelfKnowledge.identity.name, "N.E.X.U.S.");
  assert.equal(projectSelfKnowledge.currentArchitecture.backend, "Node.js");
  assert.match(projectSelfKnowledge.currentArchitecture.persistentMemoryPrivacy, /não salva informações automaticamente/);
  assert.match(formatProjectSelfKnowledge(), /GEMINI_API_KEY/);
  assert.match(projectSelfKnowledge.currentState.wakeWord, /não é enviada ao Gemini/);
  assert.match(projectSelfKnowledge.currentState.limitations.join(" "), /não funciona com o aplicativo fechado/);
  assert.match(projectSelfKnowledge.currentState.toolArchitecture, /conectada ao fluxo de \/api\/chat/);
  assert.match(projectSelfKnowledge.currentState.builtInTools.calculator, /não usa eval/);
  assert.match(projectSelfKnowledge.currentArchitecture.toolPermissions, /concessão de permissão/);
  assert.match(projectSelfKnowledge.currentState.integrationSystem, /IntegrationRegistry/);
  assert.match(projectSelfKnowledge.currentState.preparedIntegrations.samsungSmartTV, /não conectada/);
  assert.match(projectSelfKnowledge.currentState.integrationTools.list_integrations, /não realiza chamadas externas/);
  assert.match(projectSelfKnowledge.currentState.limitations.join(" "), /são placeholders sem conexão/);
  assert.match(projectSelfKnowledge.currentState.supervisedDevelopment, /após aprovação e comando explícitos/);
  assert.match(projectSelfKnowledge.currentState.protectedAreas, /Não existe ferramenta de escrita de código/);
});

test("reports an empty Gemini response", async () => {
  await assert.rejects(
    generateResponse("Oi", {
      apiKey: "test-key",
      fetchImpl: async () => Response.json({ candidates: [] }),
    }),
    (error) => error instanceof AssistantError && error.statusCode === 502,
  );
});

test("reports Gemini rate limits as temporary unavailability", async () => {
  await assert.rejects(
    generateResponse("Oi", {
      apiKey: "test-key",
      fetchImpl: async () => new Response(null, { status: 429 }),
    }),
    (error) => error instanceof AssistantError && error.statusCode === 503,
  );
});

test("reports Gemini authentication failures without exposing upstream details", async () => {
  await assert.rejects(
    generateResponse("Oi", {
      apiKey: "test-key",
      fetchImpl: async () => new Response(null, { status: 403 }),
    }),
    (error) =>
      error instanceof AssistantError &&
      error.statusCode === 503 &&
      !error.message.includes("test-key"),
  );
});

test("reports Gemini timeouts without exposing upstream details", async () => {
  await assert.rejects(
    generateResponse("Oi", {
      apiKey: "test-key",
      fetchImpl: async () => {
        const error = new Error("timeout detail");
        error.name = "TimeoutError";
        throw error;
      },
    }),
    (error) =>
      error instanceof AssistantError &&
      error.statusCode === 504 &&
      !error.message.includes("timeout detail"),
  );
});

test("reports connection failures without exposing upstream details", async () => {
  await assert.rejects(
    generateResponse("Oi", {
      apiKey: "test-key",
      fetchImpl: async () => {
        throw new Error("network detail");
      },
    }),
    (error) =>
      error instanceof AssistantError &&
      error.statusCode === 502 &&
      !error.message.includes("network detail"),
  );
});
