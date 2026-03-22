import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  KinesisClient,
  CreateStreamCommand,
  DescribeStreamCommand,
  ListStreamsCommand,
  PutRecordCommand,
  GetShardIteratorCommand,
  GetRecordsCommand,
  DeleteStreamCommand,
} from "@aws-sdk/client-kinesis";
import { startServer, stopServer, clientConfig } from "./helpers";

const kinesis = new KinesisClient({
  ...clientConfig,
  requestHandler: new NodeHttpHandler(),
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Kinesis", () => {
  const streamName = "test-stream-" + Date.now();

  test("CreateStream", async () => {
    await kinesis.send(new CreateStreamCommand({ StreamName: streamName, ShardCount: 1 }));
    const desc = await kinesis.send(new DescribeStreamCommand({ StreamName: streamName }));
    expect(desc.StreamDescription?.StreamStatus).toBe("ACTIVE");
    expect(desc.StreamDescription?.Shards?.length).toBe(1);
  });

  test("ListStreams", async () => {
    const res = await kinesis.send(new ListStreamsCommand({}));
    expect(res.StreamNames?.includes(streamName)).toBe(true);
  });

  test("PutRecord + GetRecords", async () => {
    const put = await kinesis.send(new PutRecordCommand({
      StreamName: streamName,
      Data: Buffer.from("Hello Kinesis!"),
      PartitionKey: "pk1",
    }));
    expect(put.ShardId).toBeDefined();
    expect(put.SequenceNumber).toBeDefined();

    const desc = await kinesis.send(new DescribeStreamCommand({ StreamName: streamName }));
    const shardId = desc.StreamDescription!.Shards![0].ShardId!;

    const iter = await kinesis.send(new GetShardIteratorCommand({
      StreamName: streamName,
      ShardId: shardId,
      ShardIteratorType: "TRIM_HORIZON",
    }));

    const records = await kinesis.send(new GetRecordsCommand({ ShardIterator: iter.ShardIterator! }));
    expect(records.Records?.length).toBeGreaterThan(0);
    expect(records.NextShardIterator).toBeDefined();
  });

  test("DeleteStream", async () => {
    await kinesis.send(new DeleteStreamCommand({ StreamName: streamName }));
    try {
      await kinesis.send(new DescribeStreamCommand({ StreamName: streamName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });
});
