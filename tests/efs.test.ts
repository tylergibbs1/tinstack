import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  EFSClient,
  CreateFileSystemCommand,
  DescribeFileSystemsCommand,
  DeleteFileSystemCommand,
  CreateMountTargetCommand,
  DescribeMountTargetsCommand,
  DeleteMountTargetCommand,
  PutFileSystemPolicyCommand,
  DescribeFileSystemPolicyCommand,
  CreateAccessPointCommand,
  DescribeAccessPointsCommand,
  DeleteAccessPointCommand,
  TagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-efs";
import { startServer, stopServer, clientConfig } from "./helpers";

const efs = new EFSClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("EFS", () => {
  let fileSystemId: string;
  let fileSystemArn: string;
  let mountTargetId: string;
  let accessPointId: string;

  test("CreateFileSystem", async () => {
    const res = await efs.send(new CreateFileSystemCommand({
      CreationToken: "test-fs-token",
      PerformanceMode: "generalPurpose",
      ThroughputMode: "bursting",
      Encrypted: true,
      Tags: [{ Key: "env", Value: "test" }],
    }));

    fileSystemId = res.FileSystemId!;
    fileSystemArn = res.FileSystemArn!;
    expect(fileSystemId).toBeDefined();
    expect(fileSystemId).toStartWith("fs-");
    expect(fileSystemArn).toContain("elasticfilesystem");
    expect(res.PerformanceMode).toBe("generalPurpose");
    expect(res.ThroughputMode).toBe("bursting");
    expect(res.Encrypted).toBe(true);
    expect(res.LifeCycleState).toBe("available");
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.find((t) => t.Key === "env")?.Value).toBe("test");
  });

  test("CreateFileSystem - idempotent with same CreationToken", async () => {
    const res = await efs.send(new CreateFileSystemCommand({
      CreationToken: "test-fs-token",
    }));
    expect(res.FileSystemId).toBe(fileSystemId);
  });

  test("DescribeFileSystems - all", async () => {
    const res = await efs.send(new DescribeFileSystemsCommand({}));
    expect(res.FileSystems).toBeDefined();
    expect(res.FileSystems!.length).toBeGreaterThanOrEqual(1);
    const found = res.FileSystems!.find((fs) => fs.FileSystemId === fileSystemId);
    expect(found).toBeDefined();
    expect(found!.CreationToken).toBe("test-fs-token");
  });

  test("DescribeFileSystems - by FileSystemId", async () => {
    const res = await efs.send(new DescribeFileSystemsCommand({
      FileSystemId: fileSystemId,
    }));
    expect(res.FileSystems!.length).toBe(1);
    expect(res.FileSystems![0].FileSystemId).toBe(fileSystemId);
  });

  test("DescribeFileSystems - not found", async () => {
    await expect(
      efs.send(new DescribeFileSystemsCommand({ FileSystemId: "fs-nonexistent" })),
    ).rejects.toThrow();
  });

  // --- Mount Targets ---

  test("CreateMountTarget", async () => {
    const res = await efs.send(new CreateMountTargetCommand({
      FileSystemId: fileSystemId,
      SubnetId: "subnet-12345",
      SecurityGroups: ["sg-12345"],
    }));

    mountTargetId = res.MountTargetId!;
    expect(mountTargetId).toBeDefined();
    expect(mountTargetId).toStartWith("fsmt-");
    expect(res.FileSystemId).toBe(fileSystemId);
    expect(res.SubnetId).toBe("subnet-12345");
    expect(res.LifeCycleState).toBe("available");
    expect(res.IpAddress).toBeDefined();
  });

  test("DescribeMountTargets", async () => {
    const res = await efs.send(new DescribeMountTargetsCommand({
      FileSystemId: fileSystemId,
    }));

    expect(res.MountTargets).toBeDefined();
    expect(res.MountTargets!.length).toBeGreaterThanOrEqual(1);
    const mt = res.MountTargets!.find((m) => m.MountTargetId === mountTargetId);
    expect(mt).toBeDefined();
    expect(mt!.FileSystemId).toBe(fileSystemId);
  });

  test("CreateMountTarget - file system not found", async () => {
    await expect(
      efs.send(new CreateMountTargetCommand({
        FileSystemId: "fs-nonexistent",
        SubnetId: "subnet-12345",
      })),
    ).rejects.toThrow();
  });

  // --- File System Policy ---

  test("PutFileSystemPolicy", async () => {
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Action: "elasticfilesystem:ClientMount", Principal: { AWS: "*" } }],
    });

    const res = await efs.send(new PutFileSystemPolicyCommand({
      FileSystemId: fileSystemId,
      Policy: policy,
    }));

    expect(res.FileSystemId).toBe(fileSystemId);
    expect(res.Policy).toBeDefined();
  });

  test("DescribeFileSystemPolicy", async () => {
    const res = await efs.send(new DescribeFileSystemPolicyCommand({
      FileSystemId: fileSystemId,
    }));

    expect(res.FileSystemId).toBe(fileSystemId);
    expect(res.Policy).toBeDefined();
    const parsed = JSON.parse(res.Policy!);
    expect(parsed.Version).toBe("2012-10-17");
  });

  // --- Access Points ---

  test("CreateAccessPoint", async () => {
    const res = await efs.send(new CreateAccessPointCommand({
      FileSystemId: fileSystemId,
      PosixUser: { Uid: 1000, Gid: 1000 },
      RootDirectory: {
        Path: "/data",
        CreationInfo: { OwnerUid: 1000, OwnerGid: 1000, Permissions: "755" },
      },
      Tags: [{ Key: "name", Value: "data-ap" }],
    }));

    accessPointId = res.AccessPointId!;
    expect(accessPointId).toBeDefined();
    expect(accessPointId).toStartWith("fsap-");
    expect(res.FileSystemId).toBe(fileSystemId);
    expect(res.LifeCycleState).toBe("available");
    expect(res.PosixUser?.Uid).toBe(1000);
    expect(res.RootDirectory?.Path).toBe("/data");
  });

  test("DescribeAccessPoints", async () => {
    const res = await efs.send(new DescribeAccessPointsCommand({
      FileSystemId: fileSystemId,
    }));

    expect(res.AccessPoints).toBeDefined();
    expect(res.AccessPoints!.length).toBeGreaterThanOrEqual(1);
    const ap = res.AccessPoints!.find((a) => a.AccessPointId === accessPointId);
    expect(ap).toBeDefined();
    expect(ap!.FileSystemId).toBe(fileSystemId);
  });

  test("DeleteAccessPoint", async () => {
    await efs.send(new DeleteAccessPointCommand({ AccessPointId: accessPointId }));
    const res = await efs.send(new DescribeAccessPointsCommand({ FileSystemId: fileSystemId }));
    expect(res.AccessPoints!.find((a) => a.AccessPointId === accessPointId)).toBeUndefined();
  });

  test("DeleteAccessPoint - not found", async () => {
    await expect(
      efs.send(new DeleteAccessPointCommand({ AccessPointId: "fsap-nonexistent" })),
    ).rejects.toThrow();
  });

  // --- Tags ---

  test("TagResource", async () => {
    await efs.send(new TagResourceCommand({
      ResourceId: fileSystemArn,
      Tags: [{ Key: "project", Value: "tinstack" }],
    }));
    // No error means success
  });

  test("ListTagsForResource", async () => {
    const res = await efs.send(new ListTagsForResourceCommand({
      ResourceId: fileSystemArn,
    }));
    expect(res.Tags).toBeDefined();
    const tag = res.Tags!.find((t) => t.Key === "project");
    expect(tag?.Value).toBe("tinstack");
  });

  // --- Cleanup ---

  test("DeleteMountTarget", async () => {
    await efs.send(new DeleteMountTargetCommand({ MountTargetId: mountTargetId }));
    const res = await efs.send(new DescribeMountTargetsCommand({ FileSystemId: fileSystemId }));
    expect(res.MountTargets!.find((m) => m.MountTargetId === mountTargetId)).toBeUndefined();
  });

  test("DeleteFileSystem - with mount targets fails", async () => {
    // Create a new mount target first
    const mt = await efs.send(new CreateMountTargetCommand({
      FileSystemId: fileSystemId,
      SubnetId: "subnet-99999",
    }));

    await expect(
      efs.send(new DeleteFileSystemCommand({ FileSystemId: fileSystemId })),
    ).rejects.toThrow();

    // Clean up
    await efs.send(new DeleteMountTargetCommand({ MountTargetId: mt.MountTargetId! }));
  });

  test("DeleteFileSystem", async () => {
    await efs.send(new DeleteFileSystemCommand({ FileSystemId: fileSystemId }));
    await expect(
      efs.send(new DescribeFileSystemsCommand({ FileSystemId: fileSystemId })),
    ).rejects.toThrow();
  });

  test("DeleteFileSystem - not found", async () => {
    await expect(
      efs.send(new DeleteFileSystemCommand({ FileSystemId: "fs-nonexistent" })),
    ).rejects.toThrow();
  });
});
