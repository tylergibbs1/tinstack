import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  TransferClient,
  CreateServerCommand,
  DescribeServerCommand,
  ListServersCommand,
  UpdateServerCommand,
  DeleteServerCommand,
  StartServerCommand,
  StopServerCommand,
  CreateUserCommand,
  DescribeUserCommand,
  ListUsersCommand,
  UpdateUserCommand,
  DeleteUserCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-transfer";
import { startServer, stopServer, clientConfig } from "./helpers";

const transfer = new TransferClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Transfer Family", () => {
  let serverId: string;
  let serverArn: string;

  // --- Servers ---

  test("CreateServer", async () => {
    const res = await transfer.send(
      new CreateServerCommand({
        EndpointType: "PUBLIC",
        IdentityProviderType: "SERVICE_MANAGED",
        Protocols: ["SFTP"],
        Tags: [{ Key: "env", Value: "test" }],
      }),
    );
    expect(res.ServerId).toBeDefined();
    serverId = res.ServerId!;
  });

  test("DescribeServer", async () => {
    const res = await transfer.send(
      new DescribeServerCommand({ ServerId: serverId }),
    );
    expect(res.Server?.ServerId).toBe(serverId);
    expect(res.Server?.State).toBe("ONLINE");
    expect(res.Server?.EndpointType).toBe("PUBLIC");
    expect(res.Server?.IdentityProviderType).toBe("SERVICE_MANAGED");
    expect(res.Server?.Protocols).toContain("SFTP");
    serverArn = res.Server!.Arn!;
  });

  test("ListServers", async () => {
    const res = await transfer.send(new ListServersCommand({}));
    expect(res.Servers!.length).toBeGreaterThanOrEqual(1);
    expect(res.Servers!.some((s) => s.ServerId === serverId)).toBe(true);
  });

  test("UpdateServer", async () => {
    await transfer.send(
      new UpdateServerCommand({
        ServerId: serverId,
        Protocols: ["SFTP", "FTPS"],
      }),
    );
    const res = await transfer.send(
      new DescribeServerCommand({ ServerId: serverId }),
    );
    expect(res.Server?.Protocols).toContain("FTPS");
  });

  test("StopServer", async () => {
    await transfer.send(new StopServerCommand({ ServerId: serverId }));
    const res = await transfer.send(
      new DescribeServerCommand({ ServerId: serverId }),
    );
    expect(res.Server?.State).toBe("OFFLINE");
  });

  test("StartServer", async () => {
    await transfer.send(new StartServerCommand({ ServerId: serverId }));
    const res = await transfer.send(
      new DescribeServerCommand({ ServerId: serverId }),
    );
    expect(res.Server?.State).toBe("ONLINE");
  });

  // --- Users ---

  test("CreateUser", async () => {
    const res = await transfer.send(
      new CreateUserCommand({
        ServerId: serverId,
        UserName: "testuser",
        Role: "arn:aws:iam::000000000000:role/transfer-role",
        HomeDirectory: "/bucket/home",
      }),
    );
    expect(res.ServerId).toBe(serverId);
    expect(res.UserName).toBe("testuser");
  });

  test("DescribeUser", async () => {
    const res = await transfer.send(
      new DescribeUserCommand({ ServerId: serverId, UserName: "testuser" }),
    );
    expect(res.User?.UserName).toBe("testuser");
    expect(res.User?.HomeDirectory).toBe("/bucket/home");
    expect(res.User?.Role).toContain("transfer-role");
  });

  test("ListUsers", async () => {
    const res = await transfer.send(
      new ListUsersCommand({ ServerId: serverId }),
    );
    expect(res.Users!.length).toBeGreaterThanOrEqual(1);
    expect(res.Users!.some((u) => u.UserName === "testuser")).toBe(true);
  });

  test("UpdateUser", async () => {
    await transfer.send(
      new UpdateUserCommand({
        ServerId: serverId,
        UserName: "testuser",
        HomeDirectory: "/bucket/new-home",
      }),
    );
    const res = await transfer.send(
      new DescribeUserCommand({ ServerId: serverId, UserName: "testuser" }),
    );
    expect(res.User?.HomeDirectory).toBe("/bucket/new-home");
  });

  test("DeleteUser", async () => {
    await transfer.send(
      new DeleteUserCommand({ ServerId: serverId, UserName: "testuser" }),
    );
    const res = await transfer.send(
      new ListUsersCommand({ ServerId: serverId }),
    );
    expect(res.Users!.some((u) => u.UserName === "testuser")).toBe(false);
  });

  // --- Tags ---

  test("TagResource", async () => {
    await transfer.send(
      new TagResourceCommand({
        Arn: serverArn,
        Tags: [{ Key: "team", Value: "infra" }],
      }),
    );
  });

  test("ListTagsForResource", async () => {
    const res = await transfer.send(
      new ListTagsForResourceCommand({ Arn: serverArn }),
    );
    expect(res.Tags!.some((t) => t.Key === "team" && t.Value === "infra")).toBe(true);
  });

  test("UntagResource", async () => {
    await transfer.send(
      new UntagResourceCommand({
        Arn: serverArn,
        TagKeys: ["team"],
      }),
    );
    const res = await transfer.send(
      new ListTagsForResourceCommand({ Arn: serverArn }),
    );
    expect(res.Tags!.some((t) => t.Key === "team")).toBe(false);
  });

  // --- Cleanup ---

  test("DeleteServer", async () => {
    await transfer.send(new DeleteServerCommand({ ServerId: serverId }));
    const res = await transfer.send(new ListServersCommand({}));
    expect(res.Servers!.some((s) => s.ServerId === serverId)).toBe(false);
  });
});
