import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SwfService } from "./swf-service";

export class SwfHandler {
  constructor(private service: SwfService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "RegisterDomain":
          this.service.registerDomain(body.name, body.description, body.workflowExecutionRetentionPeriodInDays);
          return this.json({}, ctx);
        case "ListDomains":
          return this.json({ domainInfos: this.service.listDomains(body.registrationStatus ?? "REGISTERED") }, ctx);
        case "DescribeDomain": {
          const d = this.service.describeDomain(body.name);
          return this.json({ domainInfo: { name: d.name, status: d.status, description: d.description } }, ctx);
        }
        case "DeprecateDomain":
          this.service.deprecateDomain(body.name);
          return this.json({}, ctx);
        case "RegisterWorkflowType":
          this.service.registerWorkflowType(body.domain, body.name, body.version);
          return this.json({}, ctx);
        case "ListWorkflowTypes":
          return this.json({ typeInfos: this.service.listWorkflowTypes(body.domain) }, ctx);
        case "RegisterActivityType":
          this.service.registerActivityType(body.domain, body.name, body.version);
          return this.json({}, ctx);
        case "ListActivityTypes":
          return this.json({ typeInfos: this.service.listActivityTypes(body.domain) }, ctx);
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
