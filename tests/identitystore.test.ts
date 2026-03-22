import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  IdentitystoreClient,
  CreateUserCommand,
  DescribeUserCommand,
  ListUsersCommand,
  DeleteUserCommand,
  CreateGroupCommand,
  ListGroupsCommand,
} from "@aws-sdk/client-identitystore";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new IdentitystoreClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("IdentityStore", () => {
  const identityStoreId = "d-1234567890";
  let userId: string;

  test("CreateUser", async () => {
    const res = await client.send(new CreateUserCommand({
      IdentityStoreId: identityStoreId,
      UserName: "testuser",
      DisplayName: "Test User",
      Name: { FamilyName: "User", GivenName: "Test" },
    }));
    expect(res.UserId).toBeDefined();
    expect(res.IdentityStoreId).toBe(identityStoreId);
    userId = res.UserId!;
  });

  test("DescribeUser", async () => {
    const res = await client.send(new DescribeUserCommand({
      IdentityStoreId: identityStoreId,
      UserId: userId,
    }));
    expect(res.UserName).toBe("testuser");
    expect(res.DisplayName).toBe("Test User");
  });

  test("ListUsers", async () => {
    const res = await client.send(new ListUsersCommand({ IdentityStoreId: identityStoreId }));
    expect(res.Users).toBeDefined();
    expect(res.Users!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateGroup + ListGroups", async () => {
    const res = await client.send(new CreateGroupCommand({
      IdentityStoreId: identityStoreId,
      DisplayName: "Test Group",
      Description: "A test group",
    }));
    expect(res.GroupId).toBeDefined();

    const list = await client.send(new ListGroupsCommand({ IdentityStoreId: identityStoreId }));
    expect(list.Groups!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteUser", async () => {
    await client.send(new DeleteUserCommand({
      IdentityStoreId: identityStoreId,
      UserId: userId,
    }));
    const res = await client.send(new ListUsersCommand({ IdentityStoreId: identityStoreId }));
    expect(res.Users!.some(u => u.UserId === userId)).toBe(false);
  });
});
