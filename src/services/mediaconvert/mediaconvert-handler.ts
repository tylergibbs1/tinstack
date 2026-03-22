import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { MediaConvertService } from "./mediaconvert-service";

export class MediaConvertHandler {
  constructor(private service: MediaConvertService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /2017-08-29/endpoints — DescribeEndpoints
      if (path === "/2017-08-29/endpoints" && method === "POST") {
        const endpoints = this.service.describeEndpoints();
        return this.json({ endpoints }, ctx);
      }

      // Jobs: /2017-08-29/jobs
      const jobIdMatch = path.match(/^\/2017-08-29\/jobs\/(.+)$/);
      if (jobIdMatch) {
        const id = decodeURIComponent(jobIdMatch[1]);
        if (method === "GET") {
          const job = this.service.getJob(id);
          return this.json({ job: this.jobResponse(job) }, ctx);
        }
        if (method === "DELETE") {
          this.service.cancelJob(id);
          return this.json({}, ctx);
        }
      }

      if (path === "/2017-08-29/jobs") {
        if (method === "POST") {
          const body = await req.json();
          const job = this.service.createJob(
            body.role ?? body.Role ?? "",
            body.settings ?? body.Settings ?? {},
            ctx.region,
            body.queue ?? body.Queue,
          );
          return this.json({ job: this.jobResponse(job) }, ctx, 201);
        }
        if (method === "GET") {
          const status = url.searchParams.get("status") ?? undefined;
          const queue = url.searchParams.get("queue") ?? undefined;
          const jobs = this.service.listJobs(status, queue);
          return this.json({ jobs: jobs.map((j) => this.jobResponse(j)) }, ctx);
        }
      }

      // Queues: /2017-08-29/queues
      const queueNameMatch = path.match(/^\/2017-08-29\/queues\/(.+)$/);
      if (queueNameMatch) {
        const name = decodeURIComponent(queueNameMatch[1]);
        if (method === "GET") {
          const queue = this.service.getQueue(name);
          return this.json({ queue: this.queueResponse(queue) }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteQueue(name);
          return this.json({}, ctx);
        }
      }

      if (path === "/2017-08-29/queues") {
        if (method === "POST") {
          const body = await req.json();
          const queue = this.service.createQueue(
            body.name ?? body.Name ?? "",
            body.description ?? body.Description ?? "",
            ctx.region,
          );
          return this.json({ queue: this.queueResponse(queue) }, ctx, 201);
        }
        if (method === "GET") {
          const queues = this.service.listQueues();
          return this.json({ queues: queues.map((q) => this.queueResponse(q)) }, ctx);
        }
      }

      // Presets: /2017-08-29/presets
      const presetNameMatch = path.match(/^\/2017-08-29\/presets\/(.+)$/);
      if (presetNameMatch) {
        const name = decodeURIComponent(presetNameMatch[1]);
        if (method === "GET") {
          const preset = this.service.getPreset(name);
          return this.json({ preset: this.presetResponse(preset) }, ctx);
        }
        if (method === "DELETE") {
          this.service.deletePreset(name);
          return this.json({}, ctx);
        }
      }

      if (path === "/2017-08-29/presets") {
        if (method === "POST") {
          const body = await req.json();
          const preset = this.service.createPreset(
            body.name ?? body.Name ?? "",
            body.settings ?? body.Settings ?? {},
            body.description ?? body.Description ?? "",
            ctx.region,
          );
          return this.json({ preset: this.presetResponse(preset) }, ctx, 201);
        }
        if (method === "GET") {
          const presets = this.service.listPresets();
          return this.json({ presets: presets.map((p) => this.presetResponse(p)) }, ctx);
        }
      }

      // Job Templates: /2017-08-29/jobTemplates
      const templateNameMatch = path.match(/^\/2017-08-29\/jobTemplates\/(.+)$/);
      if (templateNameMatch) {
        const name = decodeURIComponent(templateNameMatch[1]);
        if (method === "GET") {
          const template = this.service.getJobTemplate(name);
          return this.json({ jobTemplate: this.jobTemplateResponse(template) }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteJobTemplate(name);
          return this.json({}, ctx);
        }
      }

      if (path === "/2017-08-29/jobTemplates") {
        if (method === "POST") {
          const body = await req.json();
          const template = this.service.createJobTemplate(
            body.name ?? body.Name ?? "",
            body.settings ?? body.Settings ?? {},
            body.description ?? body.Description ?? "",
            ctx.region,
          );
          return this.json({ jobTemplate: this.jobTemplateResponse(template) }, ctx, 201);
        }
        if (method === "GET") {
          const templates = this.service.listJobTemplates();
          return this.json({ jobTemplates: templates.map((t) => this.jobTemplateResponse(t)) }, ctx);
        }
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown MediaConvert operation: ${method} ${path}`, 400),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private jobResponse(job: any): any {
    return {
      id: job.id,
      arn: job.arn,
      role: job.role,
      settings: job.settings,
      queue: job.queue,
      status: job.status,
      createdAt: job.createdAt,
      timing: job.timing,
      outputGroupDetails: job.outputGroupDetails,
    };
  }

  private queueResponse(queue: any): any {
    return {
      name: queue.name,
      arn: queue.arn,
      description: queue.description,
      status: queue.status,
      type: queue.type,
      createdAt: queue.createdAt,
    };
  }

  private presetResponse(preset: any): any {
    return {
      name: preset.name,
      arn: preset.arn,
      description: preset.description,
      settings: preset.settings,
      type: preset.type,
      createdAt: preset.createdAt,
    };
  }

  private jobTemplateResponse(template: any): any {
    return {
      name: template.name,
      arn: template.arn,
      description: template.description,
      settings: template.settings,
      type: template.type,
      createdAt: template.createdAt,
    };
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
