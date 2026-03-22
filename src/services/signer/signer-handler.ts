import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SignerService } from "./signer-service";

export class SignerHandler {
  constructor(private service: SignerService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // PUT /signing-profiles/{name}
      const profileMatch = path.match(/^\/signing-profiles\/([^/]+)$/);
      if (profileMatch) {
        const name = profileMatch[1];
        if (method === "PUT") {
          const body = await req.json();
          const profile = this.service.putSigningProfile(name, body.platformId, body.tags, ctx.region);
          return this.json({ arn: profile.profileVersionArn, profileVersion: profile.profileVersion, profileVersionArn: profile.profileVersionArn }, ctx);
        }
        if (method === "GET") return this.json(this.profileToJson(this.service.getSigningProfile(name)), ctx);
        if (method === "DELETE") { this.service.cancelSigningProfile(name); return this.json({}, ctx); }
      }

      // GET /signing-profiles
      if (path === "/signing-profiles" && method === "GET") {
        return this.json({ profiles: this.service.listSigningProfiles().map((p) => this.profileToJson(p)) }, ctx);
      }

      // POST /signing-jobs
      if (path === "/signing-jobs" && method === "POST") {
        const body = await req.json();
        const job = this.service.startSigningJob(body.profileName, body.source, body.destination);
        return this.json({ jobId: job.jobId, jobOwner: this.service["accountId"] }, ctx);
      }

      // GET /signing-jobs/{jobId}
      const jobMatch = path.match(/^\/signing-jobs\/([^/]+)$/);
      if (jobMatch && method === "GET") {
        const job = this.service.describeSigningJob(jobMatch[1]);
        return this.json(this.jobToJson(job), ctx);
      }

      // GET /signing-jobs
      if (path === "/signing-jobs" && method === "GET") {
        return this.json({ jobs: this.service.listSigningJobs().map((j) => this.jobToJson(j)) }, ctx);
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown Signer op: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }

  private profileToJson(p: any): any {
    return { profileName: p.profileName, profileVersion: p.profileVersion, profileVersionArn: p.profileVersionArn, platformId: p.platformId, status: p.status, tags: p.tags };
  }

  private jobToJson(j: any): any {
    return { jobId: j.jobId, profileName: j.profileName, source: j.source, status: j.status, createdAt: j.createdAt };
  }
}
