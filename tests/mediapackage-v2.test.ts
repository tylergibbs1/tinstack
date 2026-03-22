import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  MediaPackageV2Client,
  CreateChannelGroupCommand,
  GetChannelGroupCommand,
  ListChannelGroupsCommand,
  DeleteChannelGroupCommand,
  CreateChannelCommand,
} from "@aws-sdk/client-mediapackagev2";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const client = new MediaPackageV2Client({
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("MediaPackage V2", () => {
  test("CreateChannelGroup", async () => {
    const res = await client.send(new CreateChannelGroupCommand({
      ChannelGroupName: "test-group",
      Description: "test",
    }));
    expect(res.ChannelGroupName).toBe("test-group");
  });

  test("GetChannelGroup", async () => {
    const res = await client.send(new GetChannelGroupCommand({
      ChannelGroupName: "test-group",
    }));
    expect(res.ChannelGroupName).toBe("test-group");
  });

  test("ListChannelGroups", async () => {
    const res = await client.send(new ListChannelGroupsCommand({}));
    expect(res.Items!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateChannel", async () => {
    const res = await client.send(new CreateChannelCommand({
      ChannelGroupName: "test-group",
      ChannelName: "test-channel",
    }));
    expect(res.ChannelName).toBe("test-channel");
  });

  test("DeleteChannelGroup", async () => {
    const res = await client.send(new DeleteChannelGroupCommand({
      ChannelGroupName: "test-group",
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });
});
