import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { BedrockService } from "./bedrock-service";

export class BedrockHandler {
  constructor(private service: BedrockService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /model/{modelId}/invoke
      const invokeMatch = path.match(/^\/model\/(.+)\/invoke$/);
      if (invokeMatch && method === "POST") {
        const modelId = decodeURIComponent(invokeMatch[1]);
        const body = await req.json();
        const result = this.service.invokeModel(modelId, body);
        return this.json(result, ctx);
      }

      // GET /foundation-models
      if (path === "/foundation-models" && method === "GET") {
        const models = this.service.listFoundationModels(ctx.region);
        return this.json({ modelSummaries: models }, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown Bedrock operation: ${method} ${path}`, 404),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  /** JSON 1.1 handler for Bedrock control-plane operations */
  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateModelCustomizationJob": {
          const jobArn = this.service.createModelCustomizationJob(
            body.jobName,
            body.baseModelIdentifier,
            body.outputModelName ?? "custom-model",
            ctx.region,
          );
          return this.json({ jobArn }, ctx);
        }
        case "GetModelCustomizationJob": {
          const job = this.service.getModelCustomizationJob(body.jobIdentifier);
          return this.json({
            jobArn: job.jobArn,
            jobName: job.jobName,
            baseModelIdentifier: job.baseModelIdentifier,
            outputModelName: job.outputModelName,
            status: job.status,
            creationTime: job.creationTime,
            lastModifiedTime: job.lastModifiedTime,
          }, ctx);
        }
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

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
