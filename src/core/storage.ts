import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

export interface StorageBackend<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): boolean;
  keys(): K[];
  has(key: K): boolean;
  clear(): void;
  values(): V[];
}

// --- In-Memory ---

export class InMemoryStorage<K, V> implements StorageBackend<K, V> {
  private store = new Map<K, V>();

  get(key: K): V | undefined {
    return this.store.get(key);
  }

  set(key: K, value: V): void {
    this.store.set(key, value);
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  keys(): K[] {
    return [...this.store.keys()];
  }

  has(key: K): boolean {
    return this.store.has(key);
  }

  clear(): void {
    this.store.clear();
  }

  values(): V[] {
    return [...this.store.values()];
  }
}

// --- SQLite ---

export class SQLiteStorage implements StorageBackend<string, any> {
  private db: Database;
  private tableName: string;

  private stmtGet: ReturnType<Database["prepare"]>;
  private stmtSet: ReturnType<Database["prepare"]>;
  private stmtDel: ReturnType<Database["prepare"]>;
  private stmtHas: ReturnType<Database["prepare"]>;
  private stmtKeys: ReturnType<Database["prepare"]>;
  private stmtValues: ReturnType<Database["prepare"]>;
  private stmtClear: ReturnType<Database["prepare"]>;

  constructor(db: Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;

    this.db.run(`CREATE TABLE IF NOT EXISTS "${tableName}" (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

    this.stmtGet = this.db.prepare(`SELECT value FROM "${tableName}" WHERE key = ?`);
    this.stmtSet = this.db.prepare(`INSERT OR REPLACE INTO "${tableName}" (key, value) VALUES (?, ?)`);
    this.stmtDel = this.db.prepare(`DELETE FROM "${tableName}" WHERE key = ?`);
    this.stmtHas = this.db.prepare(`SELECT 1 FROM "${tableName}" WHERE key = ? LIMIT 1`);
    this.stmtKeys = this.db.prepare(`SELECT key FROM "${tableName}"`);
    this.stmtValues = this.db.prepare(`SELECT value FROM "${tableName}"`);
    this.stmtClear = this.db.prepare(`DELETE FROM "${tableName}"`);
  }

  get(key: string): any | undefined {
    const row = this.stmtGet.get(key) as { value: string } | null;
    return row ? JSON.parse(row.value) : undefined;
  }

  set(key: string, value: any): void {
    this.stmtSet.run(key, JSON.stringify(value));
  }

  delete(key: string): boolean {
    const result = this.stmtDel.run(key);
    return result.changes > 0;
  }

  keys(): string[] {
    return (this.stmtKeys.all() as { key: string }[]).map((r) => r.key);
  }

  has(key: string): boolean {
    return this.stmtHas.get(key) != null;
  }

  clear(): void {
    this.stmtClear.run();
  }

  values(): any[] {
    return (this.stmtValues.all() as { value: string }[]).map((r) => JSON.parse(r.value));
  }
}

// --- Hybrid (in-memory reads, SQLite write-behind) ---

export class HybridStorage implements StorageBackend<string, any> {
  private memory = new Map<string, any>();
  private sqlite: SQLiteStorage;
  private dirty = new Set<string>();
  private deleted = new Set<string>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(db: Database, tableName: string, flushIntervalMs = 5000) {
    this.sqlite = new SQLiteStorage(db, tableName);

    // Load existing data into memory
    for (const key of this.sqlite.keys()) {
      this.memory.set(key, this.sqlite.get(key));
    }

    // Periodic flush
    this.flushTimer = setInterval(() => this.flush(), flushIntervalMs);
  }

  get(key: string): any | undefined {
    return this.memory.get(key);
  }

  set(key: string, value: any): void {
    this.memory.set(key, value);
    this.dirty.add(key);
    this.deleted.delete(key);
  }

  delete(key: string): boolean {
    const had = this.memory.delete(key);
    this.dirty.delete(key);
    this.deleted.add(key);
    return had;
  }

  keys(): string[] {
    return [...this.memory.keys()];
  }

  has(key: string): boolean {
    return this.memory.has(key);
  }

  clear(): void {
    this.memory.clear();
    this.dirty.clear();
    this.deleted.clear();
    this.sqlite.clear();
  }

  values(): any[] {
    return [...this.memory.values()];
  }

  flush(): void {
    for (const key of this.deleted) {
      this.sqlite.delete(key);
    }
    this.deleted.clear();

    for (const key of this.dirty) {
      const value = this.memory.get(key);
      if (value !== undefined) this.sqlite.set(key, value);
    }
    this.dirty.clear();
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

// --- Storage Factory ---

export type StorageMode = "memory" | "sqlite" | "hybrid";

export class StorageFactory {
  private db: Database | null = null;
  private hybrids: HybridStorage[] = [];

  constructor(
    private mode: StorageMode,
    private storagePath: string,
  ) {
    if (mode !== "memory") {
      mkdirSync(storagePath, { recursive: true });
      this.db = new Database(`${storagePath}/tinstack.sqlite`);
      this.db.run("PRAGMA journal_mode = WAL");
      this.db.run("PRAGMA synchronous = NORMAL");
    }
  }

  create<V>(tableName: string): StorageBackend<string, V> {
    switch (this.mode) {
      case "memory":
        return new InMemoryStorage<string, V>();
      case "sqlite":
        return new SQLiteStorage(this.db!, tableName) as StorageBackend<string, V>;
      case "hybrid": {
        const hybrid = new HybridStorage(this.db!, tableName);
        this.hybrids.push(hybrid);
        return hybrid as StorageBackend<string, V>;
      }
    }
  }

  shutdown(): void {
    for (const h of this.hybrids) h.stop();
    if (this.db) this.db.close();
  }
}
