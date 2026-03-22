import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { LambdaService, LambdaFunction } from "./lambda-service";

export class LambdaHandler {
  constructor(private service: LambdaService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /2015-03-31/functions
      if (path === "/2015-03-31/functions" && method === "POST") {
        const body = await req.json();
        const fn = this.service.createFunction(body, ctx.region);
        return this.json(fnToJson(fn), ctx, 201);
      }

      // GET /2015-03-31/functions
      if (path === "/2015-03-31/functions" && method === "GET") {
        const fns = this.service.listFunctions(ctx.region);
        return this.json({ Functions: fns.map(fnToJson) }, ctx);
      }

      // Function-specific routes
      const fnMatch = path.match(/^\/2015-03-31\/functions\/([^/]+)$/);
      if (fnMatch) {
        const name = decodeURIComponent(fnMatch[1]);
        if (method === "GET") {
          const fn = this.service.getFunction(name, ctx.region);
          return this.json({
            Configuration: fnToJson(fn),
            Code: { Location: `http://localhost/code/${fn.functionName}`, RepositoryType: "S3" },
            Tags: fn.tags,
          }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteFunction(name, ctx.region);
          return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
        }
      }

      // POST /2015-03-31/functions/{name}/invocations
      const invokeMatch = path.match(/^\/2015-03-31\/functions\/([^/]+)\/invocations$/);
      if (invokeMatch && method === "POST") {
        const name = decodeURIComponent(invokeMatch[1]);
        const payload = await req.text();
        const invocationType = req.headers.get("x-amz-invocation-type") ?? "RequestResponse";

        if (invocationType === "DryRun") {
          return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
        }

        const result = await this.service.invoke(name, payload, invocationType, ctx.region);

        const statusCode = invocationType === "Event" ? 202 : result.statusCode;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-amzn-RequestId": ctx.requestId,
          "X-Amz-Executed-Version": "$LATEST",
        };
        if (result.functionError) headers["X-Amz-Function-Error"] = result.functionError;
        if (result.logResult) headers["X-Amz-Log-Result"] = result.logResult;

        return new Response(invocationType === "Event" ? null : result.payload, { status: statusCode, headers });
      }

      // GET /2020-06-30/functions/{name}/code-signing-config
      const cscMatch = path.match(/^\/2020-06-30\/functions\/([^/]+)\/code-signing-config$/);
      if (cscMatch && method === "GET") {
        return this.json({ CodeSigningConfigArn: null, FunctionName: decodeURIComponent(cscMatch[1]) }, ctx);
      }

      // GET /2015-03-31/functions/{name}/versions
      const versionsMatch = path.match(/^\/2015-03-31\/functions\/([^/]+)\/versions$/);
      if (versionsMatch && method === "GET") {
        const name = decodeURIComponent(versionsMatch[1]);
        const fn = this.service.getFunction(name, ctx.region);
        return this.json({ Versions: [{ ...fnToJson(fn), Version: "$LATEST" }] }, ctx);
      }

      // PUT /2015-03-31/functions/{name}/code
      const codeMatch = path.match(/^\/2015-03-31\/functions\/([^/]+)\/code$/);
      if (codeMatch && method === "PUT") {
        const name = decodeURIComponent(codeMatch[1]);
        const body = await req.json();
        const fn = this.service.updateFunctionCode(name, body.ZipFile, ctx.region);
        return this.json(fnToJson(fn), ctx);
      }

      // PUT /2015-03-31/functions/{name}/configuration
      const configMatch = path.match(/^\/2015-03-31\/functions\/([^/]+)\/configuration$/);
      if (configMatch && method === "PUT") {
        const name = decodeURIComponent(configMatch[1]);
        const body = await req.json();
        const fn = this.service.updateFunctionConfiguration(name, body, ctx.region);
        return this.json(fnToJson(fn), ctx);
      }
      if (configMatch && method === "GET") {
        const name = decodeURIComponent(configMatch[1]);
        const fn = this.service.getFunction(name, ctx.region);
        return this.json(fnToJson(fn), ctx);
      }

      // Event source mappings
      if (path === "/2015-03-31/event-source-mappings" && method === "POST") {
        const body = await req.json();
        const mapping = this.service.createEventSourceMapping(
          body.FunctionName, body.EventSourceArn, body.BatchSize, body.Enabled ?? true, ctx.region,
        );
        return this.json(mappingToJson(mapping), ctx, 202);
      }

      if (path === "/2015-03-31/event-source-mappings" && method === "GET") {
        const functionName = url.searchParams.get("FunctionName") ?? undefined;
        const eventSourceArn = url.searchParams.get("EventSourceArn") ?? undefined;
        const mappings = this.service.listEventSourceMappings(functionName, eventSourceArn, ctx.region);
        return this.json({ EventSourceMappings: mappings.map(mappingToJson) }, ctx);
      }

      const esmMatch = path.match(/^\/2015-03-31\/event-source-mappings\/([^/]+)$/);
      if (esmMatch) {
        const uuid = esmMatch[1];
        if (method === "GET") return this.json(mappingToJson(this.service.getEventSourceMapping(uuid)), ctx);
        if (method === "DELETE") { const deleted = this.service.deleteEventSourceMapping(uuid); return this.json(mappingToJson(deleted), ctx, 202); }
      }

      // Tags
      const tagMatch = path.match(/^\/2019-09-25\/tags\/(.+)$/);
      if (tagMatch) {
        const arn = decodeURIComponent(tagMatch[1]);
        if (method === "POST") {
          const body = await req.json();
          this.service.tagResource(arn, body.Tags ?? {}, ctx.region);
          return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
        }
        if (method === "GET") {
          return this.json({ Tags: this.service.listTags(arn) }, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown Lambda operation: ${method} ${path}`, 404), ctx.requestId);
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

function fnToJson(fn: LambdaFunction): any {
  return {
    FunctionName: fn.functionName, FunctionArn: fn.functionArn,
    Runtime: fn.runtime, Role: fn.role, Handler: fn.handler,
    Description: fn.description, Timeout: fn.timeout, MemorySize: fn.memorySize,
    CodeSize: fn.codeSize, CodeSha256: fn.codeSha256,
    LastModified: fn.lastModified, Version: fn.version,
    Environment: { Variables: fn.environment },
    State: fn.state, LastUpdateStatus: fn.lastUpdateStatus,
    Architectures: fn.architectures,
    Layers: fn.layers?.map(l => ({ Arn: l })),
    RevisionId: fn.revisionId,
    PackageType: "Zip",
  };
}

function mappingToJson(m: any): any {
  return {
    UUID: m.uuid, FunctionArn: m.functionArn,
    EventSourceArn: m.eventSourceArn, BatchSize: m.batchSize,
    State: m.state, LastModified: m.lastModified,
  };
}
