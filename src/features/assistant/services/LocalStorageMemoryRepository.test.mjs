import assert from "node:assert/strict";
import test from "node:test";
import { LocalStorageMemoryRepository } from "./LocalStorageMemoryRepository.ts";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    get length() {
      return values.size;
    },
  };
}

test("saves and queries memories using explicit authorization only", () => {
  const repository = new LocalStorageMemoryRepository(createStorage());

  const saved = repository.save(
    { category: "preference", content: "  Prefiro respostas curtas  " },
    "explicit-user-action",
  );

  assert.equal(saved.content, "Prefiro respostas curtas");
  assert.equal(saved.id.length > 0, true);
  assert.deepEqual(repository.query("curtas"), [saved]);
  assert.deepEqual(repository.query("categoria inexistente"), []);
  assert.deepEqual(repository.query(""), [saved]);
});

test("rejects invalid authorization and invalid category", () => {
  const repository = new LocalStorageMemoryRepository(createStorage());

  assert.throws(
    () => repository.save({ category: "preference", content: "Texto" }, "implicit"),
    /autorização explícita/,
  );

  assert.throws(
    () => repository.save({ category: "invalid", content: "Texto" }, "explicit-system-rule"),
    /categoria válida/,
  );
});

test("removes saved memories and keeps storage resilient to invalid data", () => {
  const repository = new LocalStorageMemoryRepository(createStorage());
  const memory = repository.save(
    { category: "setting", content: "Tema escuro" },
    "explicit-system-rule",
  );

  assert.equal(repository.remove(memory.id), true);
  assert.equal(repository.remove(memory.id), false);

  const storage = createStorage();
  storage.setItem("nexus:persistent-memory:v1", "{broken");
  const invalidRepository = new LocalStorageMemoryRepository(storage);
  assert.throws(() => invalidRepository.query("tema"), /dados inválidos/);
});
