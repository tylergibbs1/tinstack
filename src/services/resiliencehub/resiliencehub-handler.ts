import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ResilienceHubService } from "./resiliencehub-service";

export class ResilienceHubHandler {
  constructor(private service: ResilienceHubService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const path = new URL(req.url).pathname;
    const method = req.method;

    try {
      // Some list operations use GET
      if (method === "GET") {
        if (path === "/list-apps") return this.json({ appSummaries: this.service.listApps() }, ctx);
        if (path === "/list-resiliency-policies") return this.json({ resiliencyPolicies: this.service.listResiliencyPolicies() }, ctx);
      }

      if (method === "POST") {
        const body = await req.json();

        switch (path) {
          case "/create-app": {
            const app = this.service.createApp(body.name, ctx.region, body.description, body.policyArn, body.tags);
            return this.json({ app }, ctx);
          }
          case "/describe-app": {
            const app = this.service.describeApp(body.appArn);
            return this.json({ app }, ctx);
          }
          case "/list-apps": {
            return this.json({ appSummaries: this.service.listApps() }, ctx);
          }
          case "/delete-app": {
            this.service.deleteApp(body.appArn);
            return this.json({ appArn: body.appArn }, ctx);
          }
          case "/create-resiliency-policy": {
            const policy = this.service.createResiliencyPolicy(body.policyName, body.tier, body.policy, ctx.region, body.policyDescription);
            return this.json({ policy }, ctx);
          }
          case "/describe-resiliency-policy": {
            const policy = this.service.describeResiliencyPolicy(body.policyArn);
            return this.json({ policy }, ctx);
          }
          case "/list-resiliency-policies": {
            return this.json({ resiliencyPolicies: this.service.listResiliencyPolicies() }, ctx);
          }
          case "/delete-resiliency-policy": {
            this.service.deleteResiliencyPolicy(body.policyArn);
            return this.json({ policyArn: body.policyArn }, ctx);
          }
          case "/import-resources-to-draft-app-version": {
            const result = this.service.importResourcesToDraftAppVersion(body.appArn, body.sourceArns ?? []);
            return this.json(result, ctx);
          }
          case "/start-app-assessment": {
            const assessment = this.service.startAppAssessment(body.appArn, body.assessmentName, ctx.region);
            return this.json({ assessment }, ctx);
          }
          case "/describe-app-assessment": {
            const assessment = this.service.describeAppAssessment(body.assessmentArn);
            return this.json({ assessment }, ctx);
          }
        }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown ResilienceHub operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
