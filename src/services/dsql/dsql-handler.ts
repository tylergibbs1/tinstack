import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { DsqlService } from "./dsql-service";

export class DsqlHandler {
  constructor(private service: DsqlService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // GET/DELETE/POST /cluster/{identifier}
      const idMatch = path.match(/^\/cluster\/([^/]+)$/);
      if (idMatch) {
        const id = decodeURIComponent(idMatch[1]);
        if (method === "GET") return this.json(this.clusterResponse(this.service.getCluster(id)), ctx);
        if (method === "DELETE") return this.json(this.clusterResponse(this.service.deleteCluster(id)), ctx);
        if (method === "POST") {
          const body = await req.json().catch(() => ({}));
          return this.json(this.clusterResponse(this.service.updateCluster(id, body.deletionProtectionEnabled)), ctx);
        }
      }

      // POST /cluster — CreateCluster
      // GET /cluster — ListClusters
      if (path === "/cluster") {
        if (method === "POST") {
          const body = await req.json().catch(() => ({}));
          const cluster = this.service.createCluster(ctx.region, body.deletionProtectionEnabled, body.tags);
          return this.json(this.clusterResponse(cluster), ctx);
        }
        if (method === "GET") {
          const nextToken = url.searchParams.get("nextToken");
          return this.json({ clusters: this.service.listClusters().map(c => this.clusterResponse(c)), nextToken: null }, ctx);
        }
      }

      // Also support /clusters (plural) for compatibility
      const idMatchPlural = path.match(/^\/clusters\/([^/]+)$/);
      if (idMatchPlural) {
        const id = decodeURIComponent(idMatchPlural[1]);
        if (method === "GET") return this.json(this.clusterResponse(this.service.getCluster(id)), ctx);
        if (method === "DELETE") return this.json(this.clusterResponse(this.service.deleteCluster(id)), ctx);
      }
      if (path === "/clusters") {
        if (method === "POST") {
          const body = await req.json().catch(() => ({}));
          const cluster = this.service.createCluster(ctx.region, body.deletionProtectionEnabled, body.tags);
          return this.json(this.clusterResponse(cluster), ctx);
        }
        if (method === "GET") {
          return this.json({ clusters: this.service.listClusters().map(c => this.clusterResponse(c)) }, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown DSQL operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private clusterResponse(c: any): any {
    return {
      identifier: c.identifier, arn: c.arn, status: c.status,
      endpoint: c.endpoint, creationTime: c.creationTime,
      deletionProtectionEnabled: c.deletionProtectionEnabled,
    };
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
