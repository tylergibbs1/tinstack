import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ResourceGroupsClient,
  CreateGroupCommand,
  GetGroupCommand,
  ListGroupsCommand,
  DeleteGroupCommand,
  UpdateGroupCommand,
  TagCommand,
  UntagCommand,
  GetTagsCommand,
} from "@aws-sdk/client-resource-groups";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ResourceGroupsClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Resource Groups", () => {
  let groupArn: string;

  test("CreateGroup", async () => {
    const res = await client.send(new CreateGroupCommand({
      Name: "test-group",
      Description: "A test group",
      Tags: { env: "test" },
    }));
    expect(res.Group).toBeDefined();
    expect(res.Group!.Name).toBe("test-group");
    groupArn = res.Group!.GroupArn!;
    expect(groupArn).toBeDefined();
  });

  test("GetGroup", async () => {
    const res = await client.send(new GetGroupCommand({ GroupName: "test-group" }));
    expect(res.Group).toBeDefined();
    expect(res.Group!.Name).toBe("test-group");
    expect(res.Group!.Description).toBe("A test group");
  });

  test("ListGroups", async () => {
    const res = await client.send(new ListGroupsCommand({}));
    expect(res.Groups).toBeDefined();
    expect(res.Groups!.length).toBeGreaterThanOrEqual(1);
  });

  test("UpdateGroup", async () => {
    const res = await client.send(new UpdateGroupCommand({
      GroupName: "test-group",
      Description: "Updated description",
    }));
    expect(res.Group).toBeDefined();
    expect(res.Group!.Description).toBe("Updated description");
  });

  test("Tag", async () => {
    const res = await client.send(new TagCommand({
      Arn: groupArn,
      Tags: { team: "platform" },
    }));
    expect(res.Arn).toBe(groupArn);
  });

  test("GetTags", async () => {
    const res = await client.send(new GetTagsCommand({ Arn: groupArn }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!["team"]).toBe("platform");
  });

  test("Untag", async () => {
    await client.send(new UntagCommand({ Arn: groupArn, Keys: ["team"] }));
    const res = await client.send(new GetTagsCommand({ Arn: groupArn }));
    expect(res.Tags!["team"]).toBeUndefined();
  });

  test("DeleteGroup", async () => {
    const res = await client.send(new DeleteGroupCommand({ GroupName: "test-group" }));
    expect(res.Group).toBeDefined();
  });

  test("GetGroup - not found", async () => {
    await expect(
      client.send(new GetGroupCommand({ GroupName: "nonexistent" })),
    ).rejects.toThrow();
  });
});
