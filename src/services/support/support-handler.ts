import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SupportService } from "./support-service";

export class SupportHandler {
  constructor(private service: SupportService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "DescribeServices":
          return this.json({ services: this.service.describeServices() }, ctx);

        case "DescribeSeverityLevels":
          return this.json({ severityLevels: this.service.describeSeverityLevels() }, ctx);

        case "CreateCase": {
          const caseId = this.service.createCase(body);
          return this.json({ caseId }, ctx);
        }

        case "DescribeCases": {
          const cases = this.service.describeCases(body.caseIdList, body.includeResolvedCases);
          return this.json({ cases }, ctx);
        }

        case "ResolveCase": {
          const result = this.service.resolveCase(body.caseId);
          return this.json(result, ctx);
        }

        case "AddCommunicationToCase": {
          const success = this.service.addCommunicationToCase(body.caseId, body.communicationBody);
          return this.json({ result: success }, ctx);
        }

        case "DescribeCommunications": {
          const communications = this.service.describeCommunications(body.caseId);
          return this.json({ communications }, ctx);
        }

        case "DescribeTrustedAdvisorChecks":
          return this.json({ checks: this.service.describeTrustedAdvisorChecks() }, ctx);

        case "DescribeTrustedAdvisorCheckResult":
          return this.json(this.service.describeTrustedAdvisorCheckResult(body.checkId), ctx);

        case "RefreshTrustedAdvisorCheck":
          return this.json(this.service.refreshTrustedAdvisorCheck(body.checkId), ctx);

        default:
          return jsonErrorResponse(
            new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400),
            ctx.requestId,
          );
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
