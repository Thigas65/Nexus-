export type PersistentMemoryCategory =
  | "preference"
  | "setting"
  | "explicit"
  | "conversation-context";

export interface PersistentMemory {
  id: string;
  category: PersistentMemoryCategory;
  content: string;
  createdAt: string;
}

export type NewPersistentMemory = Omit<PersistentMemory, "id" | "createdAt">;

export type MemoryAuthorization =
  | "explicit-user-action"
  | "explicit-system-rule";

export interface PersistentMemoryRepository {
  save(
    memory: NewPersistentMemory,
    authorization: MemoryAuthorization,
  ): PersistentMemory;
  query(text: string): PersistentMemory[];
  remove(id: string): boolean;
}
