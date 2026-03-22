import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface FileSystem {
  fileSystemId: string;
  fileSystemArn: string;
  creationToken: string;
  creationTime: number;
  lifeCycleState: string;
  performanceMode: string;
  throughputMode: string;
  encrypted: boolean;
  numberOfMountTargets: number;
  sizeInBytes: { value: number; timestamp: number };
  tags: { Key: string; Value: string }[];
}

export interface MountTarget {
  mountTargetId: string;
  fileSystemId: string;
  subnetId: string;
  lifeCycleState: string;
  ipAddress: string;
  networkInterfaceId: string;
  securityGroups: string[];
}

export interface AccessPoint {
  accessPointId: string;
  accessPointArn: string;
  fileSystemId: string;
  lifeCycleState: string;
  posixUser?: { Uid: number; Gid: number; SecondaryGids?: number[] };
  rootDirectory?: { Path: string; CreationInfo?: { OwnerUid: number; OwnerGid: number; Permissions: string } };
  tags: { Key: string; Value: string }[];
}

function generateFsId(): string {
  return `fs-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`;
}

function generateMtId(): string {
  return `fsmt-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`;
}

function generateApId(): string {
  return `fsap-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`;
}

export class EfsService {
  private fileSystems: StorageBackend<string, FileSystem>;
  private mountTargets: StorageBackend<string, MountTarget>;
  private accessPoints: StorageBackend<string, AccessPoint>;
  private policies: StorageBackend<string, string>;

  constructor(private accountId: string) {
    this.fileSystems = new InMemoryStorage();
    this.mountTargets = new InMemoryStorage();
    this.accessPoints = new InMemoryStorage();
    this.policies = new InMemoryStorage();
  }

  createFileSystem(
    creationToken: string,
    performanceMode: string | undefined,
    throughputMode: string | undefined,
    encrypted: boolean | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): FileSystem {
    // Check for duplicate creation token
    for (const fs of this.fileSystems.values()) {
      if (fs.creationToken === creationToken) {
        return fs;
      }
    }

    const fsId = generateFsId();
    const now = Math.floor(Date.now() / 1000);
    const fs: FileSystem = {
      fileSystemId: fsId,
      fileSystemArn: buildArn("elasticfilesystem", region, this.accountId, "file-system/", fsId),
      creationToken,
      creationTime: now,
      lifeCycleState: "available",
      performanceMode: performanceMode ?? "generalPurpose",
      throughputMode: throughputMode ?? "bursting",
      encrypted: encrypted ?? false,
      numberOfMountTargets: 0,
      sizeInBytes: { value: 0, timestamp: now },
      tags: tags ?? [],
    };
    this.fileSystems.set(fsId, fs);
    return fs;
  }

  describeFileSystems(
    fileSystemId?: string,
    creationToken?: string,
  ): FileSystem[] {
    if (fileSystemId) {
      const fs = this.fileSystems.get(fileSystemId);
      if (!fs) {
        throw new AwsError("FileSystemNotFound", `File system ${fileSystemId} not found.`, 404);
      }
      return [fs];
    }
    if (creationToken) {
      return this.fileSystems.values().filter((fs) => fs.creationToken === creationToken);
    }
    return this.fileSystems.values();
  }

  deleteFileSystem(fileSystemId: string): void {
    if (!this.fileSystems.has(fileSystemId)) {
      throw new AwsError("FileSystemNotFound", `File system ${fileSystemId} not found.`, 404);
    }
    // Check for mount targets
    const mts = this.mountTargets.values().filter((mt) => mt.fileSystemId === fileSystemId);
    if (mts.length > 0) {
      throw new AwsError(
        "FileSystemInUse",
        `File system ${fileSystemId} has mount targets and cannot be deleted.`,
        409,
      );
    }
    this.fileSystems.delete(fileSystemId);
    this.policies.delete(fileSystemId);
  }

  createMountTarget(
    fileSystemId: string,
    subnetId: string,
    securityGroups?: string[],
  ): MountTarget {
    if (!this.fileSystems.has(fileSystemId)) {
      throw new AwsError("FileSystemNotFound", `File system ${fileSystemId} not found.`, 404);
    }

    const mtId = generateMtId();
    const octet3 = Math.floor(Math.random() * 256);
    const octet4 = Math.floor(Math.random() * 254) + 1;
    const mt: MountTarget = {
      mountTargetId: mtId,
      fileSystemId,
      subnetId,
      lifeCycleState: "available",
      ipAddress: `10.0.${octet3}.${octet4}`,
      networkInterfaceId: `eni-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`,
      securityGroups: securityGroups ?? [],
    };
    this.mountTargets.set(mtId, mt);

    const fs = this.fileSystems.get(fileSystemId)!;
    fs.numberOfMountTargets += 1;

    return mt;
  }

  describeMountTargets(fileSystemId?: string, mountTargetId?: string): MountTarget[] {
    if (mountTargetId) {
      const mt = this.mountTargets.get(mountTargetId);
      if (!mt) {
        throw new AwsError("MountTargetNotFound", `Mount target ${mountTargetId} not found.`, 404);
      }
      return [mt];
    }
    if (fileSystemId) {
      return this.mountTargets.values().filter((mt) => mt.fileSystemId === fileSystemId);
    }
    return this.mountTargets.values();
  }

  deleteMountTarget(mountTargetId: string): void {
    const mt = this.mountTargets.get(mountTargetId);
    if (!mt) {
      throw new AwsError("MountTargetNotFound", `Mount target ${mountTargetId} not found.`, 404);
    }
    this.mountTargets.delete(mountTargetId);

    const fs = this.fileSystems.get(mt.fileSystemId);
    if (fs) {
      fs.numberOfMountTargets = Math.max(0, fs.numberOfMountTargets - 1);
    }
  }

  putFileSystemPolicy(fileSystemId: string, policy: string): void {
    if (!this.fileSystems.has(fileSystemId)) {
      throw new AwsError("FileSystemNotFound", `File system ${fileSystemId} not found.`, 404);
    }
    this.policies.set(fileSystemId, policy);
  }

  describeFileSystemPolicy(fileSystemId: string): { FileSystemId: string; Policy: string } {
    if (!this.fileSystems.has(fileSystemId)) {
      throw new AwsError("FileSystemNotFound", `File system ${fileSystemId} not found.`, 404);
    }
    const policy = this.policies.get(fileSystemId);
    if (!policy) {
      throw new AwsError("PolicyNotFound", `No policy found for file system ${fileSystemId}.`, 404);
    }
    return { FileSystemId: fileSystemId, Policy: policy };
  }

  createAccessPoint(
    fileSystemId: string,
    posixUser: any | undefined,
    rootDirectory: any | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): AccessPoint {
    if (!this.fileSystems.has(fileSystemId)) {
      throw new AwsError("FileSystemNotFound", `File system ${fileSystemId} not found.`, 404);
    }

    const apId = generateApId();
    const ap: AccessPoint = {
      accessPointId: apId,
      accessPointArn: buildArn("elasticfilesystem", region, this.accountId, "access-point/", apId),
      fileSystemId,
      lifeCycleState: "available",
      posixUser,
      rootDirectory,
      tags: tags ?? [],
    };
    this.accessPoints.set(apId, ap);
    return ap;
  }

  describeAccessPoints(fileSystemId?: string, accessPointId?: string): AccessPoint[] {
    if (accessPointId) {
      const ap = this.accessPoints.get(accessPointId);
      if (!ap) {
        throw new AwsError("AccessPointNotFound", `Access point ${accessPointId} not found.`, 404);
      }
      return [ap];
    }
    if (fileSystemId) {
      return this.accessPoints.values().filter((ap) => ap.fileSystemId === fileSystemId);
    }
    return this.accessPoints.values();
  }

  deleteAccessPoint(accessPointId: string): void {
    if (!this.accessPoints.has(accessPointId)) {
      throw new AwsError("AccessPointNotFound", `Access point ${accessPointId} not found.`, 404);
    }
    this.accessPoints.delete(accessPointId);
  }

  tagResource(resourceId: string, tags: { Key: string; Value: string }[]): void {
    const resolved = this.resolveResource(resourceId);
    if (!resolved) {
      throw new AwsError("FileSystemNotFound", `Resource ${resourceId} not found.`, 404);
    }
    for (const tag of tags) {
      const existing = resolved.tags.find((t) => t.Key === tag.Key);
      if (existing) {
        existing.Value = tag.Value;
      } else {
        resolved.tags.push(tag);
      }
    }
  }

  listTagsForResource(resourceId: string): { Key: string; Value: string }[] {
    const resolved = this.resolveResource(resourceId);
    if (!resolved) {
      throw new AwsError("FileSystemNotFound", `Resource ${resourceId} not found.`, 404);
    }
    return resolved.tags;
  }

  private resolveResource(resourceId: string): { tags: { Key: string; Value: string }[] } | undefined {
    // Extract ID from ARN if needed (e.g. arn:aws:elasticfilesystem:...:file-system/fs-xxx)
    const id = this.extractIdFromArn(resourceId);

    const fs = this.fileSystems.get(id);
    if (fs) return fs;

    const ap = this.accessPoints.get(id);
    if (ap) return ap;

    return undefined;
  }

  private extractIdFromArn(arnOrId: string): string {
    if (!arnOrId.startsWith("arn:")) return arnOrId;
    const lastSlash = arnOrId.lastIndexOf("/");
    return lastSlash >= 0 ? arnOrId.slice(lastSlash + 1) : arnOrId;
  }
}
