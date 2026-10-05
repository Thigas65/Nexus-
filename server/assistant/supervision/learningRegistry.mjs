import { randomUUID } from "node:crypto";

export const LearningType = Object.freeze({
  FACT: "fact",
  PREFERENCE: "preference",
  CORRECTION: "correction",
  ERROR: "error",
  SOLUTION: "solution",
  IMPROVEMENT_SUGGESTION: "improvement-suggestion",
});

const validTypes = new Set(Object.values(LearningType));

export class LearningRegistry {
  #learnings = new Map();
  #now;
  #createId;

  constructor({ now = () => new Date(), createId = () => randomUUID() } = {}) {
    this.#now = now;
    this.#createId = createId;
  }

  register({ type, content, source, confidence = 0.5 }) {
    const normalizedContent = normalizeRequiredText(content, "O conteúdo do aprendizado");
    const normalizedSource = normalizeRequiredText(source, "A origem do aprendizado");
    if (!validTypes.has(type)) {
      throw new TypeError("O tipo de aprendizado não é válido.");
    }
    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
      throw new TypeError("A confiança deve ser um número entre 0 e 1.");
    }

    const timestamp = this.#timestamp();
    const learning = {
      id: `learning-${this.#createId()}`,
      type,
      content: normalizedContent,
      source: normalizedSource,
      confidence,
      approved: false,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    };
    this.#learnings.set(learning.id, learning);
    return clone(learning);
  }

  query({ text = "", type, activeOnly = true, approvedOnly = false } = {}) {
    const normalizedText = typeof text === "string" ? text.trim().toLocaleLowerCase() : "";
    return Array.from(this.#learnings.values())
      .filter((learning) => (!activeOnly || learning.active))
      .filter((learning) => (!approvedOnly || learning.approved))
      .filter((learning) => (!type || learning.type === type))
      .filter((learning) =>
        !normalizedText ||
        `${learning.type} ${learning.content} ${learning.source}`.toLocaleLowerCase().includes(normalizedText),
      )
      .map(clone);
  }

  update(id, patch) {
    const current = this.#requireLearning(id);
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new TypeError("A atualização do aprendizado é inválida.");
    }
    if ("approved" in patch || "active" in patch || "id" in patch || "createdAt" in patch) {
      throw new TypeError("A aprovação e o estado ativo só podem ser alterados por operações supervisionadas.");
    }
    const updated = { ...current };
    if ("content" in patch) updated.content = normalizeRequiredText(patch.content, "O conteúdo do aprendizado");
    if ("source" in patch) updated.source = normalizeRequiredText(patch.source, "A origem do aprendizado");
    if ("type" in patch) {
      if (!validTypes.has(patch.type)) throw new TypeError("O tipo de aprendizado não é válido.");
      updated.type = patch.type;
    }
    if ("confidence" in patch) {
      if (typeof patch.confidence !== "number" || patch.confidence < 0 || patch.confidence > 1) {
        throw new TypeError("A confiança deve ser um número entre 0 e 1.");
      }
      updated.confidence = patch.confidence;
    }
    updated.updatedAt = this.#timestamp();
    updated.revision += 1;
    this.#learnings.set(id, updated);
    return clone(updated);
  }

  invalidate(id, { reason, source }) {
    const current = this.#requireLearning(id);
    const invalidationReason = normalizeRequiredText(reason, "O motivo da invalidação");
    const invalidationSource = normalizeRequiredText(source, "A origem da invalidação");
    const updated = {
      ...current,
      active: false,
      invalidatedAt: this.#timestamp(),
      invalidatedBy: invalidationSource,
      invalidationReason,
      updatedAt: this.#timestamp(),
      revision: current.revision + 1,
    };
    this.#learnings.set(id, updated);
    return clone(updated);
  }

  approve(id, { actor } = {}) {
    if (actor !== "user") {
      throw new Error("Somente uma ação explícita do usuário pode aprovar um aprendizado.");
    }
    const current = this.#requireLearning(id);
    if (!current.active) throw new Error("Um aprendizado inativo não pode ser aprovado.");
    const updated = {
      ...current,
      approved: true,
      approvedBy: actor,
      approvedAt: this.#timestamp(),
      updatedAt: this.#timestamp(),
      revision: current.revision + 1,
    };
    this.#learnings.set(id, updated);
    return clone(updated);
  }

  count() {
    return this.#learnings.size;
  }

  #requireLearning(id) {
    const learning = this.#learnings.get(String(id));
    if (!learning) throw new Error(`O aprendizado "${id}" não foi encontrado.`);
    return learning;
  }

  #timestamp() {
    const now = this.#now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new Error("O relógio do registry de aprendizados é inválido.");
    }
    return now.toISOString();
  }
}

function normalizeRequiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} é obrigatório.`);
  if (value.trim().length > 4_000) throw new TypeError(`${label} excede o tamanho permitido.`);
  return value.trim();
}

function clone(value) {
  return { ...value };
}
