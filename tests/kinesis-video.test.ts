import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  KinesisVideoClient,
  CreateStreamCommand,
  DescribeStreamCommand,
  ListStreamsCommand,
  DeleteStreamCommand,
  UpdateStreamCommand,
  GetDataEndpointCommand,
  TagStreamCommand,
  UntagStreamCommand,
  ListTagsForStreamCommand,
} from "@aws-sdk/client-kinesis-video";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new KinesisVideoClient({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Kinesis Video", () => {
  const streamName = "test-kvs-" + Date.now();
  let streamARN: string;

  test("CreateStream", async () => {
    const result = await client.send(new CreateStreamCommand({
      StreamName: streamName,
      MediaType: "video/h264",
      DataRetentionInHours: 24,
    }));
    expect(result.StreamARN).toBeDefined();
    expect(result.StreamARN).toContain("kinesisvideo");
    streamARN = result.StreamARN!;
  });

  test("CreateStream — duplicate throws", async () => {
    try {
      await client.send(new CreateStreamCommand({ StreamName: streamName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceInUseException");
    }
  });

  test("DescribeStream", async () => {
    const result = await client.send(new DescribeStreamCommand({ StreamName: streamName }));
    expect(result.StreamInfo?.StreamName).toBe(streamName);
    expect(result.StreamInfo?.Status).toBe("ACTIVE");
    expect(result.StreamInfo?.MediaType).toBe("video/h264");
    expect(result.StreamInfo?.DataRetentionInHours).toBe(24);
  });

  test("ListStreams", async () => {
    const result = await client.send(new ListStreamsCommand({}));
    expect(result.StreamInfoList?.some((s) => s.StreamName === streamName)).toBe(true);
  });

  test("GetDataEndpoint", async () => {
    const result = await client.send(new GetDataEndpointCommand({
      StreamName: streamName,
      APIName: "GET_MEDIA",
    }));
    expect(result.DataEndpoint).toBeDefined();
  });

  test("TagStream + ListTagsForStream", async () => {
    await client.send(new TagStreamCommand({
      StreamARN: streamARN,
      Tags: { env: "test", project: "tinstack" },
    }));
    const result = await client.send(new ListTagsForStreamCommand({ StreamARN: streamARN }));
    expect(result.Tags?.env).toBe("test");
    expect(result.Tags?.project).toBe("tinstack");
  });

  test("UntagStream", async () => {
    await client.send(new UntagStreamCommand({
      StreamARN: streamARN,
      TagKeyList: ["project"],
    }));
    const result = await client.send(new ListTagsForStreamCommand({ StreamARN: streamARN }));
    expect(result.Tags?.project).toBeUndefined();
    expect(result.Tags?.env).toBe("test");
  });

  test("UpdateStream", async () => {
    const desc = await client.send(new DescribeStreamCommand({ StreamName: streamName }));
    await client.send(new UpdateStreamCommand({
      StreamName: streamName,
      CurrentVersion: desc.StreamInfo?.Version!,
      MediaType: "video/h265",
    }));
    const updated = await client.send(new DescribeStreamCommand({ StreamName: streamName }));
    expect(updated.StreamInfo?.MediaType).toBe("video/h265");
    expect(updated.StreamInfo?.Version).toBe("2");
  });

  test("DeleteStream", async () => {
    await client.send(new DeleteStreamCommand({ StreamARN: streamARN }));
    const result = await client.send(new ListStreamsCommand({}));
    expect(result.StreamInfoList?.some((s) => s.StreamName === streamName)).toBe(false);
  });
});
