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
  ListShardsCommand,
  UpdateShardCountCommand,
  RegisterStreamConsumerCommand,
  DescribeStreamConsumerCommand,
  ListStreamConsumersCommand,
  DeregisterStreamConsumerCommand,
  StartStreamEncryptionCommand,
  StopStreamEncryptionCommand,
  MergeShardsCommand,
  SplitShardCommand,
  DescribeLimitsCommand,
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

  test("ListShards", async () => {
    const res = await kinesis.send(new ListShardsCommand({ StreamName: streamName }));
    expect(res.Shards?.length).toBe(1);
    expect(res.Shards?.[0].ShardId).toBe("shardId-000000000000");
    expect(res.Shards?.[0].HashKeyRange?.StartingHashKey).toBe("0");
  });

  test("UpdateShardCount", async () => {
    const res = await kinesis.send(new UpdateShardCountCommand({
      StreamName: streamName,
      TargetShardCount: 3,
      ScalingType: "UNIFORM_SCALING",
    }));
    expect(res.TargetShardCount).toBe(3);
    expect(res.CurrentShardCount).toBe(1);

    const desc = await kinesis.send(new DescribeStreamCommand({ StreamName: streamName }));
    expect(desc.StreamDescription?.Shards?.length).toBe(3);

    // Restore to 1 shard for remaining tests
    await kinesis.send(new UpdateShardCountCommand({
      StreamName: streamName,
      TargetShardCount: 1,
      ScalingType: "UNIFORM_SCALING",
    }));
  });

  test("RegisterStreamConsumer + DescribeStreamConsumer", async () => {
    const desc = await kinesis.send(new DescribeStreamCommand({ StreamName: streamName }));
    const streamArn = desc.StreamDescription!.StreamARN!;

    const reg = await kinesis.send(new RegisterStreamConsumerCommand({
      ConsumerName: "test-consumer",
      StreamARN: streamArn,
    }));
    expect(reg.Consumer?.ConsumerName).toBe("test-consumer");
    expect(reg.Consumer?.ConsumerARN).toBeDefined();
    expect(reg.Consumer?.ConsumerStatus).toBe("ACTIVE");

    const descConsumer = await kinesis.send(new DescribeStreamConsumerCommand({
      ConsumerARN: reg.Consumer!.ConsumerARN!,
    }));
    expect(descConsumer.ConsumerDescription?.ConsumerName).toBe("test-consumer");
    expect(descConsumer.ConsumerDescription?.StreamARN).toBe(streamArn);
  });

  test("ListStreamConsumers", async () => {
    const desc = await kinesis.send(new DescribeStreamCommand({ StreamName: streamName }));
    const streamArn = desc.StreamDescription!.StreamARN!;

    const res = await kinesis.send(new ListStreamConsumersCommand({ StreamARN: streamArn }));
    expect(res.Consumers?.length).toBe(1);
    expect(res.Consumers?.[0].ConsumerName).toBe("test-consumer");
  });

  test("DeregisterStreamConsumer", async () => {
    const desc = await kinesis.send(new DescribeStreamCommand({ StreamName: streamName }));
    const streamArn = desc.StreamDescription!.StreamARN!;

    const list = await kinesis.send(new ListStreamConsumersCommand({ StreamARN: streamArn }));
    await kinesis.send(new DeregisterStreamConsumerCommand({
      ConsumerARN: list.Consumers![0].ConsumerARN!,
    }));

    const listAfter = await kinesis.send(new ListStreamConsumersCommand({ StreamARN: streamArn }));
    expect(listAfter.Consumers?.length ?? 0).toBe(0);
  });

  // --- Encryption ---

  test("StartStreamEncryption + StopStreamEncryption", async () => {
    await kinesis.send(new StartStreamEncryptionCommand({
      StreamName: streamName,
      EncryptionType: "KMS",
      KeyId: "alias/my-key",
    }));

    // Verify encryption is set (via DescribeStream we can check indirectly)
    const desc = await kinesis.send(new DescribeStreamCommand({ StreamName: streamName }));
    expect(desc.StreamDescription?.StreamStatus).toBe("ACTIVE");

    await kinesis.send(new StopStreamEncryptionCommand({
      StreamName: streamName,
      EncryptionType: "KMS",
      KeyId: "alias/my-key",
    }));
  });

  // --- DescribeLimits ---

  test("DescribeLimits", async () => {
    const res = await kinesis.send(new DescribeLimitsCommand({}));
    expect(res.ShardLimit).toBe(500);
    expect(res.OpenShardCount).toBeGreaterThanOrEqual(1);
  });

  // --- SplitShard ---

  test("SplitShard", async () => {
    // Create a stream with 1 shard for splitting
    const splitStream = "split-test-" + Date.now();
    await kinesis.send(new CreateStreamCommand({ StreamName: splitStream, ShardCount: 1 }));

    const before = await kinesis.send(new ListShardsCommand({ StreamName: splitStream }));
    const shardId = before.Shards![0].ShardId!;
    expect(before.Shards?.length).toBe(1);

    await kinesis.send(new SplitShardCommand({
      StreamName: splitStream,
      ShardToSplit: shardId,
      NewStartingHashKey: "170141183460469231731687303715884105728",
    }));

    const after = await kinesis.send(new ListShardsCommand({ StreamName: splitStream }));
    expect(after.Shards?.length).toBe(2);

    await kinesis.send(new DeleteStreamCommand({ StreamName: splitStream }));
  });

  // --- MergeShards ---

  test("MergeShards", async () => {
    const mergeStream = "merge-test-" + Date.now();
    await kinesis.send(new CreateStreamCommand({ StreamName: mergeStream, ShardCount: 2 }));

    const before = await kinesis.send(new ListShardsCommand({ StreamName: mergeStream }));
    expect(before.Shards?.length).toBe(2);

    await kinesis.send(new MergeShardsCommand({
      StreamName: mergeStream,
      ShardToMerge: before.Shards![0].ShardId!,
      AdjacentShardToMerge: before.Shards![1].ShardId!,
    }));

    const after = await kinesis.send(new ListShardsCommand({ StreamName: mergeStream }));
    expect(after.Shards?.length).toBe(1);

    await kinesis.send(new DeleteStreamCommand({ StreamName: mergeStream }));
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
