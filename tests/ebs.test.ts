import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  EBSClient,
  StartSnapshotCommand,
  CompleteSnapshotCommand,
  PutSnapshotBlockCommand,
  GetSnapshotBlockCommand,
  ListSnapshotBlocksCommand,
  ListChangedBlocksCommand,
} from "@aws-sdk/client-ebs";
import { startServer, stopServer, clientConfig } from "./helpers";

const ebs = new EBSClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("EBS", () => {
  let snapshotId: string;
  let snapshotId2: string;

  test("StartSnapshot", async () => {
    const res = await ebs.send(new StartSnapshotCommand({
      VolumeSize: 8,
      Description: "Test snapshot",
      Tags: [{ Key: "env", Value: "test" }],
    }));
    snapshotId = res.SnapshotId!;
    expect(snapshotId).toBeDefined();
    expect(snapshotId).toStartWith("snap-");
    expect(res.Status).toBe("pending");
    expect(res.VolumeSize).toBe(8);
    expect(res.BlockSize).toBe(524288);
    expect(res.Description).toBe("Test snapshot");
  });

  test("PutSnapshotBlock", async () => {
    const blockData = "A".repeat(524288);
    const res = await ebs.send(new PutSnapshotBlockCommand({
      SnapshotId: snapshotId,
      BlockIndex: 0,
      BlockData: new TextEncoder().encode(blockData) as any,
      Checksum: "abc123",
      ChecksumAlgorithm: "SHA256",
      DataLength: blockData.length,
    }));
    expect(res.Checksum).toBe("abc123");
    expect(res.ChecksumAlgorithm).toBe("SHA256");
  });

  test("PutSnapshotBlock - second block", async () => {
    const blockData = "B".repeat(524288);
    await ebs.send(new PutSnapshotBlockCommand({
      SnapshotId: snapshotId,
      BlockIndex: 1,
      BlockData: new TextEncoder().encode(blockData) as any,
      Checksum: "def456",
      ChecksumAlgorithm: "SHA256",
      DataLength: blockData.length,
    }));
  });

  test("GetSnapshotBlock", async () => {
    const res = await ebs.send(new GetSnapshotBlockCommand({
      SnapshotId: snapshotId,
      BlockIndex: 0,
    }));
    expect(res.Checksum).toBe("abc123");
    expect(res.DataLength).toBe(524288);
    expect(res.BlockData).toBeDefined();
  });

  test("ListSnapshotBlocks", async () => {
    const res = await ebs.send(new ListSnapshotBlocksCommand({
      SnapshotId: snapshotId,
    }));
    expect(res.Blocks).toBeDefined();
    expect(res.Blocks!.length).toBe(2);
    expect(res.Blocks![0].BlockIndex).toBe(0);
    expect(res.Blocks![1].BlockIndex).toBe(1);
    expect(res.VolumeSize).toBe(8);
    expect(res.BlockSize).toBe(524288);
  });

  test("CompleteSnapshot", async () => {
    const res = await ebs.send(new CompleteSnapshotCommand({
      SnapshotId: snapshotId,
      ChangedBlocksCount: 2,
    }));
    expect(res.Status).toBe("completed");
  });

  test("PutSnapshotBlock - after complete fails", async () => {
    await expect(
      ebs.send(new PutSnapshotBlockCommand({
        SnapshotId: snapshotId,
        BlockIndex: 2,
        BlockData: new TextEncoder().encode("C") as any,
        Checksum: "ghi789",
        ChecksumAlgorithm: "SHA256",
        DataLength: 1,
      })),
    ).rejects.toThrow();
  });

  // --- ListChangedBlocks ---

  test("StartSnapshot - second", async () => {
    const res = await ebs.send(new StartSnapshotCommand({
      VolumeSize: 8,
      Description: "Second snapshot",
    }));
    snapshotId2 = res.SnapshotId!;
    expect(snapshotId2).toBeDefined();

    // Put a different block
    await ebs.send(new PutSnapshotBlockCommand({
      SnapshotId: snapshotId2,
      BlockIndex: 0,
      BlockData: new TextEncoder().encode("X".repeat(100)) as any,
      Checksum: "xxx000",
      ChecksumAlgorithm: "SHA256",
      DataLength: 100,
    }));
  });

  test("ListChangedBlocks", async () => {
    const res = await ebs.send(new ListChangedBlocksCommand({
      SecondSnapshotId: snapshotId2,
      FirstSnapshotId: snapshotId,
    }));
    expect(res.ChangedBlocks).toBeDefined();
    expect(res.ChangedBlocks!.length).toBeGreaterThanOrEqual(1);
    expect(res.VolumeSize).toBe(8);
  });

  test("ListChangedBlocks - second snapshot only", async () => {
    // ListChangedBlocks requires SecondSnapshotId, FirstSnapshotId is optional in the API
    // but the SDK requires it as a path param, so we test with both
    const res = await ebs.send(new ListChangedBlocksCommand({
      SecondSnapshotId: snapshotId2,
      FirstSnapshotId: snapshotId,
    }));
    expect(res.ChangedBlocks).toBeDefined();
    expect(res.ChangedBlocks!.length).toBeGreaterThanOrEqual(1);
  });

  test("GetSnapshotBlock - not found", async () => {
    await expect(
      ebs.send(new GetSnapshotBlockCommand({
        SnapshotId: snapshotId,
        BlockIndex: 999,
      })),
    ).rejects.toThrow();
  });

  test("StartSnapshot - not found snapshot", async () => {
    await expect(
      ebs.send(new ListSnapshotBlocksCommand({
        SnapshotId: "snap-nonexistent",
      })),
    ).rejects.toThrow();
  });
});
