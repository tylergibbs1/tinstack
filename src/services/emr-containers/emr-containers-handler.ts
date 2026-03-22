import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { EmrContainersService } from "./emr-containers-service";

function ts(epoch: number | undefined): string | undefined {
  if (epoch === undefined) return undefined;
  return new Date(epoch * 1000).toISOString();
}

export class EmrContainersHandler {
  constructor(private service: EmrContainersService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // List/Create virtual clusters
      if ((path === "/virtualclusters" || path === "/virtualclusters/") && method === "GET")
        return this.json({ virtualClusters: this.service.listVirtualClusters().map((v) => ({ id: v.id, name: v.name, arn: v.arn, state: v.state, containerProvider: v.containerProvider, createdAt: ts(v.createdAt) })) }, ctx);
      if ((path === "/virtualclusters" || path === "/virtualclusters/") && method === "POST") {
        const body = await req.json();
        const vc = this.service.createVirtualCluster(body.name, body.containerProvider, body.tags, ctx.region);
        return this.json({ id: vc.id, name: vc.name, arn: vc.arn }, ctx);
      }

      // Job runs under virtual cluster
      const jobRunsMatch = path.match(/^\/virtualclusters\/([^/]+)\/jobruns$/);
      if (jobRunsMatch) {
        const vcId = jobRunsMatch[1];
        if (method === "GET") return this.json({ jobRuns: this.service.listJobRuns(vcId).map((r) => ({ id: r.id, virtualClusterId: r.virtualClusterId, arn: r.arn, name: r.name, state: r.state, createdAt: ts(r.createdAt) })) }, ctx);
        if (method === "POST") {
          const body = await req.json();
          const run = this.service.startJobRun(vcId, body.name, body.executionRoleArn, body.releaseLabel, body.jobDriver, body.tags, ctx.region);
          return this.json({ id: run.id, virtualClusterId: run.virtualClusterId, arn: run.arn, name: run.name }, ctx);
        }
      }

      // Single job run (GET or DELETE for cancel)
      const jobRunMatch = path.match(/^\/virtualclusters\/([^/]+)\/jobruns\/([^/]+)$/);
      if (jobRunMatch && method === "DELETE") {
        const run = this.service.cancelJobRun(jobRunMatch[1], jobRunMatch[2]);
        return this.json({ id: run.id, virtualClusterId: run.virtualClusterId }, ctx);
      }
      if (jobRunMatch && method === "GET") {
        const run = this.service.describeJobRun(jobRunMatch[1], jobRunMatch[2]);
        return this.json({ jobRun: { id: run.id, virtualClusterId: run.virtualClusterId, arn: run.arn, name: run.name, state: run.state, executionRoleArn: run.executionRoleArn, releaseLabel: run.releaseLabel, jobDriver: run.jobDriver, createdAt: ts(run.createdAt), finishedAt: ts(run.finishedAt) } }, ctx);
      }

      // Single virtual cluster
      const vcMatch = path.match(/^\/virtualclusters\/([^/]+)$/);
      if (vcMatch) {
        const id = vcMatch[1];
        if (method === "GET") {
          const vc = this.service.describeVirtualCluster(id);
          return this.json({ virtualCluster: { id: vc.id, name: vc.name, arn: vc.arn, state: vc.state, containerProvider: vc.containerProvider, createdAt: ts(vc.createdAt), tags: vc.tags } }, ctx);
        }
        if (method === "DELETE") {
          const vc = this.service.deleteVirtualCluster(id);
          return this.json({ id: vc.id, virtualClusterId: vc.id }, ctx);
        }
      }

      // Tags
      if (path.startsWith("/tags/")) {
        const arn = decodeURIComponent(path.slice("/tags/".length));
        if (method === "POST") { const body = await req.json(); this.service.tagResource(arn, body.tags ?? {}); return this.json({}, ctx); }
        if (method === "DELETE") { const keys = url.searchParams.getAll("tagKeys"); this.service.untagResource(arn, keys); return this.json({}, ctx); }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown EMR Containers operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }
}
