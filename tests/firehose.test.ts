import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  FirehoseClient,
  CreateDeliveryStreamCommand,
  DescribeDeliveryStreamCommand,
  ListDeliveryStreamsCommand,
  DeleteDeliveryStreamCommand,
  PutRecordCommand,
  PutRecordBatchCommand,
  TagDeliveryStreamCommand,
  UntagDeliveryStreamCommand,
  ListTagsForDeliveryStreamCommand,
  UpdateDestinationCommand,
  StartDeliveryStreamEncryptionCommand,
  StopDeliveryStreamEncryptionCommand,
} from "@aws-sdk/client-firehose";
import { startServer, stopServer, clientConfig } from "./helpers";

const firehose = new FirehoseClient({
  ...clientConfig,
  requestHandler: new NodeHttpHandler(),
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Firehose", () => {
  const streamName = "test-firehose-stream-" + Date.now();

  test("CreateDeliveryStream", async () => {
    const result = await firehose.send(new CreateDeliveryStreamCommand({
      DeliveryStreamName: streamName,
      DeliveryStreamType: "DirectPut",
    }));
    expect(result.DeliveryStreamARN).toContain("firehose");
    expect(result.DeliveryStreamARN).toContain(streamName);
  });

  test("CreateDeliveryStream — duplicate throws ResourceInUseException", async () => {
    try {
      await firehose.send(new CreateDeliveryStreamCommand({
        DeliveryStreamName: streamName,
        DeliveryStreamType: "DirectPut",
      }));
      expect(true).toBe(false); // should not reach here
    } catch (e: any) {
      expect(e.name).toBe("ResourceInUseException");
    }
  });

  test("DescribeDeliveryStream", async () => {
    const result = await firehose.send(new DescribeDeliveryStreamCommand({
      DeliveryStreamName: streamName,
    }));
    const desc = result.DeliveryStreamDescription!;
    expect(desc.DeliveryStreamName).toBe(streamName);
    expect(desc.DeliveryStreamStatus).toBe("ACTIVE");
    expect(desc.DeliveryStreamType).toBe("DirectPut");
    expect(desc.DeliveryStreamARN).toContain(streamName);
    expect(desc.VersionId).toBe("1");
    expect(desc.CreateTimestamp).toBeDefined();
    expect(desc.Destinations).toBeDefined();
  });

  test("DescribeDeliveryStream — nonexistent throws ResourceNotFoundException", async () => {
    try {
      await firehose.send(new DescribeDeliveryStreamCommand({
        DeliveryStreamName: "nonexistent-stream-" + Date.now(),
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("ListDeliveryStreams", async () => {
    const result = await firehose.send(new ListDeliveryStreamsCommand({}));
    expect(result.DeliveryStreamNames).toContain(streamName);
    expect(result.HasMoreDeliveryStreams).toBe(false);
  });

  test("PutRecord", async () => {
    const data = Buffer.from("Hello Firehose!").toString("base64");
    const result = await firehose.send(new PutRecordCommand({
      DeliveryStreamName: streamName,
      Record: { Data: Buffer.from("Hello Firehose!") },
    }));
    expect(result.RecordId).toBeDefined();
    expect(typeof result.RecordId).toBe("string");
    expect(result.RecordId!.length).toBeGreaterThan(0);
  });

  test("PutRecordBatch", async () => {
    const records = [
      { Data: Buffer.from("Record 1") },
      { Data: Buffer.from("Record 2") },
      { Data: Buffer.from("Record 3") },
    ];
    const result = await firehose.send(new PutRecordBatchCommand({
      DeliveryStreamName: streamName,
      Records: records,
    }));
    expect(result.FailedPutCount).toBe(0);
    expect(result.RequestResponses?.length).toBe(3);
    for (const resp of result.RequestResponses!) {
      expect(resp.RecordId).toBeDefined();
    }
  });

  test("PutRecord — nonexistent stream throws ResourceNotFoundException", async () => {
    try {
      await firehose.send(new PutRecordCommand({
        DeliveryStreamName: "nonexistent-stream-" + Date.now(),
        Record: { Data: Buffer.from("data") },
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("TagDeliveryStream + ListTagsForDeliveryStream", async () => {
    await firehose.send(new TagDeliveryStreamCommand({
      DeliveryStreamName: streamName,
      Tags: [
        { Key: "env", Value: "test" },
        { Key: "project", Value: "tinstack" },
      ],
    }));

    const result = await firehose.send(new ListTagsForDeliveryStreamCommand({
      DeliveryStreamName: streamName,
    }));
    expect(result.Tags).toBeDefined();
    expect(result.Tags!.length).toBe(2);
    expect(result.HasMoreTags).toBe(false);

    const envTag = result.Tags!.find((t) => t.Key === "env");
    expect(envTag?.Value).toBe("test");
  });

  test("TagDeliveryStream — overwrite existing tag", async () => {
    await firehose.send(new TagDeliveryStreamCommand({
      DeliveryStreamName: streamName,
      Tags: [{ Key: "env", Value: "production" }],
    }));

    const result = await firehose.send(new ListTagsForDeliveryStreamCommand({
      DeliveryStreamName: streamName,
    }));
    const envTag = result.Tags!.find((t) => t.Key === "env");
    expect(envTag?.Value).toBe("production");
    expect(result.Tags!.length).toBe(2); // still 2 tags, not 3
  });

  test("UntagDeliveryStream", async () => {
    await firehose.send(new UntagDeliveryStreamCommand({
      DeliveryStreamName: streamName,
      TagKeys: ["project"],
    }));

    const result = await firehose.send(new ListTagsForDeliveryStreamCommand({
      DeliveryStreamName: streamName,
    }));
    expect(result.Tags!.length).toBe(1);
    expect(result.Tags![0].Key).toBe("env");
  });

  test("UpdateDestination", async () => {
    const desc = await firehose.send(new DescribeDeliveryStreamCommand({
      DeliveryStreamName: streamName,
    }));
    const destId = desc.DeliveryStreamDescription!.Destinations![0].DestinationId!;
    const versionId = desc.DeliveryStreamDescription!.VersionId!;

    await firehose.send(new UpdateDestinationCommand({
      DeliveryStreamName: streamName,
      DestinationId: destId,
      CurrentDeliveryStreamVersionId: versionId,
      S3DestinationUpdate: {
        BucketARN: "arn:aws:s3:::my-test-bucket",
        RoleARN: "arn:aws:iam::000000000000:role/firehose-role",
      },
    }));

    const updated = await firehose.send(new DescribeDeliveryStreamCommand({
      DeliveryStreamName: streamName,
    }));
    expect(updated.DeliveryStreamDescription!.VersionId).toBe("2");
  });

  test("DeleteDeliveryStream", async () => {
    await firehose.send(new DeleteDeliveryStreamCommand({
      DeliveryStreamName: streamName,
    }));

    try {
      await firehose.send(new DescribeDeliveryStreamCommand({
        DeliveryStreamName: streamName,
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("DeleteDeliveryStream — nonexistent throws ResourceNotFoundException", async () => {
    try {
      await firehose.send(new DeleteDeliveryStreamCommand({
        DeliveryStreamName: "nonexistent-stream-" + Date.now(),
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("ListDeliveryStreams — empty after deletion", async () => {
    const result = await firehose.send(new ListDeliveryStreamsCommand({}));
    expect(result.DeliveryStreamNames).not.toContain(streamName);
  });

  // --- Encryption ---
  test("StartDeliveryStreamEncryption + StopDeliveryStreamEncryption", async () => {
    const encStream = "enc-firehose-" + Date.now();
    await firehose.send(new CreateDeliveryStreamCommand({
      DeliveryStreamName: encStream,
      DeliveryStreamType: "DirectPut",
    }));

    await firehose.send(new StartDeliveryStreamEncryptionCommand({
      DeliveryStreamName: encStream,
      DeliveryStreamEncryptionConfigurationInput: {
        KeyType: "AWS_OWNED_CMK",
      },
    }));

    let desc = await firehose.send(new DescribeDeliveryStreamCommand({
      DeliveryStreamName: encStream,
    }));
    expect(desc.DeliveryStreamDescription!.DeliveryStreamEncryptionConfiguration?.Status).toBe("ENABLED");
    expect(desc.DeliveryStreamDescription!.DeliveryStreamEncryptionConfiguration?.KeyType).toBe("AWS_OWNED_CMK");

    await firehose.send(new StopDeliveryStreamEncryptionCommand({
      DeliveryStreamName: encStream,
    }));

    desc = await firehose.send(new DescribeDeliveryStreamCommand({
      DeliveryStreamName: encStream,
    }));
    expect(desc.DeliveryStreamDescription!.DeliveryStreamEncryptionConfiguration?.Status).toBe("DISABLED");

    await firehose.send(new DeleteDeliveryStreamCommand({ DeliveryStreamName: encStream }));
  });

  test("CreateDeliveryStream with tags", async () => {
    const taggedStream = "tagged-firehose-" + Date.now();
    await firehose.send(new CreateDeliveryStreamCommand({
      DeliveryStreamName: taggedStream,
      DeliveryStreamType: "DirectPut",
      Tags: [{ Key: "created", Value: "with-tags" }],
    }));

    const tags = await firehose.send(new ListTagsForDeliveryStreamCommand({
      DeliveryStreamName: taggedStream,
    }));
    expect(tags.Tags!.length).toBe(1);
    expect(tags.Tags![0].Key).toBe("created");

    await firehose.send(new DeleteDeliveryStreamCommand({
      DeliveryStreamName: taggedStream,
    }));
  });
});
