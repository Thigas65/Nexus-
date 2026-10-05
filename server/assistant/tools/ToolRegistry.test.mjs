import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultToolRegistry,
  createTool,
  ToolExecutionError,
  ToolRegistry,
} from "./index.mjs";

const registry = createDefaultToolRegistry();

test("exposes Tool and ToolResult contracts with name, description, parameters and execute", async () => {
  const tool = createTool({
    name: "example_tool",
    description: "Uma ferramenta de exemplo para testar a interface.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    },
    execute: async ({ text }) => ({ ok: true, text }),
  });

  assert.deepEqual(tool.name, "example_tool");
  assert.match(tool.description, /exemplo/i);
  assert.deepEqual(tool.parameters.required, ["text"]);
  assert.deepEqual(tool.parameters.type, "object");
  assert.deepEqual(await tool.execute({ text: "ok" }), {
    ok: true,
    text: "ok",
    tool: "example_tool",
  });
  await assert.rejects(
    () => createTool({
      name: "invalid_result_tool",
      description: "Ferramenta inválida para validar resultado.",
      execute: async () => "não é um ToolResult",
    }).execute(),
    (error) => error instanceof ToolExecutionError && error.code === "invalid_tool_result",
  );
});

test("routes requests to the closest built-in tool without requiring external integrations", async () => {
  const decision = registry.route("Lembre que eu prefiro respostas curtas.");

  assert.equal(decision.toolName, "remember_fact");
  assert.equal(decision.parameters.category, "preference");
  assert.equal(decision.parameters.content.includes("respostas curtas"), true);
  assert.ok(decision.confidence > 0.35);

  const execution = await registry.execute(decision.toolName, decision.parameters, {
    permissionGrants: ["explicit-user-action"],
  });
  assert.equal(execution.ok, true);
  assert.equal(execution.stored.content.includes("respostas curtas"), true);
});

test("validates required parameters and exposes clear tool errors", async () => {
  await assert.rejects(
    () => registry.execute("remember_fact", {}, {
      permissionGrants: ["explicit-user-action"],
    }),
    (error) => error instanceof ToolExecutionError && error.code === "missing_parameter",
  );

  await assert.rejects(
    () => registry.execute("search_memory", { query: "" }),
    (error) => error instanceof ToolExecutionError && error.code === "invalid_parameter",
  );
});

test("summarizes conversation context without touching external systems", async () => {
  const execution = await registry.execute("summarize_context", {
    messages: [
      { role: "user", content: "Quero aprender React" },
      { role: "assistant", content: "Posso ajudar com fundamentos e exemplos." },
      { role: "user", content: "Me explique de forma simples" },
    ],
  });

  assert.equal(execution.ok, true);
  assert.match(execution.summary, /React/i);
  assert.equal(execution.count, 3);
});

test("declares typed tool requests, results and permission metadata for registered tools", () => {
  const tools = registry.list();
  const names = tools.map(({ name }) => name);

  for (const name of [
    "get_current_time",
    "get_current_date",
    "calculator",
    "get_assistant_status",
  ]) {
    assert.ok(names.includes(name), `missing registered tool ${name}`);
  }
  assert.equal(tools.find(({ name }) => name === "calculator").permission, "safe-compute");
  assert.equal(tools.find(({ name }) => name === "remember_fact").permission, "explicit-user-action");

  const request = registry.route("calcule 8 * (3 + 2)");
  assert.equal(typeof request.toolName, "string");
  assert.deepEqual(request.parameters, { expression: "8 * (3 + 2)" });
});

test("returns the current time and date from an injectable UTC clock", async () => {
  const now = () => new Date("2026-10-03T14:47:20.000Z");
  const time = await registry.execute("get_current_time", {}, { now });
  const date = await registry.execute("get_current_date", {}, { now });

  assert.equal(registry.route("Qual é a data de hoje?").toolName, "get_current_date");
  assert.deepEqual(
    { time: time.time, timestamp: time.timestamp, timezone: time.timezone },
    { time: "14:47:20", timestamp: "2026-10-03T14:47:20.000Z", timezone: "UTC" },
  );
  assert.deepEqual({ date: date.date, timezone: date.timezone }, { date: "2026-10-03", timezone: "UTC" });
});

test("routes and executes the safe calculator with normal arithmetic precedence", async () => {
  const request = registry.route("Quanto é 8 vezes (3 + 2)?");
  const result = await registry.execute(request.toolName, request.parameters);

  assert.equal(request.toolName, "calculator");
  assert.equal(result.result, 40);
  assert.equal(result.expression, "8 * (3 + 2)");
  assert.equal((await registry.execute("calculator", { expression: "1,5 + 2.5" })).result, 4);
});

test("rejects code, arbitrary syntax, division by zero and out-of-range calculations", async () => {
  for (const expression of [
    "globalThis.process.exit()",
    "1 + (function(){})()",
    "1 / 0",
    "10 ^ 1000",
  ]) {
    await assert.rejects(
      () => registry.execute("calculator", { expression }),
      ToolExecutionError,
    );
  }
});

test("reports operational status without exposing configuration secrets", async () => {
  const result = await registry.execute("get_assistant_status", {}, {
    assistantStatus: {
      state: "available",
      provider: "Gemini",
      geminiConfigured: true,
      toolsEnabled: true,
      registeredToolCount: registry.list().length,
    },
  });

  assert.equal(result.status.state, "available");
  assert.equal(result.status.geminiConfigured, true);
  assert.equal("apiKey" in result.status, false);
});

test("requires explicit permission for side-effecting and external tools", async () => {
  await assert.rejects(
    () => registry.execute("remember_fact", { content: "Prefiro respostas curtas" }),
    (error) => error instanceof ToolExecutionError && error.code === "permission_required",
  );
  await assert.rejects(
    () => registry.execute("not_registered", {}),
    (error) => error instanceof ToolExecutionError && error.code === "unknown_tool",
  );

  const externalTool = createTool({
    name: "future_external_tool",
    description: "Ferramenta externa usada para validar a arquitetura de permissões.",
    permission: "external",
    execute: async () => ({ ok: true }),
  });

  test("lists integrations through safe local diagnostics and reports their permissions and state", async () => {
    const registryWithIntegrations = createDefaultToolRegistry();
    const listRequest = registryWithIntegrations.route("Quais integrações estão disponíveis?");
    const listResult = await registryWithIntegrations.execute(
      listRequest.toolName,
      listRequest.parameters,
    );

    assert.equal(listRequest.toolName, "list_integrations");
    assert.deepEqual(
      listResult.integrations.map(({ id }) => id),
      ["android", "samsung-smart-tv", "spotify", "gmail", "whatsapp", "instagram"],
    );
    assert.ok(listResult.integrations.every(({ status }) => status === "unavailable"));

    const statusRequest = registryWithIntegrations.route("Controle minha TV");
    const statusResult = await registryWithIntegrations.execute(
      statusRequest.toolName,
      statusRequest.parameters,
    );
    assert.equal(statusRequest.toolName, "get_integration_status");
    assert.equal(statusRequest.parameters.integrationId, "samsung-smart-tv");
    assert.equal(statusResult.integration.name, "Samsung Smart TV");
    assert.equal(statusResult.integration.status, "unavailable");
    assert.ok(statusResult.integration.capabilities.some(({ id }) => id === "playback.control"));
    assert.ok(statusResult.integration.permissions.every(({ granted }) => !granted));
  });

  test("diagnostic tools do not invoke an integration adapter action", async () => {
    let actionCalls = 0;
    const { createDefaultIntegrationRegistry } = await import("../integrations/index.mjs");
    const integrationRegistry = createDefaultIntegrationRegistry();
    const tv = integrationRegistry.requireIntegration("samsung-smart-tv");
    tv.adapter.execute = async () => {
      actionCalls += 1;
      throw new Error("External actions must not run from diagnostics");
    };
    const registryWithIntegrations = createDefaultToolRegistry({ integrationRegistry });
    const list = await registryWithIntegrations.execute("list_integrations");
    const status = await registryWithIntegrations.execute("get_integration_status", {
      integrationId: "samsung-smart-tv",
    });

    assert.equal(list.ok, true);
    assert.equal(status.ok, true);
    assert.equal(actionCalls, 0);
  });

  test("connect and disconnect tools require explicit authorization and stay offline for placeholders", async () => {
    const registryWithIntegrations = createDefaultToolRegistry();
    const connectRequest = registryWithIntegrations.route("Conectar Spotify");
    assert.equal(connectRequest.toolName, "connect_integration");
    assert.equal(connectRequest.parameters.integrationId, "spotify");
    await assert.rejects(
      () => registryWithIntegrations.execute(connectRequest.toolName, connectRequest.parameters),
      (error) => error instanceof ToolExecutionError && error.code === "permission_required",
    );

    const connectResult = await registryWithIntegrations.execute(
      connectRequest.toolName,
      connectRequest.parameters,
      { permissionGrants: ["explicit-user-action"] },
    );
    assert.equal(connectResult.ok, false);
    assert.equal(connectResult.status, "unavailable");

    const disconnectRequest = registryWithIntegrations.route("Desconectar Gmail");
    assert.equal(disconnectRequest.toolName, "disconnect_integration");
    assert.equal(disconnectRequest.parameters.integrationId, "gmail");
    const disconnectResult = await registryWithIntegrations.execute(
      disconnectRequest.toolName,
      disconnectRequest.parameters,
      { permissionGrants: ["explicit-user-action"] },
    );
    assert.equal(disconnectResult.status, "unavailable");

    const statusRequest = registryWithIntegrations.route("Verificar conexão do Gmail");
    assert.equal(statusRequest.toolName, "get_connection_status");
    const statusResult = await registryWithIntegrations.execute(
      statusRequest.toolName,
      statusRequest.parameters,
    );
    assert.equal(statusResult.integration.authorized, false);
    assert.equal(statusResult.integration.connected, false);
  });

  test("connection diagnostic tools never return authorization provider payloads", async () => {
    const registryWithIntegrations = createDefaultToolRegistry({
      connectionManager: {
        async connect(integrationId) {
          return {
            ok: true,
            integrationId,
            status: "connecting",
            authorizationRequired: true,
            authorizationRequest: { accessToken: "must-not-leak" },
          };
        },
      },
    });
    const result = await registryWithIntegrations.execute(
      "connect_integration",
      { integrationId: "spotify" },
      { permissionGrants: ["explicit-user-action"] },
    );

    assert.equal(result.status, "connecting");
    assert.equal("authorizationRequest" in result, false);
    assert.doesNotMatch(JSON.stringify(result), /must-not-leak/);
  });

  test("provides supervised learning, proposal, approval, diagnosis and immutable history tools", async () => {
    const { createSupervisedDevelopmentSystem } = await import("../supervision/index.mjs");
    const { createDefaultIntegrationRegistry } = await import("../integrations/index.mjs");
    const supervisedSystem = createSupervisedDevelopmentSystem();
    const integrationRegistry = createDefaultIntegrationRegistry();
    const registryWithSupervision = createDefaultToolRegistry({
      supervisedSystem,
      integrationRegistry,
    });
    const userAction = {
      permissionGrants: ["explicit-user-action"],
      supervisionActor: "user",
      supervisedSystem,
      integrationRegistry,
      toolRegistry: registryWithSupervision,
    };

    const learning = await registryWithSupervision.execute(
      "record_learning",
      { type: "correction", content: "Prefiro respostas claras." },
      userAction,
    );
    assert.equal(learning.learning.approved, false);
    assert.equal(
      (await registryWithSupervision.execute("query_learning", { text: "claras" }, userAction))
        .learnings.length,
      1,
    );

    const proposal = await registryWithSupervision.execute(
      "create_improvement_proposal",
      {
        proposal: "Preferir respostas concisas.",
        proposedChange: {
          type: "runtime-setting",
          area: "user-experience",
          key: "responseStyle",
          value: "concise",
        },
      },
      userAction,
    );
    const proposalId = proposal.proposal.id;
    await assert.rejects(
      () => registryWithSupervision.execute(
        "apply_approved_change",
        { proposalId },
        userAction,
      ),
      (error) => error instanceof ToolExecutionError,
    );
    await registryWithSupervision.execute("request_proposal_approval", { proposalId }, userAction);
    await registryWithSupervision.execute("approve_improvement_proposal", { proposalId }, userAction);
    const applied = await registryWithSupervision.execute(
      "apply_approved_change",
      { proposalId },
      userAction,
    );
    assert.equal(applied.proposal.status, "applied");
    assert.equal(supervisedSystem.settingsRegistry.list().responseStyle, "concise");
    assert.equal(
      (await registryWithSupervision.execute("get_improvement_proposal", { proposalId }, userAction))
        .proposal.status,
      "applied",
    );

    const diagnostics = await registryWithSupervision.execute(
      "run_self_diagnostics",
      {},
      userAction,
    );
    assert.equal(diagnostics.report.ok, true);

    const history = await registryWithSupervision.execute("get_supervision_history", {}, userAction);
    assert.deepEqual(
      history.history.map(({ action }) => action),
      ["created", "approval_requested", "approved", "applied"],
    );
    assert.equal(registryWithSupervision.get("apply_approved_change").permission, "explicit-user-action");
  });
  const futureRegistry = new ToolRegistry([externalTool]);
  await assert.rejects(
    () => futureRegistry.execute("future_external_tool"),
    (error) => error instanceof ToolExecutionError && error.code === "permission_required",
  );
  assert.equal(
    (await futureRegistry.execute("future_external_tool", {}, {
      permissionGrants: ["external"],
    })).ok,
    true,
  );
});
