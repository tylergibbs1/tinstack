import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { GlacierService } from "./glacier-service";

export class GlacierHandler {
  constructor(private service: GlacierService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // PUT /-/vaults/{vaultName}
      const vaultMatch = path.match(/^\/-\/vaults\/([^/]+)$/);
      if (vaultMatch && method === "PUT") {
        const vaultName = decodeURIComponent(vaultMatch[1]);
        this.service.createVault(vaultName, ctx.region);
        return new Response(null, {
          status: 201,
          headers: { "x-amzn-RequestId": ctx.requestId, Location: `/${ctx.accountId}/vaults/${vaultName}` },
        });
      }

      // GET /-/vaults/{vaultName}
      if (vaultMatch && method === "GET") {
        const vault = this.service.describeVault(decodeURIComponent(vaultMatch[1]));
        return this.json(vaultToJson(vault), ctx);
      }

      // DELETE /-/vaults/{vaultName}
      if (vaultMatch && method === "DELETE") {
        this.service.deleteVault(decodeURIComponent(vaultMatch[1]));
        return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // GET /-/vaults
      if (path === "/-/vaults" && method === "GET") {
        const vaults = this.service.listVaults();
        return this.json({ VaultList: vaults.map(vaultToJson) }, ctx);
      }

      // POST /-/vaults/{vaultName}/archives
      const archiveUploadMatch = path.match(/^\/-\/vaults\/([^/]+)\/archives$/);
      if (archiveUploadMatch && method === "POST") {
        const vaultName = decodeURIComponent(archiveUploadMatch[1]);
        const description = req.headers.get("x-amz-archive-description") ?? undefined;
        const body = await req.text();
        const archiveId = this.service.uploadArchive(vaultName, description, body);
        return new Response(null, {
          status: 201,
          headers: {
            "x-amzn-RequestId": ctx.requestId,
            "x-amz-archive-id": archiveId,
            Location: `/${ctx.accountId}/vaults/${vaultName}/archives/${archiveId}`,
          },
        });
      }

      // DELETE /-/vaults/{vaultName}/archives/{archiveId}
      const archiveDeleteMatch = path.match(/^\/-\/vaults\/([^/]+)\/archives\/([^/]+)$/);
      if (archiveDeleteMatch && method === "DELETE") {
        this.service.deleteArchive(decodeURIComponent(archiveDeleteMatch[1]), archiveDeleteMatch[2]);
        return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // POST /-/vaults/{vaultName}/jobs
      const jobInitMatch = path.match(/^\/-\/vaults\/([^/]+)\/jobs$/);
      if (jobInitMatch && method === "POST") {
        const vaultName = decodeURIComponent(jobInitMatch[1]);
        const body = await req.json();
        const jobId = this.service.initiateJob(vaultName, body);
        return new Response(null, {
          status: 202,
          headers: {
            "x-amzn-RequestId": ctx.requestId,
            "x-amz-job-id": jobId,
            Location: `/${ctx.accountId}/vaults/${vaultName}/jobs/${jobId}`,
          },
        });
      }

      // GET /-/vaults/{vaultName}/jobs/{jobId}
      const jobDescribeMatch = path.match(/^\/-\/vaults\/([^/]+)\/jobs\/([^/]+)$/);
      if (jobDescribeMatch && method === "GET") {
        const job = this.service.describeJob(decodeURIComponent(jobDescribeMatch[1]), jobDescribeMatch[2]);
        return this.json(jobToJson(job), ctx);
      }

      // GET /-/vaults/{vaultName}/jobs
      const jobListMatch = path.match(/^\/-\/vaults\/([^/]+)\/jobs$/);
      if (jobListMatch && method === "GET") {
        const jobs = this.service.listJobs(decodeURIComponent(jobListMatch[1]));
        return this.json({ JobList: jobs.map(jobToJson) }, ctx);
      }

      // GET /-/vaults/{vaultName}/jobs/{jobId}/output
      const jobOutputMatch = path.match(/^\/-\/vaults\/([^/]+)\/jobs\/([^/]+)\/output$/);
      if (jobOutputMatch && method === "GET") {
        const result = this.service.getJobOutput(decodeURIComponent(jobOutputMatch[1]), jobOutputMatch[2]);
        return new Response(result.body, {
          status: 200,
          headers: { "Content-Type": result.contentType, "x-amzn-RequestId": ctx.requestId },
        });
      }

      // /-/vaults/{vaultName}/notification-configuration
      const notifMatch = path.match(/^\/-\/vaults\/([^/]+)\/notification-configuration$/);
      if (notifMatch) {
        const vn = decodeURIComponent(notifMatch[1]);
        if (method === "PUT") {
          const body = await req.json();
          this.service.setVaultNotifications(vn, body.vaultNotificationConfig ?? body);
          return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
        }
        if (method === "GET") {
          const config = this.service.getVaultNotifications(vn);
          return this.json(config, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteVaultNotifications(vn);
          return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
        }
      }

      // POST /-/vaults/{vaultName}/tags?operation=add
      const tagsMatch = path.match(/^\/-\/vaults\/([^/]+)\/tags$/);
      if (tagsMatch && method === "POST") {
        const op = url.searchParams.get("operation");
        const body = await req.json();
        const vaultName = decodeURIComponent(tagsMatch[1]);
        if (op === "add") {
          this.service.addTagsToVault(vaultName, body.Tags ?? {});
        } else if (op === "remove") {
          this.service.removeTagsFromVault(vaultName, body.TagKeys ?? []);
        }
        return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // GET /-/vaults/{vaultName}/tags
      if (tagsMatch && method === "GET") {
        const tags = this.service.listTagsForVault(decodeURIComponent(tagsMatch[1]));
        return this.json({ Tags: tags }, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown Glacier operation: ${method} ${path}`, 404),
        ctx.requestId,
      );
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

function vaultToJson(v: any): any {
  return {
    VaultARN: v.vaultARN,
    VaultName: v.vaultName,
    CreationDate: v.creationDate,
    LastInventoryDate: v.lastInventoryDate,
    NumberOfArchives: v.numberOfArchives,
    SizeInBytes: v.sizeInBytes,
  };
}

function jobToJson(j: any): any {
  return {
    JobId: j.jobId,
    VaultARN: j.vaultARN,
    Action: j.action,
    ArchiveId: j.archiveId,
    StatusCode: j.statusCode,
    Completed: j.completed,
    CreationDate: j.creationDate,
    CompletionDate: j.completionDate,
    Tier: j.tier,
    JobDescription: j.description,
  };
}
