import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface RedshiftStatement { id: string; clusterIdentifier: string; database: string; sql: string; status: string; createdAt: number; }

export class RedshiftDataService {
  private statements: StorageBackend<string, RedshiftStatement>;

  constructor(private accountId: string) {
    this.statements = new InMemoryStorage();
  }

  executeStatement(clusterIdentifier: string, database: string, sql: string): RedshiftStatement {
    const id = crypto.randomUUID();
    const stmt: RedshiftStatement = { id, clusterIdentifier, database, sql, status: "FINISHED", createdAt: Date.now() / 1000 };
    this.statements.set(id, stmt);
    return stmt;
  }

  describeStatement(id: string): RedshiftStatement {
    const stmt = this.statements.get(id);
    if (!stmt) throw new AwsError("ResourceNotFoundException", `Statement ${id} not found`, 404);
    return stmt;
  }

  getStatementResult(id: string): any {
    if (!this.statements.has(id)) throw new AwsError("ResourceNotFoundException", `Statement ${id} not found`, 404);
    return { Records: [[{ stringValue: "mock-value" }]], ColumnMetadata: [{ name: "col1", typeName: "varchar" }], TotalNumRows: 1 };
  }

  listStatements(): RedshiftStatement[] { return this.statements.values(); }

  listDatabases(clusterIdentifier: string): string[] { return ["dev", "public"]; }
  listSchemas(clusterIdentifier: string, database: string): string[] { return ["public", "information_schema"]; }
  listTables(clusterIdentifier: string, database: string): string[] { return ["mock_table"]; }
}
