import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { RdsDataService } from "./rdsdata-service";

export class RdsDataHandler {
  constructor(private service: RdsDataService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      const body = await req.json();

      if (path === "/Execute" || path === "/execute") {
        const result = this.service.executeStatement(body.resourceArn, body.secretArn, body.sql, body.transactionId);
        return this.json(result, ctx);
      }
      if (path === "/BatchExecute" || path === "/batch-execute") {
        const result = this.service.batchExecuteStatement(body.resourceArn, body.secretArn, body.sql, body.parameterSets ?? []);
        return this.json(result, ctx);
      }
      if (path === "/BeginTransaction" || path === "/begin-transaction") {
        const id = this.service.beginTransaction(body.resourceArn, body.secretArn, body.database);
        return this.json({ transactionId: id }, ctx);
      }
      if (path === "/CommitTransaction" || path === "/commit-transaction") {
        const status = this.service.commitTransaction(body.resourceArn, body.secretArn, body.transactionId);
        return this.json({ transactionStatus: status }, ctx);
      }
      if (path === "/RollbackTransaction" || path === "/rollback-transaction") {
        const status = this.service.rollbackTransaction(body.resourceArn, body.secretArn, body.transactionId);
        return this.json({ transactionStatus: status }, ctx);
      }

      return jsonErrorResponse(new AwsError("NotFound", "Route not found", 404), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
