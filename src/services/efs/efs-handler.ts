import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { EfsService } from "./efs-service";

export class EfsHandler {
  constructor(private service: EfsService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- File Systems ---

      // POST /2015-02-01/file-systems
      if (path === "/2015-02-01/file-systems" && method === "POST") {
        const body = await req.json();
        const fs = this.service.createFileSystem(
          body.CreationToken,
          body.PerformanceMode,
          body.ThroughputMode,
          body.Encrypted,
          body.Tags,
          ctx.region,
        );
        return this.json(fileSystemToJson(fs), ctx, 201);
      }

      // GET /2015-02-01/file-systems
      if (path === "/2015-02-01/file-systems" && method === "GET") {
        const fsId = url.searchParams.get("FileSystemId") ?? undefined;
        const token = url.searchParams.get("CreationToken") ?? undefined;
        const fileSystems = this.service.describeFileSystems(fsId, token);
        return this.json({ FileSystems: fileSystems.map(fileSystemToJson) }, ctx);
      }

      // DELETE /2015-02-01/file-systems/{fsId}
      const fsDeleteMatch = path.match(/^\/2015-02-01\/file-systems\/([^/]+)$/);
      if (fsDeleteMatch && method === "DELETE") {
        this.service.deleteFileSystem(fsDeleteMatch[1]);
        return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // --- File System Policy ---

      // PUT /2015-02-01/file-systems/{fsId}/policy
      const policyPutMatch = path.match(/^\/2015-02-01\/file-systems\/([^/]+)\/policy$/);
      if (policyPutMatch && method === "PUT") {
        const body = await req.json();
        const policy = typeof body.Policy === "string" ? body.Policy : JSON.stringify(body.Policy);
        this.service.putFileSystemPolicy(policyPutMatch[1], policy);
        return this.json({ FileSystemId: policyPutMatch[1], Policy: policy }, ctx);
      }

      // GET /2015-02-01/file-systems/{fsId}/policy
      const policyGetMatch = path.match(/^\/2015-02-01\/file-systems\/([^/]+)\/policy$/);
      if (policyGetMatch && method === "GET") {
        const result = this.service.describeFileSystemPolicy(policyGetMatch[1]);
        return this.json(result, ctx);
      }

      // --- Mount Targets ---

      // POST /2015-02-01/mount-targets
      if (path === "/2015-02-01/mount-targets" && method === "POST") {
        const body = await req.json();
        const mt = this.service.createMountTarget(
          body.FileSystemId,
          body.SubnetId,
          body.SecurityGroups,
        );
        return this.json(mountTargetToJson(mt), ctx, 200);
      }

      // GET /2015-02-01/mount-targets
      if (path === "/2015-02-01/mount-targets" && method === "GET") {
        const fsId = url.searchParams.get("FileSystemId") ?? undefined;
        const mtId = url.searchParams.get("MountTargetId") ?? undefined;
        const targets = this.service.describeMountTargets(fsId, mtId);
        return this.json({ MountTargets: targets.map(mountTargetToJson) }, ctx);
      }

      // DELETE /2015-02-01/mount-targets/{mtId}
      const mtDeleteMatch = path.match(/^\/2015-02-01\/mount-targets\/([^/]+)$/);
      if (mtDeleteMatch && method === "DELETE") {
        this.service.deleteMountTarget(mtDeleteMatch[1]);
        return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // --- Access Points ---

      // POST /2015-02-01/access-points
      if (path === "/2015-02-01/access-points" && method === "POST") {
        const body = await req.json();
        const ap = this.service.createAccessPoint(
          body.FileSystemId,
          body.PosixUser,
          body.RootDirectory,
          body.Tags,
          ctx.region,
        );
        return this.json(accessPointToJson(ap), ctx, 200);
      }

      // GET /2015-02-01/access-points
      if (path === "/2015-02-01/access-points" && method === "GET") {
        const fsId = url.searchParams.get("FileSystemId") ?? undefined;
        const apId = url.searchParams.get("AccessPointId") ?? undefined;
        const points = this.service.describeAccessPoints(fsId, apId);
        return this.json({ AccessPoints: points.map(accessPointToJson) }, ctx);
      }

      // DELETE /2015-02-01/access-points/{apId}
      const apDeleteMatch = path.match(/^\/2015-02-01\/access-points\/([^/]+)$/);
      if (apDeleteMatch && method === "DELETE") {
        this.service.deleteAccessPoint(apDeleteMatch[1]);
        return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // --- Tags ---

      // POST /2015-02-01/resource-tags/{resourceId}
      const tagPostMatch = path.match(/^\/2015-02-01\/resource-tags\/(.+)$/);
      if (tagPostMatch && method === "POST") {
        const body = await req.json();
        this.service.tagResource(decodeURIComponent(tagPostMatch[1]), body.Tags ?? []);
        return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // GET /2015-02-01/resource-tags/{resourceId}
      const tagGetMatch = path.match(/^\/2015-02-01\/resource-tags\/(.+)$/);
      if (tagGetMatch && method === "GET") {
        const tags = this.service.listTagsForResource(decodeURIComponent(tagGetMatch[1]));
        return this.json({ Tags: tags }, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown EFS operation: ${method} ${path}`, 404),
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

function fileSystemToJson(fs: any): any {
  return {
    FileSystemId: fs.fileSystemId,
    FileSystemArn: fs.fileSystemArn,
    CreationToken: fs.creationToken,
    CreationTime: fs.creationTime,
    LifeCycleState: fs.lifeCycleState,
    PerformanceMode: fs.performanceMode,
    ThroughputMode: fs.throughputMode,
    Encrypted: fs.encrypted,
    NumberOfMountTargets: fs.numberOfMountTargets,
    SizeInBytes: { Value: fs.sizeInBytes.value, Timestamp: fs.sizeInBytes.timestamp },
    Tags: fs.tags,
    OwnerId: "000000000000",
  };
}

function mountTargetToJson(mt: any): any {
  return {
    MountTargetId: mt.mountTargetId,
    FileSystemId: mt.fileSystemId,
    SubnetId: mt.subnetId,
    LifeCycleState: mt.lifeCycleState,
    IpAddress: mt.ipAddress,
    NetworkInterfaceId: mt.networkInterfaceId,
    OwnerId: "000000000000",
  };
}

function accessPointToJson(ap: any): any {
  return {
    AccessPointId: ap.accessPointId,
    AccessPointArn: ap.accessPointArn,
    FileSystemId: ap.fileSystemId,
    LifeCycleState: ap.lifeCycleState,
    PosixUser: ap.posixUser,
    RootDirectory: ap.rootDirectory,
    Tags: ap.tags,
    OwnerId: "000000000000",
  };
}
