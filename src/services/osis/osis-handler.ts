import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { OsisService } from "./osis-service";

export class OsisHandler {
  constructor(private service: OsisService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    // Strip the version prefix
    const subpath = path.replace(/^\/2022-01-01\/osis\//, "");

    try {
      // createPipeline
      if (subpath === "createPipeline" && method === "POST") {
        const body = await req.json();
        const tags = body.Tags ? body.Tags.reduce((acc: Record<string, string>, t: any) => { acc[t.Key] = t.Value; return acc; }, {}) : undefined;
        const p = this.service.createPipeline(body.PipelineName, body.MinUnits ?? 1, body.MaxUnits ?? 4, body.PipelineConfigurationBody ?? "", ctx.region, tags);
        return this.json({ Pipeline: this.pipelineResponse(p) }, ctx);
      }

      // Also support: POST /2022-01-01/osis/pipelines (alternate)
      if (subpath === "pipelines" && method === "POST") {
        const body = await req.json();
        const tags = body.Tags ? body.Tags.reduce((acc: Record<string, string>, t: any) => { acc[t.Key] = t.Value; return acc; }, {}) : undefined;
        const p = this.service.createPipeline(body.PipelineName, body.MinUnits ?? 1, body.MaxUnits ?? 4, body.PipelineConfigurationBody ?? "", ctx.region, tags);
        return this.json({ Pipeline: this.pipelineResponse(p) }, ctx);
      }

      // getPipeline/{name}
      const getMatch = subpath.match(/^getPipeline\/(.+)$/);
      if (getMatch && method === "GET") {
        return this.json({ Pipeline: this.pipelineResponse(this.service.getPipeline(decodeURIComponent(getMatch[1]))) }, ctx);
      }
      // Also: GET pipelines/{name}
      const pipelineNameMatch = subpath.match(/^pipelines\/(.+)$/);
      if (pipelineNameMatch && method === "GET") {
        return this.json({ Pipeline: this.pipelineResponse(this.service.getPipeline(decodeURIComponent(pipelineNameMatch[1]))) }, ctx);
      }

      // listPipelines
      if ((subpath === "listPipelines" || subpath === "pipelines") && method === "GET") {
        return this.json({ Pipelines: this.service.listPipelines().map(p => this.pipelineResponse(p)) }, ctx);
      }

      // deletePipeline/{name}
      const deleteMatch = subpath.match(/^deletePipeline\/(.+)$/);
      if (deleteMatch && method === "DELETE") {
        this.service.deletePipeline(decodeURIComponent(deleteMatch[1]));
        return this.json({}, ctx);
      }
      if (pipelineNameMatch && method === "DELETE") {
        this.service.deletePipeline(decodeURIComponent(pipelineNameMatch[1]));
        return this.json({}, ctx);
      }

      // updatePipeline/{name}
      const updateMatch = subpath.match(/^updatePipeline\/(.+)$/);
      if (updateMatch && method === "PUT") {
        const body = await req.json();
        const p = this.service.updatePipeline(decodeURIComponent(updateMatch[1]), body.MinUnits, body.MaxUnits, body.PipelineConfigurationBody);
        return this.json({ Pipeline: this.pipelineResponse(p) }, ctx);
      }
      if (pipelineNameMatch && method === "PUT") {
        const body = await req.json();
        const p = this.service.updatePipeline(decodeURIComponent(pipelineNameMatch[1]), body.MinUnits, body.MaxUnits, body.PipelineConfigurationBody);
        return this.json({ Pipeline: this.pipelineResponse(p) }, ctx);
      }

      // startPipeline/{name}
      const startMatch = subpath.match(/^startPipeline\/(.+)$/);
      if (startMatch && method === "PUT") {
        const p = this.service.startPipeline(decodeURIComponent(startMatch[1]));
        return this.json({ Pipeline: this.pipelineResponse(p) }, ctx);
      }

      // stopPipeline/{name}
      const stopMatch = subpath.match(/^stopPipeline\/(.+)$/);
      if (stopMatch && method === "PUT") {
        const p = this.service.stopPipeline(decodeURIComponent(stopMatch[1]));
        return this.json({ Pipeline: this.pipelineResponse(p) }, ctx);
      }

      // Tags
      if (subpath === "tags" && method === "GET") {
        const arn = url.searchParams.get("arn") ?? "";
        const tags = this.service.listTagsForResource(arn);
        return this.json({ Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })) }, ctx);
      }
      if (subpath === "tags" && method === "POST") {
        const body = await req.json();
        const tags = (body.Tags ?? []).reduce((acc: Record<string, string>, t: any) => { acc[t.Key] = t.Value; return acc; }, {});
        this.service.tagResource(body.Arn, tags);
        return this.json({}, ctx);
      }
      if (subpath === "untag" && method === "POST") {
        const body = await req.json();
        this.service.untagResource(body.Arn, body.TagKeys ?? []);
        return this.json({}, ctx);
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown OSIS operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private pipelineResponse(p: any): any {
    return {
      PipelineName: p.pipelineName, PipelineArn: p.pipelineArn, Status: p.status,
      MinUnits: p.minUnits, MaxUnits: p.maxUnits,
      PipelineConfigurationBody: p.pipelineConfigurationBody,
      CreatedAt: p.createdAt, LastUpdatedAt: p.lastUpdatedAt,
      IngestEndpointUrls: p.ingestEndpointUrls,
    };
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
