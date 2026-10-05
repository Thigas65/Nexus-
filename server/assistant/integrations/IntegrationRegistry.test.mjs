import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultIntegrationRegistry,
  IntegrationAdapter,
  IntegrationError,
  IntegrationRegistry,
  IntegrationStatus,
  PlaceholderIntegrationAdapter,
} from "./index.mjs";

function createIntegration({
  id = "test-service",
  status = IntegrationStatus.DISCONNECTED,
  granted = false,
  requiresConfirmation = false,
} = {}) {
  const capability = {
    id: "sample.read",
    description: "Ler informação de teste.",
    available: true,
  };
  return {
    integration: {
      id,
      name: "Serviço de teste",
      description: "Integração isolada para testes.",
      type: "service",
      status,
      permissions: [{
        integrationId: id,
        capability: capability.id,
        granted,
        requiresConfirmation,
      }],
      capabilities: [capability],
    },
    adapter: {
      async connect() {
        return IntegrationStatus.CONNECTED;
      },
      async disconnect() {
        return IntegrationStatus.DISCONNECTED;
      },
      async getStatus() {
        return status;
      },
      async getCapabilities() {
        return [capability];
      },
      async execute() {
        return { ok: true, value: "local-test" };
      },
    },
  };
}

test("registers, lists, and finds integration metadata by id", () => {
  const { integration, adapter } = createIntegration();
  const registry = new IntegrationRegistry();

  registry.register(integration, adapter);

  assert.equal(registry.list().length, 1);
  assert.equal(registry.get("test-service").name, "Serviço de teste");
  assert.equal(registry.get("missing"), undefined);
  assert.equal(registry.list()[0].permissions[0].integrationId, "test-service");
});

test("rejects duplicate and malformed integration registrations", () => {
  const { integration, adapter } = createIntegration();
  const registry = new IntegrationRegistry();
  registry.register(integration, adapter);

  assert.throws(() => registry.register(integration, adapter), /já está registrada/);
  assert.throws(() => registry.register({ id: "broken" }, adapter), /contrato obrigatório/);
});

test("lists the six prepared integrations as unavailable and not configured", async () => {
  const registry = createDefaultIntegrationRegistry();
  const integrations = await registry.listWithStatus();

  assert.deepEqual(integrations.map(({ id }) => id), [
    "android",
    "samsung-smart-tv",
    "spotify",
    "gmail",
    "whatsapp",
    "instagram",
  ]);
  for (const integration of integrations) {
    assert.equal(integration.status, IntegrationStatus.UNAVAILABLE);
    assert.equal(integration.configured, false);
    assert.equal(integration.connected, false);
    assert.equal(integration.permissions.every(({ granted }) => !granted), true);
    assert.equal(integration.capabilities.every(({ available }) => !available), true);
  }
});

test("reports current status and safely represents adapter failures", async () => {
  const { integration, adapter } = createIntegration();
  const registry = new IntegrationRegistry([{ integration, adapter }]);

  assert.equal((await registry.getStatus("test-service")).status, IntegrationStatus.DISCONNECTED);
  await assert.rejects(
    () => registry.getStatus("missing"),
    (error) => error instanceof IntegrationError && error.code === "integration_not_found",
  );

  adapter.getStatus = async () => {
    throw new Error("private upstream diagnostic");
  };
  const failedStatus = await registry.getStatus("test-service");
  assert.equal(failedStatus.status, IntegrationStatus.ERROR);
  assert.doesNotMatch(failedStatus.error, /private upstream diagnostic/);
});

test("exposes the adapter contract and placeholders without pretending to connect", async () => {
  const adapter = new PlaceholderIntegrationAdapter([{ id: "device.status", description: "Consultar status." }]);

  assert.ok(adapter instanceof IntegrationAdapter);
  assert.equal(await adapter.getStatus(), IntegrationStatus.UNAVAILABLE);
  assert.deepEqual(await adapter.getCapabilities(), [
    { id: "device.status", description: "Consultar status.", available: false },
  ]);
  assert.equal(await adapter.disconnect(), IntegrationStatus.UNAVAILABLE);
  await assert.rejects(
    () => adapter.connect(),
    (error) => error instanceof IntegrationError && error.code === "adapter_unavailable",
  );
  await assert.rejects(
    () => adapter.execute("device.status"),
    (error) => error instanceof IntegrationError && error.code === "adapter_unavailable",
  );
});

test("checks permission grants and confirmation requirements separately", () => {
  const confirmed = createIntegration({
    granted: true,
    requiresConfirmation: true,
  });
  const registry = new IntegrationRegistry([confirmed]);

  assert.equal(registry.checkPermission("test-service", "sample.read"), false);
  assert.equal(registry.checkPermission("test-service", "sample.read", {
    confirmedCapabilities: ["sample.read"],
  }), true);
  assert.equal(registry.checkPermission("test-service", "unknown.capability", {
    confirmedCapabilities: ["unknown.capability"],
  }), false);
});

test("prevents execution when disconnected or not explicitly authorized", async () => {
  const disconnected = createIntegration({ granted: true });
  const registry = new IntegrationRegistry([disconnected]);

  await assert.rejects(
    () => registry.execute("test-service", "sample.read"),
    (error) => error instanceof IntegrationError && error.code === "integration_not_connected",
  );

  const connected = createIntegration({
    status: IntegrationStatus.CONNECTED,
    granted: false,
  });
  const connectedRegistry = new IntegrationRegistry([connected]);
  connectedRegistry.setConnectionState("test-service", IntegrationStatus.CONNECTED, {
    authorizationVerified: true,
  });
  await assert.rejects(
    () => connectedRegistry.execute("test-service", "sample.read"),
    (error) => error instanceof IntegrationError && error.code === "permission_required",
  );
});

test("prevents execution when a connected adapter does not offer the capability", async () => {
  const { integration, adapter } = createIntegration({
    status: IntegrationStatus.CONNECTED,
    granted: true,
  });
  adapter.getCapabilities = async () => [{
    id: "sample.read",
    description: "Ler informação de teste.",
    available: false,
  }];
  const registry = new IntegrationRegistry([{ integration, adapter }]);
  registry.setConnectionState("test-service", IntegrationStatus.CONNECTED, {
    authorizationVerified: true,
  });

  await assert.rejects(
    () => registry.execute("test-service", "sample.read"),
    (error) => error instanceof IntegrationError && error.code === "capability_unavailable",
  );
});

test("requires explicit confirmation for sensitive capabilities and wraps adapter errors", async () => {
  const { integration, adapter } = createIntegration({
    status: IntegrationStatus.CONNECTED,
    granted: true,
    requiresConfirmation: true,
  });
  const registry = new IntegrationRegistry([{ integration, adapter }]);
  registry.setConnectionState("test-service", IntegrationStatus.CONNECTED, {
    authorizationVerified: true,
  });

  await assert.rejects(
    () => registry.execute("test-service", "sample.read"),
    (error) => error instanceof IntegrationError && error.code === "permission_required",
  );
  assert.deepEqual(
    await registry.execute("test-service", "sample.read", {}, {
      confirmedCapabilities: ["sample.read"],
    }),
    { ok: true, value: "local-test" },
  );
  await assert.rejects(
    () => registry.execute("test-service", "unknown.action", {}, {
      confirmedCapabilities: ["unknown.action"],
    }),
    (error) => error instanceof IntegrationError && error.code === "unknown_capability",
  );

  adapter.execute = async () => {
    throw new Error("secret upstream response");
  };
  await assert.rejects(
    () => registry.execute("test-service", "sample.read", {}, {
      confirmedCapabilities: ["sample.read"],
    }),
    (error) =>
      error instanceof IntegrationError &&
      error.code === "integration_execution_failed" &&
      !error.message.includes("secret upstream response"),
  );
});
