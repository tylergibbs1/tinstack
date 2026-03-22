import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

interface TimestreamTable {
  databaseName: string;
  tableName: string;
  tableArn: string;
  tableStatus: string;
  retentionProperties: { MemoryStoreRetentionPeriodInHours: number; MagneticStoreRetentionPeriodInDays: number };
  creationTime: number;
  lastUpdatedTime: number;
  records: any[];
}

interface TimestreamDatabase {
  databaseName: string;
  databaseArn: string;
  tableCount: number;
  kmsKeyId: string;
  creationTime: number;
  lastUpdatedTime: number;
}

export class TimestreamWriteService {
  private databases: StorageBackend<string, TimestreamDatabase>;
  private tables: StorageBackend<string, TimestreamTable>;

  constructor(private accountId: string) {
    this.databases = new InMemoryStorage();
    this.tables = new InMemoryStorage();
  }

  private dbKey(region: string, name: string): string { return `${region}#${name}`; }
  private tableKey(region: string, db: string, table: string): string { return `${region}#${db}#${table}`; }

  createDatabase(name: string, kmsKeyId: string | undefined, region: string): TimestreamDatabase {
    const key = this.dbKey(region, name);
    if (this.databases.has(key)) throw new AwsError("ConflictException", `Database ${name} already exists.`, 409);
    const now = Date.now() / 1000;
    const db: TimestreamDatabase = {
      databaseName: name,
      databaseArn: buildArn("timestream", region, this.accountId, "database/", name),
      tableCount: 0,
      kmsKeyId: kmsKeyId ?? `arn:aws:kms:${region}:${this.accountId}:key/default`,
      creationTime: now,
      lastUpdatedTime: now,
    };
    this.databases.set(key, db);
    return db;
  }

  describeDatabase(name: string, region: string): TimestreamDatabase {
    const db = this.databases.get(this.dbKey(region, name));
    if (!db) throw new AwsError("ResourceNotFoundException", `Database ${name} not found.`, 404);
    return db;
  }

  listDatabases(region: string): TimestreamDatabase[] {
    return this.databases.values().filter((d) => d.databaseArn.includes(`:${region}:`));
  }

  deleteDatabase(name: string, region: string): void {
    const key = this.dbKey(region, name);
    if (!this.databases.has(key)) throw new AwsError("ResourceNotFoundException", `Database ${name} not found.`, 404);
    this.databases.delete(key);
  }

  createTable(databaseName: string, tableName: string, retentionProperties: any, region: string): TimestreamTable {
    this.describeDatabase(databaseName, region);
    const key = this.tableKey(region, databaseName, tableName);
    if (this.tables.has(key)) throw new AwsError("ConflictException", `Table ${tableName} already exists.`, 409);
    const now = Date.now() / 1000;
    const table: TimestreamTable = {
      databaseName,
      tableName,
      tableArn: buildArn("timestream", region, this.accountId, `database/${databaseName}/table/`, tableName),
      tableStatus: "ACTIVE",
      retentionProperties: retentionProperties ?? { MemoryStoreRetentionPeriodInHours: 6, MagneticStoreRetentionPeriodInDays: 73000 },
      creationTime: now,
      lastUpdatedTime: now,
      records: [],
    };
    this.tables.set(key, table);
    const db = this.databases.get(this.dbKey(region, databaseName))!;
    db.tableCount++;
    return table;
  }

  describeTable(databaseName: string, tableName: string, region: string): TimestreamTable {
    const table = this.tables.get(this.tableKey(region, databaseName, tableName));
    if (!table) throw new AwsError("ResourceNotFoundException", `Table ${tableName} not found.`, 404);
    return table;
  }

  listTables(databaseName: string, region: string): TimestreamTable[] {
    this.describeDatabase(databaseName, region);
    return this.tables.values().filter((t) => t.databaseName === databaseName && t.tableArn.includes(`:${region}:`));
  }

  deleteTable(databaseName: string, tableName: string, region: string): void {
    const key = this.tableKey(region, databaseName, tableName);
    if (!this.tables.has(key)) throw new AwsError("ResourceNotFoundException", `Table ${tableName} not found.`, 404);
    this.tables.delete(key);
    const db = this.databases.get(this.dbKey(region, databaseName));
    if (db) db.tableCount--;
  }

  writeRecords(databaseName: string, tableName: string, records: any[], region: string): { recordsIngested: { total: number } } {
    const table = this.describeTable(databaseName, tableName, region);
    for (const r of records) table.records.push({ ...r, timestamp: Date.now() });
    return { recordsIngested: { total: records.length } };
  }
}
