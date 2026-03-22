import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { Macie2Service } from "./macie2-service";

export class Macie2Handler {
  constructor(private service: Macie2Service) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Enable/Disable Macie
      if (path === "/macie" && method === "POST") {
        const body = await req.json().catch(() => ({}));
        this.service.enableMacie(body.findingPublishingFrequency);
        return this.json({}, ctx);
      }
      if (path === "/macie" && method === "GET") {
        const session = this.service.getMacieSession();
        return this.json(session, ctx);
      }
      if (path === "/macie" && method === "DELETE") {
        this.service.disableMacie();
        return this.json({}, ctx);
      }

      // Classification Jobs
      const jobIdMatch = path.match(/^\/jobs\/(.+)$/);
      if (jobIdMatch && method === "GET") {
        return this.json(this.service.describeClassificationJob(decodeURIComponent(jobIdMatch[1])), ctx);
      }
      if (path === "/jobs" && method === "POST") {
        const body = await req.json();
        const job = this.service.createClassificationJob(body.name, body.jobType, body.s3JobDefinition, ctx.region, body.tags);
        return this.json({ jobId: job.jobId, jobArn: job.jobArn }, ctx);
      }
      if (path === "/jobs/list" && method === "POST") {
        return this.json({ items: this.service.listClassificationJobs() }, ctx);
      }

      // Findings Filters
      const filterIdMatch = path.match(/^\/findingsfilters\/(.+)$/);
      if (filterIdMatch) {
        const id = decodeURIComponent(filterIdMatch[1]);
        if (method === "GET") return this.json(this.service.getFindingsFilter(id), ctx);
        if (method === "DELETE") { this.service.deleteFindingsFilter(id); return this.json({}, ctx); }
      }
      if (path === "/findingsfilters" && method === "POST") {
        const body = await req.json();
        const f = this.service.createFindingsFilter(body.name, body.action, body.findingCriteria, body.description ?? "", ctx.region);
        return this.json({ id: f.id, arn: f.arn }, ctx);
      }
      if (path === "/findingsfilters" && method === "GET") {
        return this.json({ findingsFilterListItems: this.service.listFindingsFilters() }, ctx);
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown Macie2 operation: ${method} ${path}`, 400), ctx.requestId);
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
