import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { TextractService } from "./textract-service";

export class TextractHandler {
  constructor(private service: TextractService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "DetectDocumentText": {
          const result = this.service.detectDocumentText(body.Document);
          return this.json(result, ctx);
        }
        case "AnalyzeDocument": {
          const result = this.service.analyzeDocument(body.Document, body.FeatureTypes);
          return this.json(result, ctx);
        }
        case "StartDocumentTextDetection": {
          const jobId = this.service.startDocumentTextDetection(body.DocumentLocation);
          return this.json({ JobId: jobId }, ctx);
        }
        case "GetDocumentTextDetection": {
          const result = this.service.getDocumentTextDetection(body.JobId);
          return this.json(result, ctx);
        }
        case "StartDocumentAnalysis": {
          const jobId = this.service.startDocumentAnalysis(body.DocumentLocation, body.FeatureTypes);
          return this.json({ JobId: jobId }, ctx);
        }
        case "GetDocumentAnalysis": {
          const result = this.service.getDocumentAnalysis(body.JobId);
          return this.json(result, ctx);
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

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
