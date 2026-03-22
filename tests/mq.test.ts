import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  MqClient,
  CreateBrokerCommand,
  DescribeBrokerCommand,
  ListBrokersCommand,
  DeleteBrokerCommand,
  UpdateBrokerCommand,
  RebootBrokerCommand,
  CreateConfigurationCommand,
  DescribeConfigurationCommand,
  ListConfigurationsCommand,
  UpdateConfigurationCommand,
  CreateUserCommand,
  ListUsersCommand,
  DescribeUserCommand,
  DeleteUserCommand,
  CreateTagsCommand,
  ListTagsCommand,
} from "@aws-sdk/client-mq";
import { startServer, stopServer, clientConfig } from "./helpers";

const mq = new MqClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Amazon MQ", () => {
  let brokerId: string;

  test("CreateBroker", async () => {
    const res = await mq.send(
      new CreateBrokerCommand({
        BrokerName: "test-broker",
        EngineType: "ACTIVEMQ",
        EngineVersion: "5.17.6",
        HostInstanceType: "mq.t3.micro",
        DeploymentMode: "SINGLE_INSTANCE",
        AutoMinorVersionUpgrade: true,
        PubliclyAccessible: false,
        Users: [{ Username: "admin", Password: "admin123" }],
      }),
    );
    expect(res.BrokerId).toBeDefined();
    expect(res.BrokerArn).toContain("broker:");
    brokerId = res.BrokerId!;
  });

  test("DescribeBroker", async () => {
    const res = await mq.send(
      new DescribeBrokerCommand({ BrokerId: brokerId }),
    );
    expect(res.BrokerName).toBe("test-broker");
    expect(res.BrokerState).toBe("RUNNING");
    expect(res.EngineType).toBe("ACTIVEMQ");
    expect(res.EngineVersion).toBe("5.17.6");
  });

  test("ListBrokers", async () => {
    const res = await mq.send(new ListBrokersCommand({}));
    expect(res.BrokerSummaries!.length).toBeGreaterThanOrEqual(1);
    expect(res.BrokerSummaries!.some((b) => b.BrokerId === brokerId)).toBe(true);
  });

  test("UpdateBroker", async () => {
    await mq.send(
      new UpdateBrokerCommand({
        BrokerId: brokerId,
        AutoMinorVersionUpgrade: false,
      }),
    );
    const res = await mq.send(
      new DescribeBrokerCommand({ BrokerId: brokerId }),
    );
    expect(res.AutoMinorVersionUpgrade).toBe(false);
  });

  test("RebootBroker", async () => {
    await mq.send(new RebootBrokerCommand({ BrokerId: brokerId }));
    // No error means success
  });

  // --- Users ---

  test("CreateUser", async () => {
    await mq.send(
      new CreateUserCommand({
        BrokerId: brokerId,
        Username: "testuser",
        Password: "test1234",
        ConsoleAccess: true,
        Groups: ["dev"],
      }),
    );
    // No error means success
  });

  test("ListUsers", async () => {
    const res = await mq.send(
      new ListUsersCommand({ BrokerId: brokerId }),
    );
    expect(res.Users!.length).toBeGreaterThanOrEqual(2);
  });

  test("DescribeUser", async () => {
    const res = await mq.send(
      new DescribeUserCommand({ BrokerId: brokerId, Username: "testuser" }),
    );
    expect(res.Username).toBe("testuser");
    expect(res.ConsoleAccess).toBe(true);
  });

  test("DeleteUser", async () => {
    await mq.send(
      new DeleteUserCommand({ BrokerId: brokerId, Username: "testuser" }),
    );
    const res = await mq.send(
      new ListUsersCommand({ BrokerId: brokerId }),
    );
    expect(res.Users!.some((u) => u.Username === "testuser")).toBe(false);
  });

  // --- Configurations ---

  let configId: string;

  test("CreateConfiguration", async () => {
    const res = await mq.send(
      new CreateConfigurationCommand({
        Name: "test-config",
        EngineType: "ACTIVEMQ",
        EngineVersion: "5.17.6",
      }),
    );
    expect(res.Id).toBeDefined();
    expect(res.Name).toBe("test-config");
    configId = res.Id!;
  });

  test("DescribeConfiguration", async () => {
    const res = await mq.send(
      new DescribeConfigurationCommand({ ConfigurationId: configId }),
    );
    expect(res.Name).toBe("test-config");
    expect(res.EngineType).toBe("ACTIVEMQ");
  });

  test("ListConfigurations", async () => {
    const res = await mq.send(new ListConfigurationsCommand({}));
    expect(res.Configurations!.length).toBeGreaterThanOrEqual(1);
  });

  test("UpdateConfiguration", async () => {
    const res = await mq.send(
      new UpdateConfigurationCommand({
        ConfigurationId: configId,
        Data: btoa("<broker/>"),
        Description: "updated",
      }),
    );
    expect(res.LatestRevision?.Revision).toBe(2);
  });

  // --- Tags ---

  test("CreateTags", async () => {
    const broker = await mq.send(
      new DescribeBrokerCommand({ BrokerId: brokerId }),
    );
    await mq.send(
      new CreateTagsCommand({
        ResourceArn: broker.BrokerArn!,
        Tags: { env: "test" },
      }),
    );
    // No error means success
  });

  test("ListTags", async () => {
    const broker = await mq.send(
      new DescribeBrokerCommand({ BrokerId: brokerId }),
    );
    const res = await mq.send(
      new ListTagsCommand({ ResourceArn: broker.BrokerArn! }),
    );
    expect(res.Tags?.env).toBe("test");
  });

  // --- Cleanup ---

  test("DeleteBroker", async () => {
    await mq.send(new DeleteBrokerCommand({ BrokerId: brokerId }));
    const res = await mq.send(new ListBrokersCommand({}));
    expect(res.BrokerSummaries!.some((b) => b.BrokerId === brokerId)).toBe(false);
  });
});
