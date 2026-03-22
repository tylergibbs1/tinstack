import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ConnectClient,
  CreateInstanceCommand,
  DescribeInstanceCommand,
  ListInstancesCommand,
  DeleteInstanceCommand,
  CreateUserCommand,
  DescribeUserCommand,
  ListUsersCommand,
  DeleteUserCommand,
  CreateQueueCommand,
  ListQueuesCommand,
} from "@aws-sdk/client-connect";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ConnectClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Connect", () => {
  let instanceId: string;
  let userId: string;

  test("CreateInstance", async () => {
    const res = await client.send(new CreateInstanceCommand({
      IdentityManagementType: "CONNECT_MANAGED",
      InstanceAlias: "test-instance",
      InboundCallsEnabled: true,
      OutboundCallsEnabled: true,
    }));
    instanceId = res.Id!;
    expect(instanceId).toBeDefined();
    expect(res.Arn).toBeDefined();
  });

  test("DescribeInstance", async () => {
    const res = await client.send(new DescribeInstanceCommand({ InstanceId: instanceId }));
    expect(res.Instance).toBeDefined();
    expect(res.Instance!.Id).toBe(instanceId);
    expect(res.Instance!.InstanceStatus).toBe("ACTIVE");
    expect(res.Instance!.InstanceAlias).toBe("test-instance");
  });

  test("ListInstances", async () => {
    const res = await client.send(new ListInstancesCommand({}));
    expect(res.InstanceSummaryList).toBeDefined();
    expect(res.InstanceSummaryList!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateUser", async () => {
    const res = await client.send(new CreateUserCommand({
      InstanceId: instanceId,
      Username: "testuser",
      IdentityInfo: { FirstName: "Test", LastName: "User" },
      PhoneConfig: { PhoneType: "SOFT_PHONE" },
      SecurityProfileIds: ["sp-default"],
      RoutingProfileId: "rp-default",
    }));
    userId = res.UserId!;
    expect(userId).toBeDefined();
  });

  test("DescribeUser", async () => {
    const res = await client.send(new DescribeUserCommand({
      InstanceId: instanceId,
      UserId: userId,
    }));
    expect(res.User).toBeDefined();
    expect(res.User!.Username).toBe("testuser");
  });

  test("ListUsers", async () => {
    const res = await client.send(new ListUsersCommand({ InstanceId: instanceId }));
    expect(res.UserSummaryList).toBeDefined();
    expect(res.UserSummaryList!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateQueue", async () => {
    const res = await client.send(new CreateQueueCommand({
      InstanceId: instanceId,
      Name: "test-queue",
      Description: "A test queue",
    }));
    expect(res.QueueId).toBeDefined();
    expect(res.QueueArn).toBeDefined();
  });

  test("ListQueues", async () => {
    const res = await client.send(new ListQueuesCommand({ InstanceId: instanceId }));
    expect(res.QueueSummaryList).toBeDefined();
    expect(res.QueueSummaryList!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteUser", async () => {
    await client.send(new DeleteUserCommand({ InstanceId: instanceId, UserId: userId }));
    await expect(
      client.send(new DescribeUserCommand({ InstanceId: instanceId, UserId: userId })),
    ).rejects.toThrow();
  });

  test("DeleteInstance", async () => {
    await client.send(new DeleteInstanceCommand({ InstanceId: instanceId }));
    await expect(
      client.send(new DescribeInstanceCommand({ InstanceId: instanceId })),
    ).rejects.toThrow();
  });
});
