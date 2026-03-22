import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface EbsBlock {
  blockIndex: number;
  blockToken: string;
  blockData: string;
  checksum: string;
  checksumAlgorithm: string;
  dataLength: number;
}

export interface EbsSnapshot {
  snapshotId: string;
  ownerId: string;
  status: string;
  startTime: number;
  volumeSize: number;
  blockSize: number;
  description: string;
  tags: { Key: string; Value: string }[];
  blocks: Map<number, EbsBlock>;
  changedBlocksCount: number;
}

export class EbsService {
  private snapshots: StorageBackend<string, EbsSnapshot>;

  constructor(private accountId: string) {
    this.snapshots = new InMemoryStorage();
  }

  startSnapshot(
    volumeSize: number,
    description: string | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    parentSnapshotId: string | undefined,
  ): EbsSnapshot {
    const snapshotId = `snap-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`;
    const snap: EbsSnapshot = {
      snapshotId,
      ownerId: this.accountId,
      status: "pending",
      startTime: Date.now() / 1000,
      volumeSize: volumeSize ?? 1,
      blockSize: 524288,
      description: description ?? "",
      tags: tags ?? [],
      blocks: new Map(),
      changedBlocksCount: 0,
    };
    this.snapshots.set(snapshotId, snap);
    return snap;
  }

  completeSnapshot(snapshotId: string, changedBlocksCount: number): EbsSnapshot {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) throw new AwsError("ResourceNotFoundException", `Snapshot ${snapshotId} not found.`, 404);
    snap.status = "completed";
    snap.changedBlocksCount = changedBlocksCount;
    return snap;
  }

  putSnapshotBlock(
    snapshotId: string,
    blockIndex: number,
    blockData: string,
    checksum: string,
    checksumAlgorithm: string,
    dataLength: number,
  ): { checksum: string; checksumAlgorithm: string } {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) throw new AwsError("ResourceNotFoundException", `Snapshot ${snapshotId} not found.`, 404);
    if (snap.status === "completed") {
      throw new AwsError("ConflictException", `Snapshot ${snapshotId} is already completed.`, 409);
    }

    const blockToken = crypto.randomUUID().replace(/-/g, "");
    snap.blocks.set(blockIndex, {
      blockIndex,
      blockToken,
      blockData,
      checksum,
      checksumAlgorithm: checksumAlgorithm ?? "SHA256",
      dataLength,
    });
    return { checksum, checksumAlgorithm: checksumAlgorithm ?? "SHA256" };
  }

  getSnapshotBlock(snapshotId: string, blockIndex: number): EbsBlock {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) throw new AwsError("ResourceNotFoundException", `Snapshot ${snapshotId} not found.`, 404);
    const block = snap.blocks.get(blockIndex);
    if (!block) throw new AwsError("ResourceNotFoundException", `Block ${blockIndex} not found in snapshot ${snapshotId}.`, 404);
    return block;
  }

  listSnapshotBlocks(snapshotId: string, startingBlockIndex?: number): { blocks: { BlockIndex: number; BlockToken: string }[]; volumeSize: number; blockSize: number } {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) throw new AwsError("ResourceNotFoundException", `Snapshot ${snapshotId} not found.`, 404);

    let entries = Array.from(snap.blocks.entries()).sort(([a], [b]) => a - b);
    if (startingBlockIndex !== undefined) {
      entries = entries.filter(([idx]) => idx >= startingBlockIndex);
    }

    return {
      blocks: entries.map(([idx, block]) => ({ BlockIndex: idx, BlockToken: block.blockToken })),
      volumeSize: snap.volumeSize,
      blockSize: snap.blockSize,
    };
  }

  listChangedBlocks(secondSnapshotId: string, firstSnapshotId?: string): { changedBlocks: { BlockIndex: number; FirstBlockToken?: string; SecondBlockToken: string }[]; volumeSize: number; blockSize: number } {
    const snap2 = this.snapshots.get(secondSnapshotId);
    if (!snap2) throw new AwsError("ResourceNotFoundException", `Snapshot ${secondSnapshotId} not found.`, 404);

    const snap1 = firstSnapshotId ? this.snapshots.get(firstSnapshotId) : undefined;
    if (firstSnapshotId && !snap1) throw new AwsError("ResourceNotFoundException", `Snapshot ${firstSnapshotId} not found.`, 404);

    const changedBlocks: { BlockIndex: number; FirstBlockToken?: string; SecondBlockToken: string }[] = [];

    for (const [idx, block] of snap2.blocks.entries()) {
      const firstBlock = snap1?.blocks.get(idx);
      changedBlocks.push({
        BlockIndex: idx,
        FirstBlockToken: firstBlock?.blockToken,
        SecondBlockToken: block.blockToken,
      });
    }

    changedBlocks.sort((a, b) => a.BlockIndex - b.BlockIndex);

    return {
      changedBlocks,
      volumeSize: snap2.volumeSize,
      blockSize: snap2.blockSize,
    };
  }
}
