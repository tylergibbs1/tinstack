import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  IvsClient,
  CreateChannelCommand,
  GetChannelCommand,
  ListChannelsCommand,
  DeleteChannelCommand,
  CreateStreamKeyCommand,
  GetStreamKeyCommand,
  ListStreamKeysCommand,
  DeleteStreamKeyCommand,
} from "@aws-sdk/client-ivs";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new IvsClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("IVS", () => {
  let channelArn: string;
  let streamKeyArn: string;

  test("CreateChannel", async () => {
    const res = await client.send(new CreateChannelCommand({
      name: "test-channel",
      latencyMode: "LOW",
      type: "STANDARD",
    }));
    expect(res.channel).toBeDefined();
    channelArn = res.channel!.arn!;
    expect(channelArn).toBeDefined();
    expect(res.channel!.name).toBe("test-channel");
    expect(res.streamKey).toBeDefined();
    streamKeyArn = res.streamKey!.arn!;
    expect(res.streamKey!.value).toBeDefined();
  });

  test("GetChannel", async () => {
    const res = await client.send(new GetChannelCommand({ arn: channelArn }));
    expect(res.channel!.arn).toBe(channelArn);
    expect(res.channel!.name).toBe("test-channel");
    expect(res.channel!.latencyMode).toBe("LOW");
  });

  test("ListChannels", async () => {
    const res = await client.send(new ListChannelsCommand({}));
    expect(res.channels).toBeDefined();
    expect(res.channels!.length).toBeGreaterThanOrEqual(1);
  });

  test("GetStreamKey", async () => {
    const res = await client.send(new GetStreamKeyCommand({ arn: streamKeyArn }));
    expect(res.streamKey!.channelArn).toBe(channelArn);
    expect(res.streamKey!.value).toBeDefined();
  });

  test("ListStreamKeys", async () => {
    const res = await client.send(new ListStreamKeysCommand({ channelArn }));
    expect(res.streamKeys).toBeDefined();
    expect(res.streamKeys!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateStreamKey - additional", async () => {
    const res = await client.send(new CreateStreamKeyCommand({ channelArn }));
    expect(res.streamKey!.arn).toBeDefined();
    // Clean up
    await client.send(new DeleteStreamKeyCommand({ arn: res.streamKey!.arn! }));
  });

  test("DeleteChannel", async () => {
    await client.send(new DeleteChannelCommand({ arn: channelArn }));
    const res = await client.send(new ListChannelsCommand({}));
    expect(res.channels!.find((c) => c.arn === channelArn)).toBeUndefined();
  });

  test("GetChannel - not found", async () => {
    await expect(
      client.send(new GetChannelCommand({ arn: "arn:aws:ivs:us-east-1:000000000000:channel/nonexistent" })),
    ).rejects.toThrow();
  });
});
