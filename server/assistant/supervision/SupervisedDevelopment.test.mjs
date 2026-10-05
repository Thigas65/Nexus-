import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createSupervisedDevelopmentSystem,
  LearningType,
  ProposalRisk,
  ProposalStatus,
} from "./index.mjs";
import { createDefaultIntegrationRegistry } from "../integrations/index.mjs";
import { createDefaultToolRegistry } from "../tools/index.mjs";

test("registers, queries, updates, approves and invalidates supervised learning", () => {
  const system = createSupervisedDevelopmentSystem({
    now: () => new Date("2026-10-03T15:00:00.000Z"),
    createId: (() => {
      let id = 0;
      return () => `test-${++id}`;
    })(),
  });
  const created = system.learningRegistry.register({
    type: LearningType.PREFERENCE,
    content: "Prefiro respostas curtas.",
    source: "explicit-user-feedback",
    confidence: 0.8,
  });

  assert.equal(created.approved, false);
  assert.equal(created.active, true);
  assert.equal(created.source, "explicit-user-feedback");
  assert.equal(system.learningRegistry.query({ text: "curtas" })[0].id, created.id);

  const updated = system.learningRegistry.update(created.id, {
    content: "Prefiro respostas objetivas.",
    confidence: 0.9,
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.content, "Prefiro respostas objetivas.");
  assert.equal(system.learningRegistry.approve(created.id, { actor: "user" }).approved, true);

  const invalidated = system.learningRegistry.invalidate(created.id, {
    reason: "O usuário corrigiu esta preferência.",
    source: "explicit-user-correction",
  });
  assert.equal(invalidated.active, false);
  assert.equal(invalidated.approved, true);
  assert.equal(system.learningRegistry.query({ text: "objetivas" }).length, 0);
  assert.equal(system.learningRegistry.query({ text: "objetivas", activeOnly: false }).length, 1);
});

test("rejects invalid learning data and prevents changing supervision fields through update", () => {
  const registry = createSupervisedDevelopmentSystem().learningRegistry;
  assert.throws(
    () => registry.register({
      type: "unknown",
      content: "texto",
      source: "user",
    }),
    /tipo de aprendizado/,
  );
  assert.throws(
    () => registry.register({
      type: LearningType.FACT,
      content: "texto",
      source: "user",
      confidence: 1.1,
    }),
    /confiança/,
  );
  const learning = registry.register({
    type: LearningType.FACT,
    content: "O modelo não deve aprovar código.",
    source: "test",
  });
  assert.throws(
    () => registry.update(learning.id, { approved: true }),
    /só podem ser alterados/,
  );
});

test("creates proposals, requests review, records approval/rejection and supports no silent application", () => {
  const system = createSupervisedDevelopmentSystem();
  const proposal = system.proposalRegistry.create({
    problem: "Respostas podem ser longas.",
    currentBehavior: "Estilo balanced.",
    suggestedImprovement: "Usar respostas concisas.",
    reason: "Preferência explícita.",
    expectedImpact: "Respostas mais diretas.",
    affectedComponents: ["assistant-response-style"],
    risk: ProposalRisk.LOW,
    proposedChange: {
      type: "runtime-setting",
      area: "user-experience",
      key: "responseStyle",
      value: "concise",
    },
  });

  assert.equal(proposal.status, ProposalStatus.DRAFT);
  assert.throws(
    () => system.proposalRegistry.applyApprovedChange(proposal.id, { actor: "user" }),
    /não aceita esta operação/,
  );
  assert.equal(system.settingsRegistry.list().responseStyle, "balanced");

  assert.throws(
    () => system.proposalRegistry.requestApproval(proposal.id, { actor: "assistant" }),
    /ação explícita/,
  );
  system.proposalRegistry.requestApproval(proposal.id, { actor: "user" });
  const approved = system.proposalRegistry.approve(proposal.id, { actor: "user" });
  assert.equal(approved.status, ProposalStatus.APPROVED);
  assert.equal(system.settingsRegistry.list().responseStyle, "balanced");

  const applied = system.proposalRegistry.applyApprovedChange(proposal.id, { actor: "user" });
  assert.equal(applied.status, ProposalStatus.APPLIED);
  assert.equal(system.settingsRegistry.list().responseStyle, "concise");
  assert.deepEqual(
    system.proposalRegistry.getHistory({ proposalId: proposal.id }).map(({ action }) => action),
    ["created", "approval_requested", "approved", "applied"],
  );
  assert.equal("deleteHistory" in system.proposalRegistry, false);

  const rejected = system.proposalRegistry.create({
    problem: "Problema rejeitado.",
    currentBehavior: "Atual.",
    suggestedImprovement: "Mudança.",
    reason: "Teste.",
    expectedImpact: "Nenhum.",
  });
  assert.equal(
    system.proposalRegistry.reject(rejected.id, { actor: "user", reason: "Não é necessário." }).status,
    ProposalStatus.REJECTED,
  );
});

test("blocks automatic code, credential, permission and security configuration changes", () => {
  const registry = createSupervisedDevelopmentSystem().proposalRegistry;
  for (const area of ["code", "credentials", "permissions", "integrations", "security", "supervision", "audit", "logs", "confirmations"]) {
    assert.throws(
      () => registry.create({
        problem: "Alteração crítica.",
        currentBehavior: "Protegido.",
        suggestedImprovement: "Alterar área protegida.",
        reason: "Teste.",
        expectedImpact: "Não aplicável.",
        proposedChange: { type: "runtime-setting", area, key: "responseStyle", value: "concise" },
      }),
      /aplicação automática.*bloqueadas/,
    );
  }

  const invalidSetting = registry.create({
    problem: "Alteração fora da lista.",
    currentBehavior: "Protegido.",
    suggestedImprovement: "Editar permissões.",
    reason: "Teste.",
    expectedImpact: "Não aplicável.",
    proposedChange: { type: "permission", key: "permissions", value: "relaxed" },
  });
  registry.requestApproval(invalidSetting.id, { actor: "user" });
  registry.approve(invalidSetting.id, { actor: "user" });
  assert.throws(
    () => registry.applyApprovedChange(invalidSetting.id, { actor: "user" }),
    /lista segura/,
  );
  assert.equal(registry.get(invalidSetting.id).status, ProposalStatus.FAILED);
});

test("cannot mutate supervised settings directly or supply approval implicitly", () => {
  const system = createSupervisedDevelopmentSystem();
  assert.equal("settings" in system.settingsRegistry, false);
  assert.equal("settingsRegistry" in system.proposalRegistry, false);
  assert.throws(
    () => system.settingsRegistry.applyApproved({
      type: "runtime-setting",
      area: "user-experience",
      key: "responseStyle",
      value: "concise",
    }),
    /aplicação supervisionada/,
  );
  const proposal = system.proposalRegistry.create({
    problem: "Mudança.",
    currentBehavior: "Estável.",
    suggestedImprovement: "Alterar preferência.",
    reason: "Teste.",
    expectedImpact: "Teste.",
  });
  system.proposalRegistry.requestApproval(proposal.id, { actor: "user" });
  assert.throws(
    () => system.proposalRegistry.approve(proposal.id),
    /ação explícita/,
  );
});

test("keeps proposal history append-only and records failed application results", () => {
  const registry = createSupervisedDevelopmentSystem().proposalRegistry;
  const proposal = registry.create({
    problem: "Tentativa fora da allowlist.",
    currentBehavior: "Sem alteração.",
    suggestedImprovement: "Modificar comportamento não permitido.",
    reason: "Teste.",
    expectedImpact: "Nenhum.",
    proposedChange: { type: "runtime-setting", key: "unknown", value: "anything" },
  });
  registry.requestApproval(proposal.id, { actor: "user" });
  registry.approve(proposal.id, { actor: "user" });
  assert.throws(() => registry.applyApprovedChange(proposal.id, { actor: "user" }));

  const history = registry.getHistory();
  assert.equal(history.at(-1).action, "application_failed");
  assert.match(history.at(-1).result, /lista segura/);
  assert.equal("history" in registry, false);
});

test("runs read-only diagnostics for integrity, tools, integrations and learning state", async () => {
  const supervisedSystem = createSupervisedDevelopmentSystem();
  supervisedSystem.learningRegistry.register({
    type: LearningType.ERROR,
    content: "Teste de diagnóstico.",
    source: "test",
  });
  const integrationRegistry = createDefaultIntegrationRegistry();
  const toolRegistry = createDefaultToolRegistry({ integrationRegistry, supervisedSystem });

  const beforeHistory = supervisedSystem.proposalRegistry.historyCount();
  const report = await supervisedSystem.runDiagnostics({ toolRegistry, integrationRegistry });

  assert.equal(report.ok, true);
  assert.equal(report.readOnly, true);
  assert.deepEqual(report.checks.map(({ name, ok }) => [name, ok]), [
    ["tools", true],
    ["integrations", true],
    ["supervised_state", true],
    ["learning_and_memory", true],
    ["integrity", true],
  ]);
  assert.equal(report.checks.find(({ name }) => name === "integrations").details.registered, 6);
  assert.equal(report.checks.find(({ name }) => name === "learning_and_memory").details.learningRecords, 1);
  assert.equal(supervisedSystem.proposalRegistry.historyCount(), beforeHistory);
});

test("diagnostics report errors without throwing or mutating the system", async () => {
  const system = createSupervisedDevelopmentSystem();
  const report = await system.runDiagnostics({
    toolRegistry: null,
    integrationRegistry: null,
  });
  assert.equal(report.ok, false);
  assert.equal(report.readOnly, true);
  assert.ok(report.checks.some(({ name, ok }) => name === "tools" && !ok));
  assert.ok(report.checks.some(({ name, ok }) => name === "integrations" && !ok));
  assert.equal(system.proposalRegistry.historyCount(), 0);
});

test("supervision source contains no process execution, self-code writing or external requests", async () => {
  const modules = [
    "./learningRegistry.mjs",
    "./improvementProposals.mjs",
    "./diagnostics.mjs",
    "./index.mjs",
  ];
  for (const module of modules) {
    const source = await readFile(new URL(module, import.meta.url), "utf8");
    assert.doesNotMatch(source, /child_process|execSync|spawnSync|writeFile|appendFile|fetch\s*\(|axios|WebSocket|https?:\/\//i);
  }
});
