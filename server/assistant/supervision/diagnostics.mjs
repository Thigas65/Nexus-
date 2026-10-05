export async function runSelfDiagnostics({
  toolRegistry,
  integrationRegistry,
  learningRegistry,
  proposalRegistry,
  settingsRegistry,
}) {
  const checks = [];

  checks.push(await check("tools", async () => {
    if (!toolRegistry || typeof toolRegistry.list !== "function") throw new Error("ToolRegistry indisponível.");
    const tools = toolRegistry.list();
    if (!tools.length || tools.some(({ name, permission }) => !name || !permission)) {
      throw new Error("Uma ou mais ferramentas não têm metadados válidos.");
    }
    return { registered: tools.length };
  }));

  checks.push(await check("integrations", async () => {
    if (!integrationRegistry || typeof integrationRegistry.listWithStatus !== "function") {
      throw new Error("IntegrationRegistry indisponível.");
    }
    const integrations = await integrationRegistry.listWithStatus();
    const errors = integrations
      .filter(({ status }) => status === "error")
      .map(({ id }) => id);
    return {
      ok: errors.length === 0,
      registered: integrations.length,
      statuses: integrations.map(({ id, status }) => ({ id, status })),
      errors,
    };
  }));

  checks.push(await check("supervised_state", async () => {
    if (
      !learningRegistry ||
      !proposalRegistry ||
      !settingsRegistry ||
      typeof proposalRegistry.getHistory !== "function"
    ) throw new Error("Um registry supervisionado está indisponível.");
    const settings = settingsRegistry.list();
    if (!["concise", "balanced", "detailed"].includes(settings.responseStyle)) {
      throw new Error("A configuração de estilo de resposta está fora da lista permitida.");
    }
    return {
      learnings: learningRegistry.count(),
      proposals: proposalRegistry.count(),
      historyEntries: proposalRegistry.historyCount(),
      settingsValid: true,
    };
  }));

  checks.push(await check("learning_and_memory", async () => {
    if (!learningRegistry || typeof learningRegistry.query !== "function") {
      throw new Error("LearningRegistry indisponível.");
    }
    const learnings = learningRegistry.query({ activeOnly: false });
    const invalid = learnings.some(
      (learning) =>
        !learning.id ||
        !learning.content ||
        typeof learning.confidence !== "number" ||
        learning.confidence < 0 ||
        learning.confidence > 1,
    );
    if (invalid) throw new Error("Um registro de aprendizado está inválido.");
    return {
      learningRecords: learnings.length,
      persistentBrowserMemory: "isolated; not connected to backend diagnostics",
    };
  }));

  checks.push(await check("integrity", async () => {
    const protectedSettings = settingsRegistry.list();
    const protectedKeysPresent = ["credentials", "permissions", "integrations", "security", "supervision"]
      .some((key) => key in protectedSettings);
    if (protectedKeysPresent) throw new Error("Uma configuração protegida foi adicionada ao registry mutável.");
    return {
      protectedConfiguration: "not exposed to supervised settings",
      automaticCodeModification: false,
      auditDeletion: false,
    };
  }));

  return {
    ok: checks.every(({ ok }) => ok),
    readOnly: true,
    generatedAt: new Date().toISOString(),
    checks,
  };
}

async function check(name, run) {
  try {
    const details = await run();
    return { name, ok: details?.ok !== false, details };
  } catch {
    return { name, ok: false, error: `A verificação "${name}" não pôde ser concluída.` };
  }
}
