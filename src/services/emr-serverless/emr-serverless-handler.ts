import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { EmrServerlessService } from "./emr-serverless-service";

export class EmrServerlessHandler {
  constructor(private service: EmrServerlessService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // List/Create applications
      if ((path === "/applications" || path === "/applications/") && method === "GET")
        return this.json({ applications: this.service.listApplications().map((a) => ({ id: a.applicationId, name: a.name, arn: a.arn, releaseLabel: a.releaseLabel, type: a.type, state: a.state, createdAt: a.createdAt })) }, ctx);
      if ((path === "/applications" || path === "/applications/") && method === "POST") {
        const body = await req.json();
        const app = this.service.createApplication(body.name, body.releaseLabel, body.type, body.tags, ctx.region);
        return this.json({ applicationId: app.applicationId, name: app.name, arn: app.arn }, ctx);
      }

      // Start/Stop application
      const startMatch = path.match(/^\/applications\/([^/]+)\/start$/);
      if (startMatch && method === "POST") { this.service.startApplication(startMatch[1]); return this.json({}, ctx); }
      const stopMatch = path.match(/^\/applications\/([^/]+)\/stop$/);
      if (stopMatch && method === "POST") { this.service.stopApplication(stopMatch[1]); return this.json({}, ctx); }

      // Job runs under application
      const jobRunsMatch = path.match(/^\/applications\/([^/]+)\/jobruns$/);
      if (jobRunsMatch) {
        const appId = jobRunsMatch[1];
        if (method === "GET") return this.json({ jobRuns: this.service.listJobRuns(appId).map((r) => ({ applicationId: r.applicationId, id: r.jobRunId, arn: r.arn, name: r.name, state: r.state, createdAt: r.createdAt })) }, ctx);
        if (method === "POST") {
          const body = await req.json();
          const run = this.service.startJobRun(appId, body.executionRoleArn, body.jobDriver, body.name, ctx.region);
          return this.json({ applicationId: run.applicationId, jobRunId: run.jobRunId, arn: run.arn }, ctx);
        }
      }

      // Single job run / cancel
      const cancelMatch = path.match(/^\/applications\/([^/]+)\/jobruns\/([^/]+)\/cancel$/);
      if (cancelMatch && method === "POST") {
        this.service.cancelJobRun(cancelMatch[1], cancelMatch[2]);
        return this.json({}, ctx);
      }
      const jobRunMatch = path.match(/^\/applications\/([^/]+)\/jobruns\/([^/]+)$/);
      if (jobRunMatch && method === "DELETE") {
        this.service.cancelJobRun(jobRunMatch[1], jobRunMatch[2]);
        const run = this.service.getJobRun(jobRunMatch[1], jobRunMatch[2]);
        return this.json({ applicationId: run.applicationId, jobRunId: run.jobRunId }, ctx);
      }
      if (jobRunMatch && method === "GET") {
        const run = this.service.getJobRun(jobRunMatch[1], jobRunMatch[2]);
        return this.json({ jobRun: { applicationId: run.applicationId, jobRunId: run.jobRunId, arn: run.arn, name: run.name, state: run.state, executionRole: run.executionRole, jobDriver: run.jobDriver, createdAt: run.createdAt, updatedAt: run.updatedAt } }, ctx);
      }

      // Single application
      const appMatch = path.match(/^\/applications\/([^/]+)$/);
      if (appMatch) {
        const id = appMatch[1];
        if (method === "GET") {
          const app = this.service.getApplication(id);
          return this.json({ application: { applicationId: app.applicationId, name: app.name, arn: app.arn, releaseLabel: app.releaseLabel, type: app.type, state: app.state, createdAt: app.createdAt, updatedAt: app.updatedAt, tags: app.tags } }, ctx);
        }
        if (method === "DELETE") { this.service.deleteApplication(id); return this.json({}, ctx); }
        if (method === "PATCH") {
          const body = await req.json();
          const app = this.service.updateApplication(id, body);
          return this.json({ application: { applicationId: app.applicationId, name: app.name, arn: app.arn, releaseLabel: app.releaseLabel, type: app.type, state: app.state } }, ctx);
        }
      }

      // Tags
      if (path.startsWith("/tags/")) {
        const arn = decodeURIComponent(path.slice("/tags/".length));
        if (method === "POST") { const body = await req.json(); this.service.tagResource(arn, body.tags ?? {}); return this.json({}, ctx); }
        if (method === "DELETE") { const keys = url.searchParams.getAll("tagKeys"); this.service.untagResource(arn, keys); return this.json({}, ctx); }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown EMR Serverless operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }
}
