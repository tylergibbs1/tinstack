import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { PipesService } from "./pipes-service";

export class PipesHandler {
  constructor(private service: PipesService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- Start/Stop ---
      const startMatch = path.match(/^\/v1\/pipes\/([^/]+)\/start$/);
      if (startMatch && method === "POST") {
        const name = decodeURIComponent(startMatch[1]);
        const pipe = this.service.startPipe(name);
        return this.json(this.serializePipeSummary(pipe), ctx);
      }

      const stopMatch = path.match(/^\/v1\/pipes\/([^/]+)\/stop$/);
      if (stopMatch && method === "POST") {
        const name = decodeURIComponent(stopMatch[1]);
        const pipe = this.service.stopPipe(name);
        return this.json(this.serializePipeSummary(pipe), ctx);
      }

      // --- Single Pipe ---
      const pipeMatch = path.match(/^\/v1\/pipes\/([^/]+)$/);
      if (pipeMatch) {
        const name = decodeURIComponent(pipeMatch[1]);
        if (method === "GET") {
          const pipe = this.service.describePipe(name);
          return this.json(this.serializePipe(pipe), ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          const pipe = this.service.createPipe({
            name,
            source: body.Source,
            target: body.Target,
            roleArn: body.RoleArn,
            description: body.Description,
            desiredState: body.DesiredState,
            sourceParameters: body.SourceParameters,
            enrichment: body.Enrichment,
            enrichmentParameters: body.EnrichmentParameters,
            targetParameters: body.TargetParameters,
            tags: body.Tags,
          });
          return this.json(this.serializePipeSummary(pipe), ctx);
        }
        if (method === "PUT") {
          const body = await req.json();
          const pipe = this.service.updatePipe(name, {
            target: body.Target,
            roleArn: body.RoleArn,
            description: body.Description,
            desiredState: body.DesiredState,
            sourceParameters: body.SourceParameters,
            enrichment: body.Enrichment,
            enrichmentParameters: body.EnrichmentParameters,
            targetParameters: body.TargetParameters,
          });
          return this.json(this.serializePipeSummary(pipe), ctx);
        }
        if (method === "DELETE") {
          const pipe = this.service.deletePipe(name);
          return this.json(this.serializePipeSummary(pipe), ctx);
        }
      }

      // --- List Pipes ---
      if ((path === "/v1/pipes" || path === "/v1/pipes/") && method === "GET") {
        const namePrefix = url.searchParams.get("NamePrefix") ?? undefined;
        const pipes = this.service.listPipes(namePrefix);
        return this.json({
          Pipes: pipes.map((p) => this.serializePipeSummary(p)),
        }, ctx);
      }

      // --- Tags ---
      const tagsMatch = path.match(/^\/tags\/(.+)$/) || path.match(/^\/v1\/tags\/(.+)$/);
      if (tagsMatch) {
        const arn = decodeURIComponent(tagsMatch[1]);
        if (method === "POST") {
          const body = await req.json();
          this.service.tagResource(arn, body.tags ?? {});
          return this.json({}, ctx);
        }
        if (method === "GET") {
          const tags = this.service.listTagsForResource(arn);
          return this.json({ tags }, ctx);
        }
        if (method === "DELETE") {
          const tagKeys = url.searchParams.getAll("tagKeys");
          this.service.untagResource(arn, tagKeys);
          return this.json({}, ctx);
        }
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown Pipes operation: ${method} ${path}`, 400),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private serializePipe(pipe: any): any {
    return {
      Arn: pipe.arn,
      Name: pipe.name,
      Source: pipe.source,
      Target: pipe.target,
      RoleArn: pipe.roleArn,
      Description: pipe.description,
      DesiredState: pipe.desiredState,
      CurrentState: pipe.currentState,
      SourceParameters: pipe.sourceParameters,
      Enrichment: pipe.enrichment,
      EnrichmentParameters: pipe.enrichmentParameters,
      TargetParameters: pipe.targetParameters,
      Tags: pipe.tags,
      CreationTime: pipe.creationTime,
      LastModifiedTime: pipe.lastModifiedTime,
    };
  }

  private serializePipeSummary(pipe: any): any {
    return {
      Arn: pipe.arn,
      Name: pipe.name,
      DesiredState: pipe.desiredState,
      CurrentState: pipe.currentState,
      Source: pipe.source,
      Target: pipe.target,
      CreationTime: pipe.creationTime,
      LastModifiedTime: pipe.lastModifiedTime,
    };
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
