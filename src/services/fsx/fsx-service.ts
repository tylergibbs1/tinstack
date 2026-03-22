import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface FsxFileSystem {
  fileSystemId: string;
  resourceARN: string;
  fileSystemType: string;
  storageCapacity: number;
  storageType: string;
  subnetIds: string[];
  lifecycle: string;
  creationTime: number;
  dnsName: string;
  tags: { Key: string; Value: string }[];
}

export interface FsxBackup {
  backupId: string;
  resourceARN: string;
  fileSystemId: string;
  lifecycle: string;
  type: string;
  creationTime: number;
  tags: { Key: string; Value: string }[];
}

export class FsxService {
  private fileSystems: StorageBackend<string, FsxFileSystem>;
  private backups: StorageBackend<string, FsxBackup>;

  constructor(private accountId: string) {
    this.fileSystems = new InMemoryStorage();
    this.backups = new InMemoryStorage();
  }

  createFileSystem(
    fileSystemType: string,
    storageCapacity: number,
    storageType: string | undefined,
    subnetIds: string[],
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): FsxFileSystem {
    const fsId = `fs-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`;
    const arn = buildArn("fsx", region, this.accountId, "file-system/", fsId);

    const fs: FsxFileSystem = {
      fileSystemId: fsId,
      resourceARN: arn,
      fileSystemType: fileSystemType ?? "LUSTRE",
      storageCapacity: storageCapacity ?? 1200,
      storageType: storageType ?? "SSD",
      subnetIds: subnetIds ?? [],
      lifecycle: "AVAILABLE",
      creationTime: Date.now() / 1000,
      dnsName: `${fsId}.fsx.${region}.amazonaws.com`,
      tags: tags ?? [],
    };
    this.fileSystems.set(fsId, fs);
    return fs;
  }

  describeFileSystems(fileSystemIds?: string[]): FsxFileSystem[] {
    if (fileSystemIds && fileSystemIds.length > 0) {
      return fileSystemIds.map((id) => {
        const fs = this.fileSystems.get(id);
        if (!fs) throw new AwsError("FileSystemNotFound", `File system ${id} not found.`, 400);
        return fs;
      });
    }
    return this.fileSystems.values();
  }

  deleteFileSystem(fileSystemId: string): FsxFileSystem {
    const fs = this.fileSystems.get(fileSystemId);
    if (!fs) throw new AwsError("FileSystemNotFound", `File system ${fileSystemId} not found.`, 400);
    this.fileSystems.delete(fileSystemId);
    fs.lifecycle = "DELETING";
    return fs;
  }

  updateFileSystem(
    fileSystemId: string,
    storageCapacity?: number,
  ): FsxFileSystem {
    const fs = this.fileSystems.get(fileSystemId);
    if (!fs) throw new AwsError("FileSystemNotFound", `File system ${fileSystemId} not found.`, 400);
    if (storageCapacity !== undefined) fs.storageCapacity = storageCapacity;
    return fs;
  }

  createBackup(
    fileSystemId: string,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): FsxBackup {
    const fs = this.fileSystems.get(fileSystemId);
    if (!fs) throw new AwsError("FileSystemNotFound", `File system ${fileSystemId} not found.`, 400);

    const backupId = `backup-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`;
    const arn = buildArn("fsx", region, this.accountId, "backup/", backupId);

    const backup: FsxBackup = {
      backupId,
      resourceARN: arn,
      fileSystemId,
      lifecycle: "AVAILABLE",
      type: "USER_INITIATED",
      creationTime: Date.now() / 1000,
      tags: tags ?? [],
    };
    this.backups.set(backupId, backup);
    return backup;
  }

  describeBackups(backupIds?: string[]): FsxBackup[] {
    if (backupIds && backupIds.length > 0) {
      return backupIds.map((id) => {
        const b = this.backups.get(id);
        if (!b) throw new AwsError("BackupNotFound", `Backup ${id} not found.`, 400);
        return b;
      });
    }
    return this.backups.values();
  }

  deleteBackup(backupId: string): FsxBackup {
    const b = this.backups.get(backupId);
    if (!b) throw new AwsError("BackupNotFound", `Backup ${backupId} not found.`, 400);
    this.backups.delete(backupId);
    b.lifecycle = "DELETED";
    return b;
  }

  tagResource(arn: string, tags: { Key: string; Value: string }[]): void {
    const resource = this.resolveResource(arn);
    if (!resource) throw new AwsError("ResourceNotFound", `Resource ${arn} not found.`, 400);
    for (const tag of tags) {
      const existing = resource.tags.find((t) => t.Key === tag.Key);
      if (existing) existing.Value = tag.Value;
      else resource.tags.push(tag);
    }
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const resource = this.resolveResource(arn);
    if (!resource) throw new AwsError("ResourceNotFound", `Resource ${arn} not found.`, 400);
    resource.tags = resource.tags.filter((t) => !tagKeys.includes(t.Key));
  }

  listTagsForResource(arn: string): { Key: string; Value: string }[] {
    const resource = this.resolveResource(arn);
    if (!resource) throw new AwsError("ResourceNotFound", `Resource ${arn} not found.`, 400);
    return resource.tags;
  }

  private resolveResource(arn: string): { tags: { Key: string; Value: string }[] } | undefined {
    const fs = this.fileSystems.values().find((f) => f.resourceARN === arn);
    if (fs) return fs;
    const b = this.backups.values().find((b) => b.resourceARN === arn);
    return b ?? undefined;
  }
}
