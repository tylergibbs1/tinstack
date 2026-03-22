import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { MediaConnectService } from "./mediaconnect-service";

export class MediaConnectHandler {
  constructor(private service: MediaConnectService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // PUT /v1/flows/start/{flowArn}
      const startMatch = path.match(/^\/v1\/flows\/start\/(.+)$/);
      if (startMatch && method === "POST") {
        const flow = this.service.startFlow(decodeURIComponent(startMatch[1]));
        return this.json({ flowArn: flow.flowArn, status: flow.status }, ctx);
      }

      // PUT /v1/flows/stop/{flowArn}
      const stopMatch = path.match(/^\/v1\/flows\/stop\/(.+)$/);
      if (stopMatch && method === "POST") {
        const flow = this.service.stopFlow(decodeURIComponent(stopMatch[1]));
        return this.json({ flowArn: flow.flowArn, status: flow.status }, ctx);
      }

      // POST /v1/flows/{flowArn}/outputs — AddFlowOutputs
      const outputsMatch = path.match(/^\/v1\/flows\/([^/]+)\/outputs$/);
      if (outputsMatch && method === "POST") {
        const body = await req.json();
        const outputs = this.service.addFlowOutputs(
          decodeURIComponent(outputsMatch[1]),
          body.outputs ?? body.Outputs ?? [],
        );
        return this.json({ flowArn: decodeURIComponent(outputsMatch[1]), outputs }, ctx, 201);
      }

      // DELETE /v1/flows/{flowArn}/outputs/{outputArn}
      const removeOutputMatch = path.match(/^\/v1\/flows\/([^/]+)\/outputs\/(.+)$/);
      if (removeOutputMatch && method === "DELETE") {
        this.service.removeFlowOutput(
          decodeURIComponent(removeOutputMatch[1]),
          decodeURIComponent(removeOutputMatch[2]),
        );
        return this.json({ flowArn: decodeURIComponent(removeOutputMatch[1]), outputArn: decodeURIComponent(removeOutputMatch[2]) }, ctx);
      }

      // GET/DELETE /v1/flows/{flowArn}
      const flowArnMatch = path.match(/^\/v1\/flows\/(.+)$/);
      if (flowArnMatch && !path.includes("/outputs") && !path.includes("/start") && !path.includes("/stop")) {
        const arn = decodeURIComponent(flowArnMatch[1]);
        if (method === "GET") {
          const flow = this.service.describeFlow(arn);
          return this.json({ flow }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteFlow(arn);
          return this.json({}, ctx);
        }
      }

      // POST /v1/flows — CreateFlow
      // GET /v1/flows — ListFlows
      if (path === "/v1/flows") {
        if (method === "POST") {
          const body = await req.json();
          const flow = this.service.createFlow(body.name ?? body.Name ?? "", ctx.region, body.source ?? body.Source);
          return this.json({ flow }, ctx, 201);
        }
        if (method === "GET") {
          const flows = this.service.listFlows();
          return this.json({ flows: flows.map(f => ({ flowArn: f.flowArn, name: f.name, status: f.status, description: f.description, availabilityZone: f.availabilityZone, sourceType: "OWNED" })) }, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown MediaConnect operation: ${method} ${path}`, 400), ctx.requestId);
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
