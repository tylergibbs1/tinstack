import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface TableBucket {
  arn: string;
  name: string;
  ownerAccountId: string;
  createdAt: string;
}

export interface S3Table {
  tableARN: string;
  name: string;
  namespace: string;
  tableBucketARN: string;
  format: string;
  status: string;
  createdAt: string;
  modifiedAt: string;
}

export class S3TablesService {
  private tableBuckets: StorageBackend<string, TableBucket>;
  private tables: StorageBackend<string, S3Table>;

  constructor(private accountId: string) {
    this.tableBuckets = new InMemoryStorage();
    this.tables = new InMemoryStorage();
  }

  createTableBucket(name: string, region: string): TableBucket {
    if (this.tableBuckets.has(name)) throw new AwsError("ConflictException", `TableBucket ${name} already exists.`, 409);
    const arn = buildArn("s3tables", region, this.accountId, "bucket/", name);
    const tb: TableBucket = { arn, name, ownerAccountId: this.accountId, createdAt: new Date().toISOString() };
    this.tableBuckets.set(name, tb);
    return tb;
  }

  getTableBucket(tableBucketARN: string): TableBucket {
    const tb = this.tableBuckets.values().find(b => b.arn === tableBucketARN);
    if (!tb) throw new AwsError("NotFoundException", `TableBucket not found.`, 404);
    return tb;
  }

  listTableBuckets(): TableBucket[] { return this.tableBuckets.values(); }

  deleteTableBucket(tableBucketARN: string): void {
    const tb = this.tableBuckets.values().find(b => b.arn === tableBucketARN);
    if (!tb) throw new AwsError("NotFoundException", `TableBucket not found.`, 404);
    this.tableBuckets.delete(tb.name);
  }

  createTable(tableBucketARN: string, namespace: string, name: string, format: string, region: string): S3Table {
    const key = `${tableBucketARN}/${namespace}/${name}`;
    if (this.tables.has(key)) throw new AwsError("ConflictException", `Table ${name} already exists.`, 409);
    const arn = `${tableBucketARN}/table/${namespace}/${name}`;
    const table: S3Table = {
      tableARN: arn, name, namespace: namespace ?? "default",
      tableBucketARN, format: format ?? "ICEBERG",
      status: "active", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
    };
    this.tables.set(key, table);
    return table;
  }

  getTable(tableBucketARN: string, namespace: string, name: string): S3Table {
    const key = `${tableBucketARN}/${namespace}/${name}`;
    const t = this.tables.get(key);
    if (!t) throw new AwsError("NotFoundException", `Table ${name} not found.`, 404);
    return t;
  }

  listTables(tableBucketARN: string, namespace?: string): S3Table[] {
    return this.tables.values().filter(t =>
      t.tableBucketARN === tableBucketARN && (!namespace || t.namespace === namespace)
    );
  }

  deleteTable(tableBucketARN: string, namespace: string, name: string): void {
    const key = `${tableBucketARN}/${namespace}/${name}`;
    if (!this.tables.has(key)) throw new AwsError("NotFoundException", `Table ${name} not found.`, 404);
    this.tables.delete(key);
  }
}
