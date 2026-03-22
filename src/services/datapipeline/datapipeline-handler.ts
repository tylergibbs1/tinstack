import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { DataPipelineService } from "./datapipeline-service";

export class DataPipelineHandler {
  constructor(private service: DataPipelineService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreatePipeline": {
          const id = this.service.createPipeline(body.name, body.uniqueId, body.description);
          return this.json({ pipelineId: id }, ctx);
        }
        case "ListPipelines": {
          const pipelines = this.service.listPipelines();
          return this.json({ pipelineIdList: pipelines, hasMoreResults: false }, ctx);
        }
        case "DescribePipelines": {
          const pipelines = this.service.describePipelines(body.pipelineIds ?? []);
          return this.json({
            pipelineDescriptionList: pipelines.map(p => ({
              pipelineId: p.pipelineId, name: p.name, description: p.description, fields: p.fields, tags: Object.entries(p.tags).map(([key, value]) => ({ key, value })),
            })),
          }, ctx);
        }
        case "DeletePipeline": {
          this.service.deletePipeline(body.pipelineId);
          return this.json({}, ctx);
        }
        case "PutPipelineDefinition": {
          const result = this.service.putPipelineDefinition(body.pipelineId, body.pipelineObjects ?? []);
          return this.json({ errored: result.errored, validationErrors: [], validationWarnings: [] }, ctx);
        }
        case "GetPipelineDefinition": {
          const objects = this.service.getPipelineDefinition(body.pipelineId);
          return this.json({ pipelineObjects: objects }, ctx);
        }
        case "ActivatePipeline": {
          this.service.activatePipeline(body.pipelineId);
          return this.json({}, ctx);
        }
        case "DeactivatePipeline": {
          this.service.deactivatePipeline(body.pipelineId);
          return this.json({}, ctx);
        }
        case "SetStatus": {
          this.service.setStatus(body.pipelineId, body.objectIds ?? [], body.status ?? "");
          return this.json({}, ctx);
        }
        case "AddTags": {
          this.service.addTags(body.pipelineId, body.tags ?? []);
          return this.json({}, ctx);
        }
        case "RemoveTags": {
          this.service.removeTags(body.pipelineId, body.tagKeys ?? []);
          return this.json({}, ctx);
        }
        case "ListTags": {  // Not a standard action but included for completeness
          // Data Pipeline doesn't have ListTags - tags come back in DescribePipelines
          return this.json({}, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown DataPipeline action: ${action}`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
