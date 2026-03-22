import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { TimestreamInfluxDBService } from "./timestream-influxdb-service";

export class TimestreamInfluxDBHandler {
  constructor(private service: TimestreamInfluxDBService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateDbInstance": {
          const inst = this.service.createDbInstance(body.name, body.dbInstanceType);
          return this.json(inst, ctx);
        }
        case "GetDbInstance":
          return this.json(this.service.getDbInstance(body.identifier), ctx);
        case "ListDbInstances":
          return this.json({ items: this.service.listDbInstances() }, ctx);
        case "DeleteDbInstance":
          return this.json(this.service.deleteDbInstance(body.identifier), ctx);
        case "CreateDbParameterGroup": {
          const pg = this.service.createDbParameterGroup(body.name, body.description);
          return this.json(pg, ctx);
        }
        case "GetDbParameterGroup":
          return this.json(this.service.getDbParameterGroup(body.identifier), ctx);
        case "ListDbParameterGroups":
          return this.json({ items: this.service.listDbParameterGroups() }, ctx);
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
      headers: { "Content-Type": "application/x-amz-json-1.0", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
