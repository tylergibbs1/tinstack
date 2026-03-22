import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface KinesisStream {
  streamName: string;
  streamArn: string;
  streamStatus: string;
  shardCount: number;
  retentionPeriodHours: number;
  createdTimestamp: number;
  shards: KinesisShard[];
  tags: Record<string, string>;
  encryptionType: string; // "NONE" | "KMS"
  keyId?: string;
}

export interface KinesisShard {
  shardId: string;
  parentShardId?: string;
  hashKeyRange: { startingHashKey: string; endingHashKey: string };
  sequenceNumberRange: { startingSequenceNumber: string };
  records: KinesisRecord[];
}

export interface KinesisRecord {
  sequenceNumber: string;
  partitionKey: string;
  data: string; // base64
  timestamp: number;
}

export interface StreamConsumer {
  consumerName: string;
  consumerArn: string;
  streamArn: string;
  consumerStatus: string;
  consumerCreationTimestamp: number;
}

export class KinesisService {
  private streams: StorageBackend<string, KinesisStream>;
  private consumers: Map<string, StreamConsumer> = new Map(); // consumerArn -> consumer
  private sequenceCounter = 0;
  private iterators: Map<string, { shardId: string; streamKey: string; position: number }> = new Map();

  constructor(private accountId: string) {
    this.streams = new InMemoryStorage();
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createStream(streamName: string, shardCount: number, region: string): void {
    const key = this.regionKey(region, streamName);
    if (this.streams.has(key)) throw new AwsError("ResourceInUseException", `Stream ${streamName} already exists.`, 400);

    const count = shardCount || 1;
    const shards: KinesisShard[] = [];
    for (let i = 0; i < count; i++) {
      shards.push({
        shardId: `shardId-${String(i).padStart(12, "0")}`,
        hashKeyRange: { startingHashKey: "0", endingHashKey: "340282366920938463463374607431768211455" },
        sequenceNumberRange: { startingSequenceNumber: "0" },
        records: [],
      });
    }

    this.streams.set(key, {
      streamName,
      streamArn: buildArn("kinesis", region, this.accountId, "stream/", streamName),
      streamStatus: "ACTIVE",
      shardCount: count,
      retentionPeriodHours: 24,
      createdTimestamp: Date.now() / 1000,
      shards,
      tags: {},
      encryptionType: "NONE",
    });
  }

  deleteStream(streamName: string, region: string): void {
    const key = this.regionKey(region, streamName);
    if (!this.streams.has(key)) throw new AwsError("ResourceNotFoundException", `Stream ${streamName} not found.`, 400);
    this.streams.delete(key);
  }

  describeStream(streamName: string, region: string): KinesisStream {
    const key = this.regionKey(region, streamName);
    const stream = this.streams.get(key);
    if (!stream) throw new AwsError("ResourceNotFoundException", `Stream ${streamName} not found.`, 400);
    return stream;
  }

  listStreams(region: string): string[] {
    return this.streams.values()
      .filter((s) => this.streams.has(this.regionKey(region, s.streamName)))
      .map((s) => s.streamName);
  }

  putRecord(streamName: string, data: string, partitionKey: string, region: string): { shardId: string; sequenceNumber: string } {
    const key = this.regionKey(region, streamName);
    const stream = this.streams.get(key);
    if (!stream) throw new AwsError("ResourceNotFoundException", `Stream ${streamName} not found.`, 400);

    // Simple hash-based shard selection
    const shardIdx = Math.abs(this.simpleHash(partitionKey)) % stream.shards.length;
    const shard = stream.shards[shardIdx];
    const seq = String(++this.sequenceCounter);

    shard.records.push({ sequenceNumber: seq, partitionKey, data, timestamp: Date.now() / 1000 });

    return { shardId: shard.shardId, sequenceNumber: seq };
  }

  putRecords(streamName: string, records: { Data: string; PartitionKey: string }[], region: string): { failedRecordCount: number; records: { shardId: string; sequenceNumber: string }[] } {
    const results = records.map((r) => this.putRecord(streamName, r.Data, r.PartitionKey, region));
    return { failedRecordCount: 0, records: results };
  }

  getShardIterator(streamName: string, shardId: string, iteratorType: string, startingSequenceNumber: string | undefined, region: string, timestamp?: number): string {
    const key = this.regionKey(region, streamName);
    const stream = this.streams.get(key);
    if (!stream) throw new AwsError("ResourceNotFoundException", `Stream ${streamName} not found.`, 400);

    const shard = stream.shards.find((s) => s.shardId === shardId);
    if (!shard) throw new AwsError("ResourceNotFoundException", `Shard ${shardId} not found.`, 400);

    let position = 0;
    if (iteratorType === "AFTER_SEQUENCE_NUMBER" && startingSequenceNumber) {
      position = shard.records.findIndex((r) => r.sequenceNumber === startingSequenceNumber) + 1;
    } else if (iteratorType === "AT_SEQUENCE_NUMBER" && startingSequenceNumber) {
      position = shard.records.findIndex((r) => r.sequenceNumber === startingSequenceNumber);
    } else if (iteratorType === "AT_TIMESTAMP" && timestamp != null) {
      const idx = shard.records.findIndex((r) => r.timestamp >= timestamp);
      position = idx >= 0 ? idx : shard.records.length;
    } else if (iteratorType === "LATEST") {
      position = shard.records.length;
    }

    const iteratorId = crypto.randomUUID();
    this.iterators.set(iteratorId, { shardId, streamKey: key, position: Math.max(0, position) });
    return iteratorId;
  }

  getRecords(shardIterator: string, limit: number): { records: KinesisRecord[]; nextShardIterator: string; millisBehindLatest: number } {
    const iter = this.iterators.get(shardIterator);
    if (!iter) throw new AwsError("InvalidArgumentException", "Invalid shard iterator.", 400);

    const stream = this.streams.get(iter.streamKey);
    if (!stream) throw new AwsError("ResourceNotFoundException", "Stream not found.", 400);

    const shard = stream.shards.find((s) => s.shardId === iter.shardId);
    if (!shard) throw new AwsError("ResourceNotFoundException", "Shard not found.", 400);

    const maxRecords = Math.min(limit || 10000, 10000);
    const records = shard.records.slice(iter.position, iter.position + maxRecords);

    const newPosition = iter.position + records.length;
    const nextIteratorId = crypto.randomUUID();
    this.iterators.set(nextIteratorId, { ...iter, position: newPosition });
    this.iterators.delete(shardIterator);

    return {
      records: records.map((r) => ({ ...r, ApproximateArrivalTimestamp: r.timestamp })),
      nextShardIterator: nextIteratorId,
      millisBehindLatest: shard.records.length > newPosition ? (Date.now() - shard.records[newPosition].timestamp * 1000) : 0,
    };
  }

  describeStreamSummary(streamName: string, region: string): {
    StreamName: string; StreamARN: string; StreamStatus: string;
    RetentionPeriodHours: number; StreamCreationTimestamp: number;
    OpenShardCount: number; ConsumerCount: number; StreamModeDetails: { StreamMode: string };
  } {
    const stream = this.describeStream(streamName, region);
    return {
      StreamName: stream.streamName,
      StreamARN: stream.streamArn,
      StreamStatus: stream.streamStatus,
      RetentionPeriodHours: stream.retentionPeriodHours,
      StreamCreationTimestamp: stream.createdTimestamp,
      OpenShardCount: stream.shardCount,
      ConsumerCount: this.listStreamConsumers(stream.streamArn).length,
      StreamModeDetails: { StreamMode: "PROVISIONED" },
    };
  }

  listTagsForStream(streamName: string, region: string): { Tags: { Key: string; Value: string }[]; HasMoreTags: boolean } {
    const stream = this.describeStream(streamName, region);
    return {
      Tags: Object.entries(stream.tags).map(([Key, Value]) => ({ Key, Value })),
      HasMoreTags: false,
    };
  }

  addTagsToStream(streamName: string, tags: Record<string, string>, region: string): void {
    const stream = this.describeStream(streamName, region);
    Object.assign(stream.tags, tags);
  }

  listShards(streamName: string, region: string): KinesisShard[] {
    const stream = this.describeStream(streamName, region);
    return stream.shards;
  }

  updateShardCount(streamName: string, targetShardCount: number, region: string): { streamName: string; currentShardCount: number; targetShardCount: number } {
    const key = this.regionKey(region, streamName);
    const stream = this.streams.get(key);
    if (!stream) throw new AwsError("ResourceNotFoundException", `Stream ${streamName} not found.`, 400);

    const currentCount = stream.shardCount;
    const maxHashKey = "340282366920938463463374607431768211455";

    const newShards: KinesisShard[] = [];
    for (let i = 0; i < targetShardCount; i++) {
      newShards.push({
        shardId: `shardId-${String(i).padStart(12, "0")}`,
        hashKeyRange: { startingHashKey: "0", endingHashKey: maxHashKey },
        sequenceNumberRange: { startingSequenceNumber: "0" },
        records: [],
      });
    }

    stream.shards = newShards;
    stream.shardCount = targetShardCount;

    return { streamName, currentShardCount: currentCount, targetShardCount };
  }

  registerStreamConsumer(consumerName: string, streamArn: string, region: string): StreamConsumer {
    // Check for duplicate
    for (const c of this.consumers.values()) {
      if (c.streamArn === streamArn && c.consumerName === consumerName) {
        throw new AwsError("ResourceInUseException", `Consumer ${consumerName} already exists.`, 400);
      }
    }

    const consumerArn = `${streamArn}/consumer/${consumerName}:${Date.now()}`;
    const consumer: StreamConsumer = {
      consumerName,
      consumerArn,
      streamArn,
      consumerStatus: "ACTIVE",
      consumerCreationTimestamp: Date.now() / 1000,
    };
    this.consumers.set(consumerArn, consumer);
    return consumer;
  }

  describeStreamConsumer(consumerArn?: string, consumerName?: string, streamArn?: string): StreamConsumer {
    if (consumerArn) {
      const consumer = this.consumers.get(consumerArn);
      if (!consumer) throw new AwsError("ResourceNotFoundException", "Consumer not found.", 400);
      return consumer;
    }
    if (consumerName && streamArn) {
      for (const c of this.consumers.values()) {
        if (c.streamArn === streamArn && c.consumerName === consumerName) return c;
      }
    }
    throw new AwsError("ResourceNotFoundException", "Consumer not found.", 400);
  }

  listStreamConsumers(streamArn: string): StreamConsumer[] {
    return [...this.consumers.values()].filter((c) => c.streamArn === streamArn);
  }

  deregisterStreamConsumer(consumerArn?: string, consumerName?: string, streamArn?: string): void {
    if (consumerArn) {
      if (!this.consumers.has(consumerArn)) throw new AwsError("ResourceNotFoundException", "Consumer not found.", 400);
      this.consumers.delete(consumerArn);
      return;
    }
    if (consumerName && streamArn) {
      for (const [arn, c] of this.consumers) {
        if (c.streamArn === streamArn && c.consumerName === consumerName) {
          this.consumers.delete(arn);
          return;
        }
      }
    }
    throw new AwsError("ResourceNotFoundException", "Consumer not found.", 400);
  }

  startStreamEncryption(streamName: string, encryptionType: string, keyId: string, region: string): void {
    const stream = this.describeStream(streamName, region);
    stream.encryptionType = encryptionType;
    stream.keyId = keyId;
  }

  stopStreamEncryption(streamName: string, encryptionType: string, keyId: string, region: string): void {
    const stream = this.describeStream(streamName, region);
    stream.encryptionType = "NONE";
    stream.keyId = undefined;
  }

  mergeShards(streamName: string, shardToMerge: string, adjacentShardToMerge: string, region: string): void {
    const key = this.regionKey(region, streamName);
    const stream = this.streams.get(key);
    if (!stream) throw new AwsError("ResourceNotFoundException", `Stream ${streamName} not found.`, 400);

    const shard1Idx = stream.shards.findIndex((s) => s.shardId === shardToMerge);
    const shard2Idx = stream.shards.findIndex((s) => s.shardId === adjacentShardToMerge);
    if (shard1Idx < 0) throw new AwsError("ResourceNotFoundException", `Shard ${shardToMerge} not found.`, 400);
    if (shard2Idx < 0) throw new AwsError("ResourceNotFoundException", `Shard ${adjacentShardToMerge} not found.`, 400);

    const shard1 = stream.shards[shard1Idx];
    const shard2 = stream.shards[shard2Idx];

    // Create merged shard
    const mergedShard: KinesisShard = {
      shardId: `shardId-${String(stream.shards.length).padStart(12, "0")}`,
      parentShardId: shard1.shardId,
      hashKeyRange: {
        startingHashKey: shard1.hashKeyRange.startingHashKey < shard2.hashKeyRange.startingHashKey
          ? shard1.hashKeyRange.startingHashKey : shard2.hashKeyRange.startingHashKey,
        endingHashKey: shard1.hashKeyRange.endingHashKey > shard2.hashKeyRange.endingHashKey
          ? shard1.hashKeyRange.endingHashKey : shard2.hashKeyRange.endingHashKey,
      },
      sequenceNumberRange: { startingSequenceNumber: String(this.sequenceCounter + 1) },
      records: [...shard1.records, ...shard2.records],
    };

    // Remove old shards, add merged
    stream.shards = stream.shards.filter((s) => s.shardId !== shardToMerge && s.shardId !== adjacentShardToMerge);
    stream.shards.push(mergedShard);
    stream.shardCount = stream.shards.length;
  }

  splitShard(streamName: string, shardToSplit: string, newStartingHashKey: string, region: string): void {
    const key = this.regionKey(region, streamName);
    const stream = this.streams.get(key);
    if (!stream) throw new AwsError("ResourceNotFoundException", `Stream ${streamName} not found.`, 400);

    const shardIdx = stream.shards.findIndex((s) => s.shardId === shardToSplit);
    if (shardIdx < 0) throw new AwsError("ResourceNotFoundException", `Shard ${shardToSplit} not found.`, 400);

    const shard = stream.shards[shardIdx];
    const nextId = stream.shards.length;

    const child1: KinesisShard = {
      shardId: `shardId-${String(nextId).padStart(12, "0")}`,
      parentShardId: shard.shardId,
      hashKeyRange: {
        startingHashKey: shard.hashKeyRange.startingHashKey,
        endingHashKey: String(BigInt(newStartingHashKey) - 1n),
      },
      sequenceNumberRange: { startingSequenceNumber: String(this.sequenceCounter + 1) },
      records: [],
    };

    const child2: KinesisShard = {
      shardId: `shardId-${String(nextId + 1).padStart(12, "0")}`,
      parentShardId: shard.shardId,
      hashKeyRange: {
        startingHashKey: newStartingHashKey,
        endingHashKey: shard.hashKeyRange.endingHashKey,
      },
      sequenceNumberRange: { startingSequenceNumber: String(this.sequenceCounter + 1) },
      records: [],
    };

    stream.shards = stream.shards.filter((s) => s.shardId !== shardToSplit);
    stream.shards.push(child1, child2);
    stream.shardCount = stream.shards.length;
  }

  describeLimits(region: string): { shardLimit: number; openShardCount: number; onDemandStreamCount: number; onDemandStreamCountLimit: number } {
    let openShardCount = 0;
    for (const stream of this.streams.values()) {
      if (this.streams.has(this.regionKey(region, stream.streamName))) {
        openShardCount += stream.shardCount;
      }
    }
    return {
      shardLimit: 500,
      openShardCount,
      onDemandStreamCount: 0,
      onDemandStreamCountLimit: 50,
    };
  }

  private simpleHash(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}
