import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { BatchService } from "./batch-service";

export class BatchHandler {
  constructor(private service: BatchService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      const body = method !== "GET" && method !== "DELETE" ? await req.json().catch(() => ({})) : {};

      // Compute environments
      if (path === "/v1/createcomputeenvironment" && method === "POST") {
        const ce = this.service.createComputeEnvironment(
          body.computeEnvironmentName, body.type, body.state,
          body.computeResources, body.serviceRole, ctx.region, body.tags,
        );
        return this.json({ computeEnvironmentName: ce.computeEnvironmentName, computeEnvironmentArn: ce.computeEnvironmentArn }, ctx);
      }

      if (path === "/v1/describecomputeenvironments" && method === "POST") {
        const envs = this.service.describeComputeEnvironments(body.computeEnvironments);
        return this.json({ computeEnvironments: envs }, ctx);
      }

      if (path === "/v1/updatecomputeenvironment" && method === "POST") {
        const ce = this.service.updateComputeEnvironment(
          body.computeEnvironment, body.state, body.computeResources, body.serviceRole,
        );
        return this.json({ computeEnvironmentName: ce.computeEnvironmentName, computeEnvironmentArn: ce.computeEnvironmentArn }, ctx);
      }

      if (path === "/v1/deletecomputeenvironment" && method === "POST") {
        this.service.deleteComputeEnvironment(body.computeEnvironment);
        return this.json({}, ctx);
      }

      // Job queues
      if (path === "/v1/createjobqueue" && method === "POST") {
        const jq = this.service.createJobQueue(
          body.jobQueueName, body.state, body.priority,
          body.computeEnvironmentOrder, ctx.region, body.tags,
        );
        return this.json({ jobQueueName: jq.jobQueueName, jobQueueArn: jq.jobQueueArn }, ctx);
      }

      if (path === "/v1/describejobqueues" && method === "POST") {
        const queues = this.service.describeJobQueues(body.jobQueues);
        return this.json({ jobQueues: queues }, ctx);
      }

      if (path === "/v1/updatejobqueue" && method === "POST") {
        const jq = this.service.updateJobQueue(
          body.jobQueue, body.state, body.priority, body.computeEnvironmentOrder,
        );
        return this.json({ jobQueueName: jq.jobQueueName, jobQueueArn: jq.jobQueueArn }, ctx);
      }

      if (path === "/v1/deletejobqueue" && method === "POST") {
        this.service.deleteJobQueue(body.jobQueue);
        return this.json({}, ctx);
      }

      // Job definitions
      if (path === "/v1/registerjobdefinition" && method === "POST") {
        const jd = this.service.registerJobDefinition(
          body.jobDefinitionName, body.type, body.containerProperties,
          body.parameters, ctx.region, body.tags,
        );
        return this.json({
          jobDefinitionName: jd.jobDefinitionName,
          jobDefinitionArn: jd.jobDefinitionArn,
          revision: jd.revision,
        }, ctx);
      }

      if (path === "/v1/describejobdefinitions" && method === "POST") {
        const defs = this.service.describeJobDefinitions(body.jobDefinitions, body.status);
        return this.json({ jobDefinitions: defs }, ctx);
      }

      if (path === "/v1/deregisterjobdefinition" && method === "POST") {
        this.service.deregisterJobDefinition(body.jobDefinition);
        return this.json({}, ctx);
      }

      // Jobs
      if (path === "/v1/submitjob" && method === "POST") {
        const job = this.service.submitJob(
          body.jobName, body.jobQueue, body.jobDefinition,
          body.parameters, body.containerOverrides, ctx.region, body.tags,
        );
        return this.json({ jobId: job.jobId, jobName: job.jobName, jobArn: job.jobArn }, ctx);
      }

      if (path === "/v1/describejobs" && method === "POST") {
        const jobs = this.service.describeJobs(body.jobs ?? []);
        return this.json({ jobs }, ctx);
      }

      if (path === "/v1/listjobs" && method === "POST") {
        const summaries = this.service.listJobs(body.jobQueue, body.jobStatus);
        return this.json({
          jobSummaryList: summaries.map((j) => ({
            jobId: j.jobId,
            jobName: j.jobName,
            jobArn: j.jobArn,
            status: j.status,
            createdAt: j.createdAt,
          })),
        }, ctx);
      }

      if (path === "/v1/terminatejob" && method === "POST") {
        this.service.terminateJob(body.jobId, body.reason);
        return this.json({}, ctx);
      }

      if (path === "/v1/canceljob" && method === "POST") {
        this.service.cancelJob(body.jobId, body.reason);
        return this.json({}, ctx);
      }

      // Tags — /v1/tags/{arn}
      const tagMatch = path.match(/^\/v1\/tags\/(.+)$/);
      if (tagMatch) {
        const arn = decodeURIComponent(tagMatch[1]);
        if (method === "POST") {
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

      return jsonErrorResponse(new AwsError("UnsupportedOperation", `Route ${method} ${path} not supported.`, 400), ctx.requestId);
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
