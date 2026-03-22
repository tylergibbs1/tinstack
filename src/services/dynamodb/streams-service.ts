import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface StreamRecord {
  eventID: string;
  eventName: "INSERT" | "MODIFY" | "REMOVE";
  eventVersion: string;
  eventSource: string;
  awsRegion: string;
  dynamodb: {
    Keys: Record<string, any>;
    NewImage?: Record<string, any>;
    OldImage?: Record<string, any>;
    SequenceNumber: string;
    SizeBytes: number;
    StreamViewType: string;
    ApproximateCreationDateTime: number;
  };
}

export interface StreamDescription {
  streamArn: string;
  streamLabel: string;
  streamStatus: string;
  streamViewType: string;
  tableName: string;
  shards: StreamShard[];
  creationRequestDateTime: number;
  keySchema?: { AttributeName: string; KeyType: string }[];
}

export interface StreamShard {
  shardId: string;
  parentShardId?: string;
  sequenceNumberRange: { StartingSequenceNumber: string; EndingSequenceNumber?: string };
  records: StreamRecord[];
}

export class DynamoDbStreamsService {
  private streams: StorageBackend<string, StreamDescription>;
  private sequenceCounter = 0;
  private iterators: Map<string, { streamArn: string; shardId: string; position: number }> = new Map();

  constructor(private accountId: string) {
    this.streams = new InMemoryStorage();
  }

  createStream(tableName: string, streamViewType: string, region: string, keySchema?: { AttributeName: string; KeyType: string }[]): string {
    const label = new Date().toISOString().replace(/[:.]/g, "");
    const streamArn = buildArn("dynamodb", region, this.accountId, "table/", `${tableName}/stream/${label}`);

    const stream: StreamDescription = {
      streamArn,
      streamLabel: label,
      streamStatus: "ENABLED",
      streamViewType,
      tableName,
      shards: [{
        shardId: "shardId-00000001",
        sequenceNumberRange: { StartingSequenceNumber: "1" },
        records: [],
      }],
      creationRequestDateTime: Date.now() / 1000,
      keySchema,
    };
    this.streams.set(streamArn, stream);
    return streamArn;
  }

  putRecord(streamArn: string, eventName: "INSERT" | "MODIFY" | "REMOVE", keys: Record<string, any>, newImage: Record<string, any> | undefined, oldImage: Record<string, any> | undefined, region: string): void {
    const stream = this.streams.get(streamArn);
    if (!stream) return;

    const shard = stream.shards[stream.shards.length - 1];
    const seq = String(++this.sequenceCounter);

    const record: StreamRecord = {
      eventID: crypto.randomUUID(),
      eventName,
      eventVersion: "1.1",
      eventSource: "aws:dynamodb",
      awsRegion: region,
      dynamodb: {
        Keys: keys,
        SequenceNumber: seq,
        SizeBytes: JSON.stringify({ keys, newImage, oldImage }).length,
        StreamViewType: stream.streamViewType,
        ApproximateCreationDateTime: Date.now() / 1000,
      },
    };

    if ((stream.streamViewType === "NEW_IMAGE" || stream.streamViewType === "NEW_AND_OLD_IMAGES") && newImage) {
      record.dynamodb.NewImage = newImage;
    }
    if ((stream.streamViewType === "OLD_IMAGE" || stream.streamViewType === "NEW_AND_OLD_IMAGES") && oldImage) {
      record.dynamodb.OldImage = oldImage;
    }

    shard.records.push(record);
  }

  listStreams(tableName: string | undefined, region: string): { streamArn: string; tableName: string; streamLabel: string }[] {
    return this.streams.values()
      .filter((s) => !tableName || s.tableName === tableName)
      .map((s) => ({ streamArn: s.streamArn, tableName: s.tableName, streamLabel: s.streamLabel }));
  }

  describeStream(streamArn: string): StreamDescription {
    const stream = this.streams.get(streamArn);
    if (!stream) throw new AwsError("ResourceNotFoundException", "Stream not found.", 400);
    return stream;
  }

  getShardIterator(streamArn: string, shardId: string, iteratorType: string, sequenceNumber?: string): string {
    const stream = this.streams.get(streamArn);
    if (!stream) throw new AwsError("ResourceNotFoundException", "Stream not found.", 400);

    const shard = stream.shards.find((s) => s.shardId === shardId);
    if (!shard) throw new AwsError("ResourceNotFoundException", "Shard not found.", 400);

    let position = 0;
    if (iteratorType === "AFTER_SEQUENCE_NUMBER" && sequenceNumber) {
      position = shard.records.findIndex((r) => r.dynamodb.SequenceNumber === sequenceNumber) + 1;
    } else if (iteratorType === "AT_SEQUENCE_NUMBER" && sequenceNumber) {
      position = shard.records.findIndex((r) => r.dynamodb.SequenceNumber === sequenceNumber);
    } else if (iteratorType === "LATEST") {
      position = shard.records.length;
    }

    const iteratorId = crypto.randomUUID();
    this.iterators.set(iteratorId, { streamArn, shardId, position: Math.max(0, position) });
    return iteratorId;
  }

  getRecords(shardIterator: string, limit?: number): { records: StreamRecord[]; nextShardIterator?: string } {
    const iter = this.iterators.get(shardIterator);
    if (!iter) throw new AwsError("ExpiredIteratorException", "Iterator expired.", 400);

    const stream = this.streams.get(iter.streamArn);
    if (!stream) throw new AwsError("ResourceNotFoundException", "Stream not found.", 400);

    const shard = stream.shards.find((s) => s.shardId === iter.shardId);
    if (!shard) throw new AwsError("ResourceNotFoundException", "Shard not found.", 400);

    const maxRecords = Math.min(limit ?? 1000, 1000);
    const records = shard.records.slice(iter.position, iter.position + maxRecords);

    this.iterators.delete(shardIterator);
    const nextId = crypto.randomUUID();
    this.iterators.set(nextId, { ...iter, position: iter.position + records.length });

    return { records, nextShardIterator: nextId };
  }
}
