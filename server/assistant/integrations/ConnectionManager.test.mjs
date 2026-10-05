import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { ConnectionManager } from "./ConnectionManager.mjs";
import {
  createDefaultIntegrationRegistry,
  IntegrationError,
  IntegrationRegistry,
  IntegrationStatus,
} from "./index.mjs";
import {
  AuthorizationMethod,
  AuthorizationProvider,
  SecureCredentialStore,
} from "./authorization.mjs";

function createConnectedTestSetup() {
  let adapterStatus = IntegrationStatus.DISCONNECTED;
  const integration = {
    id: "test-service",
    name: "Serviço de teste",
    description: "Integração local para testes de conexão.",
    type: "service",
    status: IntegrationStatus.DISCONNECTED,
    configured: true,
    permissions: [{
      integrationId: "test-service",
      capability: "sample.read",
      granted: false,
      requiresConfirmation: false,
    }],
    capabilities: [{
      id: "sample.read",
      description: "Ler valor de teste.",
      available: true,
    }],
  };
  const adapter = {
    async connect() {
      return IntegrationStatus.CONNECTED;
    },
    async beginConnection() {
      return { authorizationMethod: AuthorizationMethod.OAUTH2 };
    },
    async checkConnection() {
      return adapterStatus;
    },
    async completeAuthorization() {
      adapterStatus = IntegrationStatus.CONNECTED;
    },
    async disconnect() {
      adapterStatus = IntegrationStatus.DISCONNECTED;
      return adapterStatus;
    },
    async revokeAuthorization() {
      adapterStatus = IntegrationStatus.DISCONNECTED;
      return adapterStatus;
    },
    async getStatus() {
      return adapterStatus;
    },
    async getCapabilities() {
      return integration.capabilities;
    },
    async execute() {
      return { ok: true };
    },
  };
  const integrationRegistry = new IntegrationRegistry([{ integration, adapter }]);
  const calls = [];
  const authorizationProvider = {
    async beginAuthorization(id, request) {
      calls.push(["begin", id, request]);
      return { state: "pending", publicChallengeId: "challenge-only" };
    },
    async completeAuthorization(id, result) {
      calls.push(["complete", id, result]);
      return { authorizationHandle: "backend-only-reference" };
    },
    async verifyAuthorization(id, authorization) {
      calls.push(["verify", id, authorization]);
      return true;
    },
    async revokeAuthorization(id) {
      calls.push(["revoke", id]);
      return true;
    },
  };
  const credentialCalls = [];
  const credentialStore = {
    async store(...args) {
      credentialCalls.push(["store", ...args]);
    },
    async retrieve(...args) {
      credentialCalls.push(["retrieve", ...args]);
    },
    async delete(...args) {
      credentialCalls.push(["delete", ...args]);
    },
  };
  return {
    integrationRegistry,
    adapter,
    authorizationProvider,
    credentialStore,
    calls,
    credentialCalls,
    manager: new ConnectionManager({
      integrationRegistry,
      authorizationProvider,
      credentialStore,
    }),
  };
}

test("supports unavailable, disconnected, connecting, connected and error statuses", async () => {
  assert.deepEqual(Object.values(IntegrationStatus), [
    "unavailable",
    "disconnected",
    "connecting",
    "connected",
    "error",
  ]);
  const setup = createConnectedTestSetup();
  assert.equal((await setup.manager.getConnectionStatus("test-service")).status, "disconnected");

  const started = await setup.manager.connect("test-service");
  assert.equal(started.status, "connecting");
  assert.equal((await setup.manager.getConnectionStatus("test-service")).status, "connecting");

  const finished = await setup.manager.completeAuthorization("test-service", {
    authorizationCode: "ephemeral-test-code",
  });
  assert.equal(finished.status, "connected");
  assert.equal((await setup.manager.getConnectionStatus("test-service")).status, "connected");

  setup.authorizationProvider.verifyAuthorization = async () => {
    throw new IntegrationError("Temporary local provider failure.", "provider_failure", "error");
  };
  const failedVerification = await setup.manager.verifyConnection("test-service");
  assert.equal(failedVerification.status, "error");
});

test("refuses connection for unconfigured placeholders without external authorization", async () => {
  const integrationRegistry = createDefaultIntegrationRegistry();
  const manager = new ConnectionManager({ integrationRegistry });
  const result = await manager.connect("spotify");

  assert.equal(result.ok, false);
  assert.equal(result.status, IntegrationStatus.UNAVAILABLE);
  assert.match(result.message, /não está configurada/);
  assert.equal((await manager.getConnectionStatus("spotify")).connected, false);
});

test("records a rejected connection attempt without upgrading status", async () => {
  const setup = createConnectedTestSetup();
  setup.adapter.beginConnection = async () => {
    throw new IntegrationError(
      "Bearer top-secret-token should never be returned.",
      "authorization_unavailable",
      IntegrationStatus.UNAVAILABLE,
    );
  };

  const result = await setup.manager.connect("test-service");

  assert.equal(result.ok, false);
  assert.equal(result.status, IntegrationStatus.UNAVAILABLE);
  assert.doesNotMatch(result.message, /top-secret-token/);
  assert.equal((await setup.manager.getConnectionStatus("test-service")).connected, false);
});

test("does not complete a connection when authorization verification is denied", async () => {
  const setup = createConnectedTestSetup();
  setup.authorizationProvider.verifyAuthorization = async () => false;

  const result = await setup.manager.completeAuthorization("test-service", {
    authorizationCode: "ephemeral-test-code",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, IntegrationStatus.DISCONNECTED);
  assert.equal((await setup.manager.getConnectionStatus("test-service")).authorized, false);
  assert.equal(setup.adapter.getStatus && await setup.adapter.getStatus(), IntegrationStatus.DISCONNECTED);
});

test("reports missing integrations and prevents authorization completion", async () => {
  const { manager } = createConnectedTestSetup();

  await assert.rejects(
    () => manager.connect("missing"),
    (error) => error instanceof IntegrationError && error.code === "integration_not_found",
  );
});

test("supports explicit verification, disconnect and authorization revocation", async () => {
  const setup = createConnectedTestSetup();
  await setup.manager.connect("test-service");
  await setup.manager.completeAuthorization("test-service", { code: "ephemeral" });

  assert.deepEqual(await setup.manager.verifyConnection("test-service"), {
    ok: true,
    integrationId: "test-service",
    status: IntegrationStatus.CONNECTED,
    authorized: true,
  });
  const disconnected = await setup.manager.disconnect("test-service");
  assert.equal(disconnected.status, IntegrationStatus.DISCONNECTED);
  assert.equal(disconnected.authorizationRetained, true);

  const revoked = await setup.manager.revokeAuthorization("test-service");
  assert.equal(revoked.revoked, true);
  assert.equal(revoked.status, IntegrationStatus.DISCONNECTED);
  assert.equal((await setup.manager.getConnectionStatus("test-service")).authorized, false);
  assert.deepEqual(setup.credentialCalls, [["delete", "test-service"]]);
});

test("cannot mark connected without verified authorization and adapter confirmation", async () => {
  const setup = createConnectedTestSetup();
  assert.throws(
    () => setup.integrationRegistry.setConnectionState("test-service", IntegrationStatus.CONNECTED),
    (error) => error instanceof IntegrationError && error.code === "authorization_required",
  );

  await setup.manager.connect("test-service");
  setup.adapter.completeAuthorization = async () => {};
  const result = await setup.manager.completeAuthorization("test-service", { code: "ephemeral" });
  assert.equal(result.ok, false);
  assert.equal(result.status, IntegrationStatus.DISCONNECTED);
  assert.equal((await setup.manager.getConnectionStatus("test-service")).authorized, false);
});

test("keeps authorization-provider and credential-store implementations unavailable by default", async () => {
  const provider = new AuthorizationProvider();
  const credentialStore = new SecureCredentialStore();
  assert.deepEqual(Object.values(AuthorizationMethod), [
    "oauth2",
    "api-key",
    "access-token",
    "refresh-token",
  ]);
  await assert.rejects(
    () => provider.beginAuthorization("spotify"),
    (error) => error instanceof IntegrationError && error.code === "authorization_unavailable",
  );
  assert.equal(await provider.verifyAuthorization("spotify"), false);
  await assert.rejects(
    () => credentialStore.store("spotify", { accessToken: "never-persist-this" }),
    (error) => error instanceof IntegrationError && error.code === "credential_store_unavailable",
  );
  await assert.rejects(
    () => credentialStore.retrieve("spotify"),
    (error) => error instanceof IntegrationError && error.code === "credential_store_unavailable",
  );
});

test("does not report disconnect success when an adapter returns error", async () => {
  const setup = createConnectedTestSetup();
  setup.adapter.disconnect = async () => IntegrationStatus.ERROR;

  const result = await setup.manager.disconnect("test-service");

  assert.equal(result.ok, false);
  assert.equal(result.status, IntegrationStatus.ERROR);
});

test("placeholder adapters perform no network calls or secret storage", async () => {
  const sourceFiles = [
    "./index.mjs",
    "./ConnectionManager.mjs",
    "./authorization.mjs",
  ];
  for (const path of sourceFiles) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(|axios|new\s+WebSocket\s*\(|new\s+XMLHttpRequest\s*\(/i);
    assert.doesNotMatch(
      source,
      /https?:\/\/|\b(?:window|globalThis)\.(?:localStorage|sessionStorage)\b|\bprocess\.env\b/i,
    );
  }

  const registry = createDefaultIntegrationRegistry();
  const manager = new ConnectionManager({ integrationRegistry: registry });
  for (const integration of await registry.listWithStatus()) {
    assert.equal(integration.status, IntegrationStatus.UNAVAILABLE);
    assert.equal((await manager.connect(integration.id)).ok, false);
  }
});

test("frontend source contains no keys, tokens, secrets or passwords", async () => {
  async function collectFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      return entry.isDirectory() ? collectFiles(path) : [path];
    }));
    return files.flat();
  }

  const frontendFiles = await collectFiles(new URL("../../../src/", import.meta.url));
  const sensitivePatterns = [
    /AIza[A-Za-z0-9_-]{20,}/,
    /(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*["'][^"']+["']/i,
    /VITE_[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)/,
  ];
  for (const file of frontendFiles) {
    const contents = await readFile(file, "utf8");
    for (const pattern of sensitivePatterns) {
      assert.doesNotMatch(contents, pattern, `secret-like value found in ${file.pathname}`);
    }
  }
});
