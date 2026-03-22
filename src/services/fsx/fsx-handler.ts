import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { FsxService } from "./fsx-service";

export class FsxHandler {
  constructor(private service: FsxService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateFileSystem": {
          const fs = this.service.createFileSystem(
            body.FileSystemType,
            body.StorageCapacity,
            body.StorageType,
            body.SubnetIds ?? [],
            body.Tags,
            ctx.region,
          );
          return this.json({ FileSystem: fileSystemToJson(fs) }, ctx);
        }
        case "DescribeFileSystems": {
          const systems = this.service.describeFileSystems(body.FileSystemIds);
          return this.json({ FileSystems: systems.map(fileSystemToJson) }, ctx);
        }
        case "DeleteFileSystem": {
          const fs = this.service.deleteFileSystem(body.FileSystemId);
          return this.json({ FileSystemId: fs.fileSystemId, Lifecycle: fs.lifecycle }, ctx);
        }
        case "UpdateFileSystem": {
          const fs = this.service.updateFileSystem(body.FileSystemId, body.StorageCapacity);
          return this.json({ FileSystem: fileSystemToJson(fs) }, ctx);
        }
        case "CreateBackup": {
          const backup = this.service.createBackup(body.FileSystemId, body.Tags, ctx.region);
          return this.json({ Backup: backupToJson(backup) }, ctx);
        }
        case "DescribeBackups": {
          const backups = this.service.describeBackups(body.BackupIds);
          return this.json({ Backups: backups.map(backupToJson) }, ctx);
        }
        case "DeleteBackup": {
          const backup = this.service.deleteBackup(body.BackupId);
          return this.json({ BackupId: backup.backupId, Lifecycle: backup.lifecycle }, ctx);
        }
        case "TagResource": {
          this.service.tagResource(body.ResourceARN, body.Tags ?? []);
          return this.json({}, ctx);
        }
        case "UntagResource": {
          this.service.untagResource(body.ResourceARN, body.TagKeys ?? []);
          return this.json({}, ctx);
        }
        case "ListTagsForResource": {
          const tags = this.service.listTagsForResource(body.ResourceARN);
          return this.json({ Tags: tags }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}

function fileSystemToJson(fs: any): any {
  return {
    FileSystemId: fs.fileSystemId,
    ResourceARN: fs.resourceARN,
    FileSystemType: fs.fileSystemType,
    StorageCapacity: fs.storageCapacity,
    StorageType: fs.storageType,
    SubnetIds: fs.subnetIds,
    Lifecycle: fs.lifecycle,
    CreationTime: fs.creationTime,
    DNSName: fs.dnsName,
    Tags: fs.tags,
  };
}

function backupToJson(b: any): any {
  return {
    BackupId: b.backupId,
    ResourceARN: b.resourceARN,
    FileSystem: { FileSystemId: b.fileSystemId },
    Lifecycle: b.lifecycle,
    Type: b.type,
    CreationTime: b.creationTime,
    Tags: b.tags,
  };
}
