import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  FSxClient,
  CreateFileSystemCommand,
  DescribeFileSystemsCommand,
  DeleteFileSystemCommand,
  UpdateFileSystemCommand,
  CreateBackupCommand,
  DescribeBackupsCommand,
  DeleteBackupCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-fsx";
import { startServer, stopServer, clientConfig } from "./helpers";

const fsx = new FSxClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("FSx", () => {
  let fileSystemId: string;
  let fileSystemArn: string;
  let backupId: string;

  test("CreateFileSystem", async () => {
    const res = await fsx.send(new CreateFileSystemCommand({
      FileSystemType: "LUSTRE",
      StorageCapacity: 1200,
      StorageType: "SSD",
      SubnetIds: ["subnet-12345"],
      Tags: [{ Key: "env", Value: "test" }],
    }));
    const fs = res.FileSystem!;
    fileSystemId = fs.FileSystemId!;
    fileSystemArn = fs.ResourceARN!;
    expect(fileSystemId).toBeDefined();
    expect(fileSystemId).toStartWith("fs-");
    expect(fs.FileSystemType).toBe("LUSTRE");
    expect(fs.StorageCapacity).toBe(1200);
    expect(fs.Lifecycle).toBe("AVAILABLE");
    expect(fs.DNSName).toBeDefined();
  });

  test("DescribeFileSystems", async () => {
    const res = await fsx.send(new DescribeFileSystemsCommand({
      FileSystemIds: [fileSystemId],
    }));
    expect(res.FileSystems).toBeDefined();
    expect(res.FileSystems!.length).toBe(1);
    expect(res.FileSystems![0].FileSystemId).toBe(fileSystemId);
  });

  test("DescribeFileSystems - all", async () => {
    const res = await fsx.send(new DescribeFileSystemsCommand({}));
    expect(res.FileSystems!.length).toBeGreaterThanOrEqual(1);
  });

  test("UpdateFileSystem", async () => {
    const res = await fsx.send(new UpdateFileSystemCommand({
      FileSystemId: fileSystemId,
      StorageCapacity: 2400,
    }));
    expect(res.FileSystem!.StorageCapacity).toBe(2400);
  });

  test("CreateBackup", async () => {
    const res = await fsx.send(new CreateBackupCommand({
      FileSystemId: fileSystemId,
      Tags: [{ Key: "type", Value: "manual" }],
    }));
    const backup = res.Backup!;
    backupId = backup.BackupId!;
    expect(backupId).toBeDefined();
    expect(backup.Lifecycle).toBe("AVAILABLE");
    expect(backup.Type).toBe("USER_INITIATED");
    expect(backup.FileSystem!.FileSystemId).toBe(fileSystemId);
  });

  test("DescribeBackups", async () => {
    const res = await fsx.send(new DescribeBackupsCommand({}));
    expect(res.Backups).toBeDefined();
    expect(res.Backups!.length).toBeGreaterThanOrEqual(1);
    const found = res.Backups!.find((b) => b.BackupId === backupId);
    expect(found).toBeDefined();
  });

  test("DeleteBackup", async () => {
    const res = await fsx.send(new DeleteBackupCommand({ BackupId: backupId }));
    expect(res.Lifecycle).toBe("DELETED");
  });

  test("DeleteBackup - not found", async () => {
    await expect(
      fsx.send(new DeleteBackupCommand({ BackupId: "backup-nonexistent" })),
    ).rejects.toThrow();
  });

  // --- Tags ---

  test("TagResource", async () => {
    await fsx.send(new TagResourceCommand({
      ResourceARN: fileSystemArn,
      Tags: [{ Key: "team", Value: "storage" }],
    }));
  });

  test("ListTagsForResource", async () => {
    const res = await fsx.send(new ListTagsForResourceCommand({
      ResourceARN: fileSystemArn,
    }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.find((t) => t.Key === "team")?.Value).toBe("storage");
  });

  test("UntagResource", async () => {
    await fsx.send(new UntagResourceCommand({
      ResourceARN: fileSystemArn,
      TagKeys: ["team"],
    }));
    const res = await fsx.send(new ListTagsForResourceCommand({ ResourceARN: fileSystemArn }));
    expect(res.Tags!.find((t) => t.Key === "team")).toBeUndefined();
  });

  // --- Cleanup ---

  test("DeleteFileSystem", async () => {
    const res = await fsx.send(new DeleteFileSystemCommand({ FileSystemId: fileSystemId }));
    expect(res.Lifecycle).toBe("DELETING");
  });

  test("DescribeFileSystems - not found after delete", async () => {
    await expect(
      fsx.send(new DescribeFileSystemsCommand({ FileSystemIds: [fileSystemId] })),
    ).rejects.toThrow();
  });
});
