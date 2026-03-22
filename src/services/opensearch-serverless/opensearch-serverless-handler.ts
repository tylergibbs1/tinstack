import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { OpenSearchServerlessService } from "./opensearch-serverless-service";

export class OpenSearchServerlessHandler {
  constructor(private service: OpenSearchServerlessService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateCollection": {
          const c = this.service.createCollection(body.name, body.type);
          return this.json({ createCollectionDetail: c }, ctx);
        }
        case "BatchGetCollection":
          return this.json({ collectionDetails: this.service.batchGetCollection(body.ids ?? []) }, ctx);
        case "ListCollections":
          return this.json({ collectionSummaries: this.service.listCollections() }, ctx);
        case "DeleteCollection": {
          this.service.deleteCollection(body.id);
          return this.json({ deleteCollectionDetail: { id: body.id, status: "DELETING" } }, ctx);
        }
        case "CreateSecurityPolicy": {
          const p = this.service.createSecurityPolicy(body.name, body.type, body.policy);
          return this.json({ securityPolicyDetail: p }, ctx);
        }
        case "GetSecurityPolicy": {
          const p = this.service.getSecurityPolicy(body.name, body.type);
          return this.json({ securityPolicyDetail: p }, ctx);
        }
        case "ListSecurityPolicies":
          return this.json({ securityPolicySummaries: this.service.listSecurityPolicies(body.type) }, ctx);
        case "CreateAccessPolicy": {
          const p = this.service.createAccessPolicy(body.name, body.type, body.policy);
          return this.json({ accessPolicyDetail: p }, ctx);
        }
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
