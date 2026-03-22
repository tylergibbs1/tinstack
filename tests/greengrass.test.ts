import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  GreengrassClient,
  CreateGroupCommand,
  GetGroupCommand,
  ListGroupsCommand,
  DeleteGroupCommand,
  CreateCoreDefinitionCommand,
  ListCoreDefinitionsCommand,
} from "@aws-sdk/client-greengrass";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const client = new GreengrassClient({
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Greengrass", () => {
  let groupId: string;

  test("CreateGroup", async () => {
    const res = await client.send(new CreateGroupCommand({ Name: "test-group" }));
    groupId = res.Id!;
    expect(groupId).toBeDefined();
    expect(res.Name).toBe("test-group");
  });

  test("GetGroup", async () => {
    const res = await client.send(new GetGroupCommand({ GroupId: groupId }));
    expect(res.Name).toBe("test-group");
  });

  test("ListGroups", async () => {
    const res = await client.send(new ListGroupsCommand({}));
    expect(res.Groups!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateCoreDefinition", async () => {
    const res = await client.send(new CreateCoreDefinitionCommand({ Name: "test-core-def" }));
    expect(res.Id).toBeDefined();
  });

  test("DeleteGroup", async () => {
    const res = await client.send(new DeleteGroupCommand({ GroupId: groupId }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });
});
