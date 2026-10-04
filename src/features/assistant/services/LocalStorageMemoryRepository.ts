import type {
  MemoryAuthorization,
  NewPersistentMemory,
  PersistentMemory,
  PersistentMemoryCategory,
  PersistentMemoryRepository,
} from "../domain/PersistentMemory";

const STORAGE_KEY = "nexus:persistent-memory:v1";
const categories: PersistentMemoryCategory[] = [
  "preference",
  "setting",
  "explicit",
  "conversation-context",
];

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  } as Storage;
}

function resolveStorage(storage?: Storage | null): Storage {
  if (storage) return storage;

  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return globalThis.localStorage as Storage;
    }
  } catch {
    // Ignore browsers that block access to localStorage and fall back to memory storage.
  }

  return createMemoryStorage();
}

function generateMemoryId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  return `memory-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class LocalStorageMemoryRepository implements PersistentMemoryRepository {
  private readonly storage: Storage;

  constructor(storage?: Storage | null) {
    this.storage = resolveStorage(storage);
  }

  save(
    memory: NewPersistentMemory,
    authorization: MemoryAuthorization,
  ): PersistentMemory {
    if (
      authorization !== "explicit-user-action" &&
      authorization !== "explicit-system-rule"
    ) {
      throw new Error("É necessária uma autorização explícita para salvar uma memória.");
    }

    const content = memory.content.trim();
    if (!content || !categories.includes(memory.category)) {
      throw new Error("A memória precisa ter conteúdo e uma categoria válida.");
    }

    const saved: PersistentMemory = {
      ...memory,
      content,
      id: generateMemoryId(),
      createdAt: new Date().toISOString(),
    };
    this.storage.setItem(STORAGE_KEY, JSON.stringify([...this.readAll(), saved]));
    return saved;
  }

  query(text: string): PersistentMemory[] {
    const searchText = (text ?? "").trim().toLocaleLowerCase();
    if (!searchText) return this.readAll();
    return this.readAll().filter((memory) =>
      `${memory.category} ${memory.content}`.toLocaleLowerCase().includes(searchText),
    );
  }

  remove(id: string): boolean {
    const normalizedId = id?.trim();
    if (!normalizedId) return false;

    const memories = this.readAll();
    const remaining = memories.filter((memory) => memory.id !== normalizedId);
    if (remaining.length === memories.length) return false;
    this.storage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    return true;
  }

  private readAll(): PersistentMemory[] {
    const serialized = this.storage.getItem(STORAGE_KEY);
    if (!serialized) return [];

    let value: unknown;
    try {
      value = JSON.parse(serialized);
    } catch {
      throw new Error("O armazenamento de memórias contém dados inválidos.");
    }

    if (
      !Array.isArray(value) ||
      !value.every(
        (memory) =>
          memory &&
          typeof memory.id === "string" &&
          typeof memory.category === "string" &&
          categories.includes(memory.category as PersistentMemoryCategory) &&
          typeof memory.content === "string" &&
          typeof memory.createdAt === "string",
      )
    ) {
      throw new Error("O armazenamento de memórias contém dados inválidos.");
    }

    return value as PersistentMemory[];
  }
}
