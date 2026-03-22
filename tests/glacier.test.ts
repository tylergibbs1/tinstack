import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  GlacierClient,
  CreateVaultCommand,
  DescribeVaultCommand,
  ListVaultsCommand,
  DeleteVaultCommand,
  UploadArchiveCommand,
  DeleteArchiveCommand,
  InitiateJobCommand,
  DescribeJobCommand,
  ListJobsCommand,
  GetJobOutputCommand,
  SetVaultNotificationsCommand,
  GetVaultNotificationsCommand,
  DeleteVaultNotificationsCommand,
  AddTagsToVaultCommand,
  ListTagsForVaultCommand,
  RemoveTagsFromVaultCommand,
} from "@aws-sdk/client-glacier";
import { startServer, stopServer, clientConfig } from "./helpers";

const glacier = new GlacierClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Glacier", () => {
  const vaultName = "test-vault";
  let archiveId: string;
  let jobId: string;

  test("CreateVault", async () => {
    const res = await glacier.send(new CreateVaultCommand({
      accountId: "-",
      vaultName,
    }));
    expect(res.location).toBeDefined();
  });

  test("DescribeVault", async () => {
    const res = await glacier.send(new DescribeVaultCommand({
      accountId: "-",
      vaultName,
    }));
    expect(res.VaultName).toBe(vaultName);
    expect(res.VaultARN).toContain("glacier");
    expect(res.NumberOfArchives).toBe(0);
    expect(res.SizeInBytes).toBe(0);
  });

  test("ListVaults", async () => {
    const res = await glacier.send(new ListVaultsCommand({
      accountId: "-",
    }));
    expect(res.VaultList).toBeDefined();
    expect(res.VaultList!.length).toBeGreaterThanOrEqual(1);
    const found = res.VaultList!.find((v) => v.VaultName === vaultName);
    expect(found).toBeDefined();
  });

  test("CreateVault - idempotent", async () => {
    await glacier.send(new CreateVaultCommand({
      accountId: "-",
      vaultName,
    }));
    // should not throw
  });

  test("UploadArchive", async () => {
    const res = await glacier.send(new UploadArchiveCommand({
      accountId: "-",
      vaultName,
      archiveDescription: "test archive",
      body: Buffer.from("test archive data"),
    }));
    archiveId = res.archiveId!;
    expect(archiveId).toBeDefined();
    expect(res.location).toBeDefined();
  });

  test("DescribeVault - after upload", async () => {
    const res = await glacier.send(new DescribeVaultCommand({
      accountId: "-",
      vaultName,
    }));
    expect(res.NumberOfArchives).toBe(1);
    expect(res.SizeInBytes).toBeGreaterThan(0);
  });

  test("InitiateJob - inventory retrieval", async () => {
    const res = await glacier.send(new InitiateJobCommand({
      accountId: "-",
      vaultName,
      jobParameters: {
        Type: "inventory-retrieval",
        Description: "inventory job",
      },
    }));
    jobId = res.jobId!;
    expect(jobId).toBeDefined();
    expect(res.location).toBeDefined();
  });

  test("DescribeJob", async () => {
    const res = await glacier.send(new DescribeJobCommand({
      accountId: "-",
      vaultName,
      jobId,
    }));
    expect(res.JobId).toBe(jobId);
    expect(res.Action).toBe("inventory-retrieval");
    expect(res.StatusCode).toBe("Succeeded");
    expect(res.Completed).toBe(true);
  });

  test("ListJobs", async () => {
    const res = await glacier.send(new ListJobsCommand({
      accountId: "-",
      vaultName,
    }));
    expect(res.JobList).toBeDefined();
    expect(res.JobList!.length).toBeGreaterThanOrEqual(1);
  });

  test("GetJobOutput - inventory", async () => {
    const res = await glacier.send(new GetJobOutputCommand({
      accountId: "-",
      vaultName,
      jobId,
    }));
    expect(res.body).toBeDefined();
    // Read the stream
    const bodyStr = await new Response(res.body as ReadableStream).text();
    const inventory = JSON.parse(bodyStr);
    expect(inventory.ArchiveList).toBeDefined();
    expect(inventory.ArchiveList.length).toBeGreaterThanOrEqual(1);
  });

  // --- Notifications ---

  test("SetVaultNotifications", async () => {
    await glacier.send(new SetVaultNotificationsCommand({
      accountId: "-",
      vaultName,
      vaultNotificationConfig: {
        SNSTopic: "arn:aws:sns:us-east-1:000000000000:vault-notifications",
        Events: ["ArchiveRetrievalCompleted", "InventoryRetrievalCompleted"],
      },
    }));
  });

  test("GetVaultNotifications", async () => {
    const res = await glacier.send(new GetVaultNotificationsCommand({
      accountId: "-",
      vaultName,
    }));
    expect(res.vaultNotificationConfig).toBeDefined();
    expect(res.vaultNotificationConfig!.SNSTopic).toContain("vault-notifications");
    expect(res.vaultNotificationConfig!.Events!.length).toBe(2);
  });

  test("DeleteVaultNotifications", async () => {
    await glacier.send(new DeleteVaultNotificationsCommand({
      accountId: "-",
      vaultName,
    }));
    await expect(
      glacier.send(new GetVaultNotificationsCommand({ accountId: "-", vaultName })),
    ).rejects.toThrow();
  });

  // --- Tags ---

  test("AddTagsToVault", async () => {
    await glacier.send(new AddTagsToVaultCommand({
      accountId: "-",
      vaultName,
      Tags: { env: "test", team: "storage" },
    }));
  });

  test("ListTagsForVault", async () => {
    const res = await glacier.send(new ListTagsForVaultCommand({
      accountId: "-",
      vaultName,
    }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.env).toBe("test");
    expect(res.Tags!.team).toBe("storage");
  });

  test("RemoveTagsFromVault", async () => {
    await glacier.send(new RemoveTagsFromVaultCommand({
      accountId: "-",
      vaultName,
      TagKeys: ["team"],
    }));
    const res = await glacier.send(new ListTagsForVaultCommand({
      accountId: "-",
      vaultName,
    }));
    expect(res.Tags!.team).toBeUndefined();
    expect(res.Tags!.env).toBe("test");
  });

  // --- Cleanup ---

  test("DeleteArchive", async () => {
    await glacier.send(new DeleteArchiveCommand({
      accountId: "-",
      vaultName,
      archiveId,
    }));
    const res = await glacier.send(new DescribeVaultCommand({ accountId: "-", vaultName }));
    expect(res.NumberOfArchives).toBe(0);
  });

  test("DeleteVault - non-empty fails", async () => {
    // Upload another archive to test non-empty deletion
    const upload = await glacier.send(new UploadArchiveCommand({
      accountId: "-",
      vaultName,
      body: Buffer.from("temp"),
    }));
    await expect(
      glacier.send(new DeleteVaultCommand({ accountId: "-", vaultName })),
    ).rejects.toThrow();
    // Clean up the archive
    await glacier.send(new DeleteArchiveCommand({
      accountId: "-",
      vaultName,
      archiveId: upload.archiveId!,
    }));
  });

  test("DeleteVault", async () => {
    await glacier.send(new DeleteVaultCommand({
      accountId: "-",
      vaultName,
    }));
    await expect(
      glacier.send(new DescribeVaultCommand({ accountId: "-", vaultName })),
    ).rejects.toThrow();
  });

  test("DescribeVault - not found", async () => {
    await expect(
      glacier.send(new DescribeVaultCommand({ accountId: "-", vaultName: "nonexistent" })),
    ).rejects.toThrow();
  });
});
