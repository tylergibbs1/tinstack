import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SageMakerMetricsService } from "./sagemaker-metrics-service";

export class SageMakerMetricsHandler {
  constructor(private service: SageMakerMetricsService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (path === "/BatchPutMetrics" && req.method === "PUT") {
        const body = await req.json();
        const result = this.service.batchPutMetrics(body.TrialComponentName, body.MetricData ?? []);
        return this.json({ Errors: result.errors }, ctx);
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
