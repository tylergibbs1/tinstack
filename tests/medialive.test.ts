import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  MediaLiveClient,
  CreateChannelCommand,
  DescribeChannelCommand,
  ListChannelsCommand,
  DeleteChannelCommand,
  StartChannelCommand,
  StopChannelCommand,
  CreateInputCommand,
  DescribeInputCommand,
  ListInputsCommand,
  DeleteInputCommand,
} from "@aws-sdk/client-medialive";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new MediaLiveClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("MediaLive", () => {
  let channelId: string;
  let inputId: string;

  test("CreateInput", async () => {
    const res = await client.send(new CreateInputCommand({
      Name: "test-input",
      Type: "URL_PULL",
      Sources: [{ Url: "https://example.com/stream.m3u8" }],
    }));
    expect(res.Input).toBeDefined();
    inputId = res.Input!.Id!;
    expect(inputId).toBeDefined();
    expect(res.Input!.Name).toBe("test-input");
  });

  test("DescribeInput", async () => {
    const res = await client.send(new DescribeInputCommand({ InputId: inputId }));
    expect(res.Name).toBe("test-input");
    expect(res.Type).toBe("URL_PULL");
  });

  test("ListInputs", async () => {
    const res = await client.send(new ListInputsCommand({}));
    expect(res.Inputs).toBeDefined();
    expect(res.Inputs!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateChannel", async () => {
    const res = await client.send(new CreateChannelCommand({
      Name: "test-channel",
      ChannelClass: "SINGLE_PIPELINE",
      InputAttachments: [{ InputId: inputId }],
    }));
    expect(res.Channel).toBeDefined();
    channelId = res.Channel!.Id!;
    expect(channelId).toBeDefined();
    expect(res.Channel!.Name).toBe("test-channel");
  });

  test("DescribeChannel", async () => {
    const res = await client.send(new DescribeChannelCommand({ ChannelId: channelId }));
    expect(res.Name).toBe("test-channel");
    expect(res.State).toBe("IDLE");
  });

  test("ListChannels", async () => {
    const res = await client.send(new ListChannelsCommand({}));
    expect(res.Channels).toBeDefined();
    expect(res.Channels!.length).toBeGreaterThanOrEqual(1);
  });

  test("StartChannel", async () => {
    await client.send(new StartChannelCommand({ ChannelId: channelId }));
    const res = await client.send(new DescribeChannelCommand({ ChannelId: channelId }));
    expect(res.State).toBe("RUNNING");
  });

  test("StopChannel", async () => {
    await client.send(new StopChannelCommand({ ChannelId: channelId }));
    const res = await client.send(new DescribeChannelCommand({ ChannelId: channelId }));
    expect(res.State).toBe("IDLE");
  });

  test("DeleteChannel", async () => {
    await client.send(new DeleteChannelCommand({ ChannelId: channelId }));
  });

  test("DeleteInput", async () => {
    await client.send(new DeleteInputCommand({ InputId: inputId }));
  });
});
