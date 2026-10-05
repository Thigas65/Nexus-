import { randomUUID } from "node:crypto";

export const ProposalStatus = Object.freeze({
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  APPLIED: "applied",
  FAILED: "failed",
});

export const ProposalRisk = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
});

const allowedSettings = new Map([
  ["responseStyle", new Set(["concise", "balanced", "detailed"])],
]);
const approvedChangePermit = Symbol("approved-change-permit");
const protectedAreas = new Set([
  "code",
  "source",
  "credentials",
  "permissions",
  "integrations",
  "security",
  "supervision",
  "audit",
  "logs",
  "confirmations",
]);

export class SupervisedSettingsRegistry {
  #settings = { responseStyle: "balanced" };

  list() {
    return { ...this.#settings };
  }

  applyApproved(change, permit) {
    if (permit !== approvedChangePermit) {
      throw new Error("Apenas a aplicação supervisionada pode alterar esta configuração.");
    }
    if (
      !change ||
      change.type !== "runtime-setting" ||
      change.area !== "user-experience" ||
      !allowedSettings.has(change.key) ||
      !allowedSettings.get(change.key).has(change.value)
    ) {
      throw new Error("A alteração solicitada está fora da lista segura de configurações permitidas.");
    }
    this.#settings[change.key] = change.value;
    return this.list();
  }
}

export class ImprovementProposalRegistry {
  #proposals = new Map();
  #history = [];
  #settingsRegistry;
  #now;
  #createId;

  constructor({
    settingsRegistry = new SupervisedSettingsRegistry(),
    now = () => new Date(),
    createId = () => randomUUID(),
  } = {}) {
    this.#settingsRegistry = settingsRegistry;
    this.#now = now;
    this.#createId = createId;
  }

  create({
    problem,
    currentBehavior,
    suggestedImprovement,
    reason,
    expectedImpact,
    affectedComponents = [],
    risk = ProposalRisk.MEDIUM,
    proposedChange,
    source = "user",
  }) {
    const proposal = {
      id: `proposal-${this.#createId()}`,
      problem: requiredText(problem, "O problema"),
      currentBehavior: requiredText(currentBehavior, "O comportamento atual"),
      suggestedImprovement: requiredText(suggestedImprovement, "A melhoria sugerida"),
      reason: requiredText(reason, "O motivo"),
      expectedImpact: requiredText(expectedImpact, "O impacto esperado"),
      affectedComponents: normalizeComponents(affectedComponents),
      risk: normalizeRisk(risk),
      status: ProposalStatus.DRAFT,
      source: requiredText(source, "A origem da proposta"),
      proposedChange: normalizeProposedChange(proposedChange),
      createdAt: this.#timestamp(),
      updatedAt: this.#timestamp(),
    };
    this.#proposals.set(proposal.id, proposal);
    this.#record(proposal, "created", proposal.source, "Proposta criada em estado draft.");
    return clone(proposal);
  }

  requestApproval(id, { actor } = {}) {
    const proposal = this.#requireProposal(id);
    this.#requireActor(actor);
    this.#requireStatus(proposal, [ProposalStatus.DRAFT]);
    proposal.status = ProposalStatus.PENDING_REVIEW;
    proposal.updatedAt = this.#timestamp();
    this.#record(proposal, "approval_requested", actor, "Proposta aguarda revisão explícita.");
    return clone(proposal);
  }

  approve(id, { actor } = {}) {
    const proposal = this.#requireProposal(id);
    this.#requireActor(actor);
    this.#requireStatus(proposal, [ProposalStatus.PENDING_REVIEW]);
    proposal.status = ProposalStatus.APPROVED;
    proposal.approvedBy = actor;
    proposal.approvedAt = this.#timestamp();
    proposal.updatedAt = proposal.approvedAt;
    this.#record(proposal, "approved", actor, "Aprovação explícita registrada; nada foi aplicado automaticamente.");
    return clone(proposal);
  }

  reject(id, { actor, reason = "Rejeitada durante revisão explícita." } = {}) {
    const proposal = this.#requireProposal(id);
    this.#requireActor(actor);
    this.#requireStatus(proposal, [ProposalStatus.DRAFT, ProposalStatus.PENDING_REVIEW]);
    proposal.status = ProposalStatus.REJECTED;
    proposal.rejectedBy = actor;
    proposal.rejectionReason = requiredText(reason, "O motivo da rejeição");
    proposal.updatedAt = this.#timestamp();
    this.#record(proposal, "rejected", actor, proposal.rejectionReason);
    return clone(proposal);
  }

  applyApprovedChange(id, { actor } = {}) {
    const proposal = this.#requireProposal(id);
    this.#requireActor(actor);
    this.#requireStatus(proposal, [ProposalStatus.APPROVED]);

    const area = proposal.proposedChange?.area?.toLocaleLowerCase();
    if (area && protectedAreas.has(area)) {
      this.#record(proposal, "application_blocked", actor, `Área protegida: ${area}.`);
      throw new Error(`A aplicação automática em "${area}" é proibida.`);
    }

    try {
      const settings = this.#settingsRegistry.applyApproved(
        proposal.proposedChange,
        approvedChangePermit,
      );
      proposal.status = ProposalStatus.APPLIED;
      proposal.appliedBy = actor;
      proposal.appliedAt = this.#timestamp();
      proposal.updatedAt = proposal.appliedAt;
      proposal.applicationResult = { ok: true, settings };
      this.#record(proposal, "applied", actor, "Configuração permitida aplicada após aprovação explícita.");
      return clone(proposal);
    } catch (error) {
      proposal.status = ProposalStatus.FAILED;
      proposal.updatedAt = this.#timestamp();
      proposal.applicationResult = { ok: false, error: "A alteração não está na lista segura de configurações." };
      this.#record(proposal, "application_failed", actor, proposal.applicationResult.error);
      throw error;
    }
  }

  get(id) {
    const proposal = this.#proposals.get(String(id));
    return proposal ? clone(proposal) : undefined;
  }

  list({ status } = {}) {
    return Array.from(this.#proposals.values())
      .filter((proposal) => !status || proposal.status === status)
      .map(clone);
  }

  getHistory({ proposalId } = {}) {
    return this.#history
      .filter((entry) => !proposalId || entry.proposalId === proposalId)
      .map(clone);
  }

  count() {
    return this.#proposals.size;
  }

  historyCount() {
    return this.#history.length;
  }

  #requireProposal(id) {
    const proposal = this.#proposals.get(String(id));
    if (!proposal) throw new Error(`A proposta "${id}" não foi encontrada.`);
    return proposal;
  }

  #requireActor(actor) {
    if (actor !== "user") {
      throw new Error("Somente uma ação explícita do usuário pode aprovar ou aplicar uma proposta.");
    }
  }

  #requireStatus(proposal, allowed) {
    if (!allowed.includes(proposal.status)) {
      throw new Error(`A proposta "${proposal.id}" está no estado "${proposal.status}" e não aceita esta operação.`);
    }
  }

  #timestamp() {
    const now = this.#now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new Error("O relógio do registry de propostas é inválido.");
    }
    return now.toISOString();
  }

  #record(proposal, action, actor, result) {
    this.#history.push({
      id: `audit-${this.#createId()}`,
      proposalId: proposal.id,
      action,
      actor,
      result,
      timestamp: this.#timestamp(),
    });
  }
}

function normalizeProposedChange(change) {
  if (change === undefined || change === null) return null;
  if (typeof change !== "object" || Array.isArray(change)) {
    throw new TypeError("A alteração proposta é inválida.");
  }
  const normalized = {
    type: change.type,
    area: change.area,
    key: change.key,
    value: change.value,
  };
  if (normalized.area && protectedAreas.has(normalized.area.toLocaleLowerCase())) {
    throw new Error(`Propostas de aplicação automática na área "${normalized.area}" são bloqueadas.`);
  }
  return normalized;
}

function normalizeComponents(components) {
  if (!Array.isArray(components) || components.length > 20) {
    throw new TypeError("A lista de componentes afetados é inválida.");
  }
  return components.map((component) => requiredText(component, "O componente afetado"));
}

function normalizeRisk(risk) {
  if (!Object.values(ProposalRisk).includes(risk)) throw new TypeError("O nível de risco é inválido.");
  return risk;
}

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} é obrigatório.`);
  if (value.trim().length > 2_000) throw new TypeError(`${label} excede o tamanho permitido.`);
  return value.trim();
}

function clone(value) {
  return structuredClone(value);
}
