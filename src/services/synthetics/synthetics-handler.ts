import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SyntheticsService } from "./synthetics-service";

export class SyntheticsHandler {
  constructor(private service: SyntheticsService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // CreateCanary: POST /canary
      if (path === "/canary" && method === "POST") {
        const body = await req.json();
        const canary = this.service.createCanary(body, ctx.region);
        return this.json({ Canary: this.service.formatCanary(canary) }, ctx);
      }

      // DescribeCanaries: POST /canaries (the SDK sends POST)
      if (path === "/canaries" && method === "POST") {
        const canaries = this.service.describeCanaries();
        return this.json({ Canaries: canaries.map((c) => this.service.formatCanary(c)) }, ctx);
      }

      // DescribeCanariesLastRun: POST /canaries/last-run
      if (path === "/canaries/last-run" && method === "POST") {
        const runs = this.service.describeCanariesLastRun();
        return this.json({
          CanariesLastRun: runs.map((r) => ({
            CanaryName: r.Name,
            LastRun: r.LastRun,
          })),
        }, ctx);
      }

      // GetCanary: GET /canary/{name}
      const canaryMatch = path.match(/^\/canary\/([^/]+)$/);
      if (canaryMatch) {
        const name = decodeURIComponent(canaryMatch[1]);

        if (method === "GET") {
          const canary = this.service.getCanary(name);
          return this.json({ Canary: this.service.formatCanary(canary) }, ctx);
        }

        // UpdateCanary: PATCH /canary/{name}
        if (method === "PATCH") {
          const body = await req.json();
          this.service.updateCanary(name, body);
          return this.json({}, ctx);
        }

        // DeleteCanary: DELETE /canary/{name}
        if (method === "DELETE") {
          this.service.deleteCanary(name);
          return this.json({}, ctx);
        }
      }

      // StartCanary: POST /canary/{name}/start
      const startMatch = path.match(/^\/canary\/([^/]+)\/start$/);
      if (startMatch && method === "POST") {
        this.service.startCanary(decodeURIComponent(startMatch[1]));
        return this.json({}, ctx);
      }

      // StopCanary: POST /canary/{name}/stop
      const stopMatch = path.match(/^\/canary\/([^/]+)\/stop$/);
      if (stopMatch && method === "POST") {
        this.service.stopCanary(decodeURIComponent(stopMatch[1]));
        return this.json({}, ctx);
      }

      // TagResource: POST /tags/{arn+}
      if (path.startsWith("/tags/") && method === "POST") {
        const arn = decodeURIComponent(path.slice("/tags/".length));
        const body = await req.json();
        this.service.tagResource(arn, body.Tags ?? {});
        return this.json({}, ctx);
      }

      // UntagResource: DELETE /tags/{arn+}?tagKeys=...
      if (path.startsWith("/tags/") && method === "DELETE") {
        const arn = decodeURIComponent(path.slice("/tags/".length));
        const tagKeys = url.searchParams.getAll("tagKeys");
        this.service.untagResource(arn, tagKeys);
        return this.json({}, ctx);
      }

      // ListTagsForResource: GET /tags/{arn+}
      if (path.startsWith("/tags/") && method === "GET") {
        const arn = decodeURIComponent(path.slice("/tags/".length));
        const tags = this.service.listTagsForResource(arn);
        return this.json({ Tags: tags }, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown Synthetics operation: ${method} ${path}`, 400),
        ctx.requestId,
      );
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
