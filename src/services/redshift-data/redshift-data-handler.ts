import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { RedshiftDataService } from "./redshift-data-service";

export class RedshiftDataHandler {
  constructor(private service: RedshiftDataService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "ExecuteStatement": {
          const stmt = this.service.executeStatement(body.ClusterIdentifier ?? "default", body.Database ?? "dev", body.Sql);
          return this.json({ Id: stmt.id, ClusterIdentifier: stmt.clusterIdentifier, Database: stmt.database, CreatedAt: stmt.createdAt }, ctx);
        }
        case "DescribeStatement": {
          const stmt = this.service.describeStatement(body.Id);
          return this.json({ Id: stmt.id, Status: stmt.status, QueryString: stmt.sql, ClusterIdentifier: stmt.clusterIdentifier }, ctx);
        }
        case "GetStatementResult":
          return this.json(this.service.getStatementResult(body.Id), ctx);
        case "ListStatements":
          return this.json({ Statements: this.service.listStatements().map((s) => ({ Id: s.id, Status: s.status, CreatedAt: s.createdAt })) }, ctx);
        case "ListDatabases":
          return this.json({ Databases: this.service.listDatabases(body.ClusterIdentifier) }, ctx);
        case "ListSchemas":
          return this.json({ Schemas: this.service.listSchemas(body.ClusterIdentifier, body.Database) }, ctx);
        case "ListTables":
          return this.json({ Tables: this.service.listTables(body.ClusterIdentifier, body.Database) }, ctx);
        default:
          return jsonErrorResponse(new AwsError("InvalidAction", `Unknown action ${action}`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
