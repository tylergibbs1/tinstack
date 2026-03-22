import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
  GetResourcesCommand,
  GetTagKeysCommand,
  GetTagValuesCommand,
} from "@aws-sdk/client-resource-groups-tagging-api";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ResourceGroupsTaggingAPIClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Resource Groups Tagging API", () => {
  const arn1 = "arn:aws:s3:::test-bucket-1";
  const arn2 = "arn:aws:s3:::test-bucket-2";

  test("TagResources", async () => {
    const res = await client.send(new TagResourcesCommand({
      ResourceARNList: [arn1, arn2],
      Tags: { env: "test", team: "platform" },
    }));
    expect(res.FailedResourcesMap).toBeDefined();
  });

  test("GetResources", async () => {
    const res = await client.send(new GetResourcesCommand({}));
    expect(res.ResourceTagMappingList).toBeDefined();
    expect(res.ResourceTagMappingList!.length).toBeGreaterThanOrEqual(2);
    const found = res.ResourceTagMappingList!.find((r) => r.ResourceARN === arn1);
    expect(found).toBeDefined();
    expect(found!.Tags!.find((t) => t.Key === "env")?.Value).toBe("test");
  });

  test("GetResources with tag filter", async () => {
    const res = await client.send(new GetResourcesCommand({
      TagFilters: [{ Key: "team", Values: ["platform"] }],
    }));
    expect(res.ResourceTagMappingList!.length).toBe(2);
  });

  test("GetTagKeys", async () => {
    const res = await client.send(new GetTagKeysCommand({}));
    expect(res.TagKeys).toContain("env");
    expect(res.TagKeys).toContain("team");
  });

  test("GetTagValues", async () => {
    const res = await client.send(new GetTagValuesCommand({ Key: "env" }));
    expect(res.TagValues).toContain("test");
  });

  test("UntagResources", async () => {
    await client.send(new UntagResourcesCommand({
      ResourceARNList: [arn1],
      TagKeys: ["team"],
    }));
    const res = await client.send(new GetResourcesCommand({
      TagFilters: [{ Key: "team" }],
    }));
    // arn1 should no longer match
    const found = res.ResourceTagMappingList!.find((r) => r.ResourceARN === arn1);
    expect(found).toBeUndefined();
  });
});
