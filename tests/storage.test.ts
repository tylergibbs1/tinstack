import { describe, test, expect, afterAll } from "bun:test";
import { InMemoryStorage, SQLiteStorage, HybridStorage, StorageFactory } from "../src/core/storage";
import { Database } from "bun:sqlite";
import { unlinkSync } from "node:fs";

describe("InMemoryStorage", () => {
  test("CRUD operations", () => {
    const store = new InMemoryStorage<string, { name: string }>();
    store.set("a", { name: "Alice" });
    store.set("b", { name: "Bob" });
    expect(store.get("a")).toEqual({ name: "Alice" });
    expect(store.has("a")).toBe(true);
    expect(store.keys()).toEqual(["a", "b"]);
    expect(store.values().length).toBe(2);
    store.delete("a");
    expect(store.has("a")).toBe(false);
    store.clear();
    expect(store.keys().length).toBe(0);
  });
});

describe("SQLiteStorage", () => {
  const dbPath = "/tmp/tinstack-test-sqlite.db";
  let db: Database;

  afterAll(() => {
    db?.close();
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  });

  test("CRUD operations with persistence", () => {
    db = new Database(dbPath);
    db.run("PRAGMA journal_mode = WAL");
    const store = new SQLiteStorage(db, "test_items");

    store.set("k1", { value: 42 });
    store.set("k2", { value: 99 });

    expect(store.get("k1")).toEqual({ value: 42 });
    expect(store.has("k1")).toBe(true);
    expect(store.keys()).toEqual(["k1", "k2"]);
    expect(store.values().length).toBe(2);

    store.delete("k1");
    expect(store.has("k1")).toBe(false);

    // Data persists — create new instance reading same table
    const store2 = new SQLiteStorage(db, "test_items");
    expect(store2.get("k2")).toEqual({ value: 99 });
    expect(store2.has("k1")).toBe(false);

    store.clear();
    expect(store.keys().length).toBe(0);
  });
});

describe("HybridStorage", () => {
  const dbPath = "/tmp/tinstack-test-hybrid.db";
  let db: Database;

  afterAll(() => {
    db?.close();
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  });

  test("reads from memory, flushes to SQLite", () => {
    db = new Database(dbPath);
    db.run("PRAGMA journal_mode = WAL");
    const store = new HybridStorage(db, "hybrid_items", 999999); // long interval, manual flush

    store.set("x", { data: "hello" });
    expect(store.get("x")).toEqual({ data: "hello" });

    // Before flush, SQLite is empty
    const sqliteStore = new SQLiteStorage(db, "hybrid_items");
    expect(sqliteStore.get("x")).toBeUndefined();

    // After flush, SQLite has the data
    (store as any).flush();
    expect(sqliteStore.get("x")).toEqual({ data: "hello" });

    // Delete + flush
    store.delete("x");
    (store as any).flush();
    expect(sqliteStore.get("x")).toBeUndefined();

    (store as any).stop();
  });
});

describe("StorageFactory", () => {
  test("creates memory storage", () => {
    const factory = new StorageFactory("memory", "/tmp/tinstack-test-factory");
    const store = factory.create("test");
    store.set("a", "b");
    expect(store.get("a")).toBe("b");
    factory.shutdown();
  });

  test("creates sqlite storage", () => {
    const factory = new StorageFactory("sqlite", "/tmp/tinstack-test-factory");
    const store = factory.create("test_sql");
    store.set("x", { v: 1 });
    expect(store.get("x")).toEqual({ v: 1 });
    factory.shutdown();
  });
});
