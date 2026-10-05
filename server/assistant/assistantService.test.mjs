import assert from "node:assert/strict";
import test from "node:test";
import { AssistantService } from "./assistantService.mjs";
import { AssistantError } from "./geminiClient.mjs";
import { createDefaultIntegrationRegistry } from "./integrations/index.mjs";
import { createSupervisedDevelopmentSystem } from "./supervision/index.mjs";

test("routes a user request through ToolRegistry and Tool before sending its result for the response", async () => {
  const generated = [];
  const assistant = new AssistantService({
    now: () => new Date("2026-10-03T14:47:20.000Z"),
    geminiConfigured: true,
    generate: async (message, options) => {
      generated.push({ message, options });
      return "São 14:47 UTC.";
    },
  });
  const context = [{ role: "user", content: "Que horas são?" }];

  const reply = await assistant.respond("Que horas são?", { context });

  assert.equal(reply, "São 14:47 UTC.");
  assert.equal(generated.length, 1);
  assert.equal(generated[0].message, "Que horas são?");
  assert.deepEqual(generated[0].options.context, context);
  assert.equal(generated[0].options.toolResult.request.toolName, "get_current_time");
  assert.equal(generated[0].options.toolResult.result.time, "14:47:20");
  assert.equal(generated[0].options.toolResult.result.timezone, "UTC");
});

test("passes ordinary chat directly to Gemini without executing a tool", async () => {
  let optionsReceived;
  const assistant = new AssistantService({
    generate: async (_message, options) => {
      optionsReceived = options;
      return "Posso ajudar com isso.";
    },
  });

  assert.equal(await assistant.respond("Explique fotossíntese.", { context: [] }), "Posso ajudar com isso.");
  assert.deepEqual(optionsReceived, { context: [] });
});

test("surfaces permission and tool input failures as clear assistant errors", async () => {
  const assistant = new AssistantService({ generate: async () => assert.fail("Gemini must not run") });

  await assert.rejects(
    () => assistant.respond("Não lembre disso.", { context: [] }),
    (error) =>
      error instanceof AssistantError &&
      error.statusCode === 403 &&
      error.code === "permission_required",
  );
  await assert.rejects(
    () => assistant.respond("calcule 1 / 0", { context: [] }),
    (error) =>
      error instanceof AssistantError &&
      error.statusCode === 400 &&
      error.code === "division_by_zero",
  );
});

test("makes only non-secret operational status available to the status tool", async () => {
  let optionsReceived;
  const assistant = new AssistantService({
    geminiConfigured: true,
    generate: async (_message, options) => {
      optionsReceived = options;
      return "O assistente está disponível.";
    },
  });

  await assistant.respond("Qual é o status do assistente?", { context: [] });

  const status = optionsReceived.toolResult.result.status;
  assert.equal(status.state, "available");
  assert.equal(status.geminiConfigured, true);
  assert.equal(status.toolsEnabled, true);
  assert.equal("apiKey" in status, false);
});

test("identifies a prepared device integration without claiming external control", async () => {
  let generationOptions;
  let actionCalls = 0;
  const integrationRegistry = createDefaultIntegrationRegistry();
  integrationRegistry.getAdapter("samsung-smart-tv").execute = async () => {
    actionCalls += 1;
    return { ok: true };
  };
  const assistant = new AssistantService({
    integrationRegistry,
    generate: async (_message, options) => {
      generationOptions = options;
      return "A integração Samsung Smart TV ainda não está conectada nem configurada.";
    },
  });

  const reply = await assistant.respond("Controle minha TV", { context: [] });

  assert.match(reply, /ainda não está conectada/);
  assert.equal(generationOptions.toolResult.request.toolName, "get_integration_status");
  assert.equal(generationOptions.toolResult.result.integration.id, "samsung-smart-tv");
  assert.equal(generationOptions.toolResult.result.integration.status, "unavailable");
  assert.equal(actionCalls, 0);
});

test("routes explicit connection requests through ConnectionManager but keeps placeholders disconnected", async () => {
  let generationOptions;
  let actionCalls = 0;
  const integrationRegistry = createDefaultIntegrationRegistry();
  integrationRegistry.getAdapter("spotify").execute = async () => {
    actionCalls += 1;
    return { ok: true };
  };
  const assistant = new AssistantService({
    integrationRegistry,
    generate: async (_message, options) => {
      generationOptions = options;
      return "Spotify ainda não está configurado; nenhuma conexão foi iniciada.";
    },
  });

  const reply = await assistant.respond("Conectar Spotify", { context: [] });

  assert.match(reply, /ainda não está configurado/);
  assert.equal(generationOptions.toolResult.request.toolName, "connect_integration");
  assert.equal(generationOptions.toolResult.result.status, "unavailable");
  assert.equal(generationOptions.toolResult.result.ok, false);
  assert.equal(
    generationOptions.toolResult.result.message.includes("nenhuma conexão foi iniciada"),
    true,
  );
  assert.equal((await assistant.connectionManager.getConnectionStatus("spotify")).connected, false);
  assert.equal(actionCalls, 0);
});

test("requires an explicit user command before invoking a connection diagnostic tool", async () => {
  const assistant = new AssistantService({
    generate: async () => assert.fail("Gemini must not run for denied tool execution"),
  });
  await assert.rejects(
    () => assistant.respond("connect_integration Spotify", { context: [] }),
    (error) =>
      error instanceof AssistantError &&
      error.statusCode === 403 &&
      error.code === "permission_required",
  );
});

test("uses an allowlisted setting only after an explicitly approved proposal is applied", async () => {
  const supervisedSystem = createSupervisedDevelopmentSystem();
  const proposal = supervisedSystem.proposalRegistry.create({
    problem: "Respostas longas.",
    currentBehavior: "Estilo balanced.",
    suggestedImprovement: "Preferir respostas concisas.",
    reason: "Feedback do usuário.",
    expectedImpact: "Menos texto.",
    affectedComponents: ["assistant-response-style"],
    risk: "low",
    proposedChange: {
      type: "runtime-setting",
      area: "user-experience",
      key: "responseStyle",
      value: "concise",
    },
  });
  supervisedSystem.proposalRegistry.requestApproval(proposal.id, { actor: "user" });
  supervisedSystem.proposalRegistry.approve(proposal.id, { actor: "user" });

  let generationOptions;
  const assistant = new AssistantService({
    supervisedSystem,
    generate: async (_message, options) => {
      generationOptions = options;
      return "Resposta curta.";
    },
  });

  assert.equal(supervisedSystem.settingsRegistry.list().responseStyle, "balanced");
  assert.equal(
    await assistant.respond(`Aplicar proposta aprovada ${proposal.id}`, { context: [] }),
    "Resposta curta.",
  );
  assert.equal(supervisedSystem.settingsRegistry.list().responseStyle, "concise");
  assert.deepEqual(generationOptions.supervisedSettings, { responseStyle: "concise" });
});

test("records explicit feedback as unapproved data without applying system changes", async () => {
  const supervisedSystem = createSupervisedDevelopmentSystem();
  const assistant = new AssistantService({
    supervisedSystem,
    generate: async (_message, options) => JSON.stringify(options.toolResult.result),
  });
  const reply = await assistant.respond(
    "Registre aprendizado: prefiro explicações simples.",
    { context: [] },
  );

  const learning = supervisedSystem.learningRegistry.query()[0];
  assert.match(reply, /learning/);
  assert.equal(learning.type, "preference");
  assert.equal(learning.approved, false);
  assert.equal(supervisedSystem.settingsRegistry.list().responseStyle, "balanced");
});
