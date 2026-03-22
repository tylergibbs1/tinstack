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

export class KinesisService {
  private streams: StorageBackend<string, KinesisStream>;
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

  getShardIterator(streamName: string, shardId: string, iteratorType: string, startingSequenceNumber: string | undefined, region: string): string {
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

  private simpleHash(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}
