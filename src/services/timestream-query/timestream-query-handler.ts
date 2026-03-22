import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { TimestreamQueryService } from "./timestream-query-service";

export class TimestreamQueryHandler {
  constructor(private service: TimestreamQueryService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "Query": {
          const result = this.service.query(body.QueryString);
          return this.json({ QueryId: crypto.randomUUID(), Rows: result.rows, ColumnInfo: result.columnInfo, QueryStatus: { ProgressPercentage: 100, CumulativeBytesScanned: 0, CumulativeBytesMetered: 0 } }, ctx);
        }
        case "DescribeEndpoints": {
          const result = this.service.describeEndpoints();
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

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/x-amz-json-1.0", "x-amzn-RequestId": ctx.requestId } });
  }
}
