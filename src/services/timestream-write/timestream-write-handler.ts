import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { TimestreamWriteService } from "./timestream-write-service";
import type { TimestreamQueryService } from "../timestream-query/timestream-query-service";

export class TimestreamHandler {
  constructor(private writeService: TimestreamWriteService, private queryService: TimestreamQueryService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        // Write operations
        case "CreateDatabase": {
          const db = this.writeService.createDatabase(body.DatabaseName, body.KmsKeyId, ctx.region);
          return this.json({ Database: this.formatDb(db) }, ctx);
        }
        case "DescribeDatabase": {
          const db = this.writeService.describeDatabase(body.DatabaseName, ctx.region);
          return this.json({ Database: this.formatDb(db) }, ctx);
        }
        case "ListDatabases": {
          const dbs = this.writeService.listDatabases(ctx.region);
          return this.json({ Databases: dbs.map((d) => this.formatDb(d)) }, ctx);
        }
        case "DeleteDatabase":
          this.writeService.deleteDatabase(body.DatabaseName, ctx.region);
          return this.json({}, ctx);
        case "CreateTable": {
          const t = this.writeService.createTable(body.DatabaseName, body.TableName, body.RetentionProperties, ctx.region);
          return this.json({ Table: this.formatTable(t) }, ctx);
        }
        case "DescribeTable": {
          const t = this.writeService.describeTable(body.DatabaseName, body.TableName, ctx.region);
          return this.json({ Table: this.formatTable(t) }, ctx);
        }
        case "ListTables": {
          const tables = this.writeService.listTables(body.DatabaseName, ctx.region);
          return this.json({ Tables: tables.map((t) => this.formatTable(t)) }, ctx);
        }
        case "DeleteTable":
          this.writeService.deleteTable(body.DatabaseName, body.TableName, ctx.region);
          return this.json({}, ctx);
        case "WriteRecords": {
          const result = this.writeService.writeRecords(body.DatabaseName, body.TableName, body.Records ?? [], ctx.region);
          return this.json({ RecordsIngested: { Total: result.recordsIngested.total, MemoryStore: result.recordsIngested.total, MagneticStore: 0 } }, ctx);
        }
        // Query operations
        case "Query": {
          const result = this.queryService.query(body.QueryString);
          return this.json({ QueryId: crypto.randomUUID(), Rows: result.rows, ColumnInfo: result.columnInfo, QueryStatus: { ProgressPercentage: 100, CumulativeBytesScanned: 0, CumulativeBytesMetered: 0 } }, ctx);
        }
        case "DescribeEndpoints": {
          const result = this.queryService.describeEndpoints();
          return this.json({ Endpoints: result.endpoints }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private formatDb(db: any) {
    return { Arn: db.databaseArn, DatabaseName: db.databaseName, TableCount: db.tableCount, KmsKeyId: db.kmsKeyId, CreationTime: db.creationTime, LastUpdatedTime: db.lastUpdatedTime };
  }

  private formatTable(t: any) {
    return { Arn: t.tableArn, DatabaseName: t.databaseName, TableName: t.tableName, TableStatus: t.tableStatus, RetentionProperties: t.retentionProperties, CreationTime: t.creationTime, LastUpdatedTime: t.lastUpdatedTime };
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/x-amz-json-1.0", "x-amzn-RequestId": ctx.requestId } });
  }
}
