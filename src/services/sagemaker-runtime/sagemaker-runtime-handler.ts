import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SageMakerRuntimeService } from "./sagemaker-runtime-service";

export class SageMakerRuntimeHandler {
  constructor(private service: SageMakerRuntimeService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      // POST /endpoints/{endpointName}/invocations
      const match = path.match(/^\/endpoints\/([^/]+)\/invocations$/);
      if (match && req.method === "POST") {
        const body = await req.text();
        const contentType = req.headers.get("content-type") ?? "application/json";
        const result = this.service.invokeEndpoint(match[1], body, contentType);
        return new Response(result.body, {
          headers: { "Content-Type": result.contentType, "x-amzn-RequestId": ctx.requestId, "x-Amzn-Invoked-Production-Variant": "AllTraffic" },
        });
      }

      return jsonErrorResponse(new AwsError("NotFound", "Route not found", 404), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }
}
