import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  MediaPackageClient,
  CreateChannelCommand,
  DescribeChannelCommand,
  ListChannelsCommand,
  DeleteChannelCommand,
  CreateOriginEndpointCommand,
  ListOriginEndpointsCommand,
  DeleteOriginEndpointCommand,
} from "@aws-sdk/client-mediapackage";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new MediaPackageClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("MediaPackage", () => {
  test("CreateChannel", async () => {
    const res = await client.send(new CreateChannelCommand({ Id: "test-ch", Description: "test" }));
    expect(res.Id).toBe("test-ch");
    expect(res.Arn).toContain("mediapackage");
  });

  test("DescribeChannel", async () => {
    const res = await client.send(new DescribeChannelCommand({ Id: "test-ch" }));
    expect(res.Id).toBe("test-ch");
  });

  test("ListChannels", async () => {
    const res = await client.send(new ListChannelsCommand({}));
    expect(res.Channels!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateOriginEndpoint + List + Delete", async () => {
    const res = await client.send(new CreateOriginEndpointCommand({ Id: "test-ep", ChannelId: "test-ch" }));
    expect(res.Id).toBe("test-ep");

    const list = await client.send(new ListOriginEndpointsCommand({}));
    expect(list.OriginEndpoints!.length).toBeGreaterThanOrEqual(1);

    await client.send(new DeleteOriginEndpointCommand({ Id: "test-ep" }));
  });

  test("DeleteChannel", async () => {
    await client.send(new DeleteChannelCommand({ Id: "test-ch" }));
    const res = await client.send(new ListChannelsCommand({}));
    expect(res.Channels!.some(c => c.Id === "test-ch")).toBe(false);
  });
});
