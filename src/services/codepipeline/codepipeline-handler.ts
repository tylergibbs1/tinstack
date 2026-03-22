import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CodePipelineService } from "./codepipeline-service";

export class CodePipelineHandler {
  constructor(private service: CodePipelineService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreatePipeline": return this.createPipeline(body, ctx);
        case "GetPipeline": return this.getPipeline(body, ctx);
        case "ListPipelines": return this.listPipelines(ctx);
        case "UpdatePipeline": return this.updatePipeline(body, ctx);
        case "DeletePipeline":
          this.service.deletePipeline(body.name, ctx.region);
          return this.json({}, ctx);
        case "GetPipelineState": return this.getPipelineState(body, ctx);
        case "StartPipelineExecution": return this.startPipelineExecution(body, ctx);
        case "ListPipelineExecutions": return this.listPipelineExecutions(body, ctx);
        case "GetPipelineExecution": return this.getPipelineExecution(body, ctx);
        case "PutActionRevision":
          this.service.putActionRevision(body.pipelineName, body.stageName, body.actionName, body.actionRevision, ctx.region);
          return this.json({}, ctx);
        case "TagResource":
          this.service.tagResource(body.resourceArn, body.tags ?? []);
          return this.json({}, ctx);
        case "UntagResource":
          this.service.untagResource(body.resourceArn, body.tagKeys ?? []);
          return this.json({}, ctx);
        case "ListTagsForResource": return this.listTagsForResource(body, ctx);
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
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

  private pipelineResponse(p: any): any {
    return {
      name: p.name, roleArn: p.roleArn, stages: p.stages,
      version: p.version, artifactStore: p.artifactStore,
      artifactStores: p.artifactStores, pipelineType: p.pipelineType,
    };
  }

  private createPipeline(body: any, ctx: RequestContext): Response {
    const pipeline = this.service.createPipeline(body, ctx.region);
    return this.json({
      pipeline: this.pipelineResponse(pipeline),
      tags: this.service.listTagsForResource(pipeline.arn),
    }, ctx);
  }

  private getPipeline(body: any, ctx: RequestContext): Response {
    const pipeline = this.service.getPipeline(body.name, ctx.region);
    return this.json({
      pipeline: this.pipelineResponse(pipeline),
      metadata: {
        pipelineArn: pipeline.arn,
        created: pipeline.created,
        updated: pipeline.updated,
      },
    }, ctx);
  }

  private listPipelines(ctx: RequestContext): Response {
    const pipelines = this.service.listPipelines(ctx.region);
    return this.json({ pipelines }, ctx);
  }

  private updatePipeline(body: any, ctx: RequestContext): Response {
    const pipeline = this.service.updatePipeline(body, ctx.region);
    return this.json({ pipeline: this.pipelineResponse(pipeline) }, ctx);
  }

  private getPipelineState(body: any, ctx: RequestContext): Response {
    const state = this.service.getPipelineState(body.name, ctx.region);
    return this.json(state, ctx);
  }

  private startPipelineExecution(body: any, ctx: RequestContext): Response {
    const exec = this.service.startPipelineExecution(body.name, ctx.region);
    return this.json({ pipelineExecutionId: exec.pipelineExecutionId }, ctx);
  }

  private listPipelineExecutions(body: any, ctx: RequestContext): Response {
    const execs = this.service.listPipelineExecutions(body.pipelineName, ctx.region);
    return this.json({
      pipelineExecutionSummaries: execs.map((e) => ({
        pipelineExecutionId: e.pipelineExecutionId,
        status: e.status,
        startTime: e.startTime,
        lastUpdateTime: e.lastUpdateTime,
      })),
    }, ctx);
  }

  private getPipelineExecution(body: any, ctx: RequestContext): Response {
    const exec = this.service.getPipelineExecution(body.pipelineName, body.pipelineExecutionId, ctx.region);
    return this.json({
      pipelineExecution: {
        pipelineExecutionId: exec.pipelineExecutionId,
        pipelineName: exec.pipelineName,
        pipelineVersion: exec.pipelineVersion,
        status: exec.status,
        artifactRevisions: exec.artifactRevisions,
      },
    }, ctx);
  }

  private listTagsForResource(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTagsForResource(body.resourceArn);
    return this.json({ tags }, ctx);
  }
}
