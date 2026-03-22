import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  DatabaseMigrationServiceClient,
  CreateReplicationInstanceCommand,
  DescribeReplicationInstancesCommand,
  DeleteReplicationInstanceCommand,
  CreateEndpointCommand,
  DescribeEndpointsCommand,
  DeleteEndpointCommand,
  ModifyEndpointCommand,
  CreateReplicationTaskCommand,
  DescribeReplicationTasksCommand,
  DeleteReplicationTaskCommand,
  StartReplicationTaskCommand,
  StopReplicationTaskCommand,
  TestConnectionCommand,
  DescribeConnectionsCommand,
  AddTagsToResourceCommand,
  ListTagsForResourceCommand,
  RemoveTagsFromResourceCommand,
} from "@aws-sdk/client-database-migration-service";
import { startServer, stopServer, clientConfig } from "./helpers";

const dms = new DatabaseMigrationServiceClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("DMS", () => {
  let instanceArn: string;
  let sourceEndpointArn: string;
  let targetEndpointArn: string;
  let taskArn: string;

  test("CreateReplicationInstance", async () => {
    const res = await dms.send(new CreateReplicationInstanceCommand({
      ReplicationInstanceIdentifier: "test-instance",
      ReplicationInstanceClass: "dms.t3.medium",
      AllocatedStorage: 100,
    }));
    instanceArn = res.ReplicationInstance!.ReplicationInstanceArn!;
    expect(instanceArn).toBeDefined();
    expect(res.ReplicationInstance!.ReplicationInstanceClass).toBe("dms.t3.medium");
    expect(res.ReplicationInstance!.ReplicationInstanceStatus).toBe("available");
    expect(res.ReplicationInstance!.AllocatedStorage).toBe(100);
  });

  test("DescribeReplicationInstances", async () => {
    const res = await dms.send(new DescribeReplicationInstancesCommand({}));
    expect(res.ReplicationInstances).toBeDefined();
    expect(res.ReplicationInstances!.length).toBeGreaterThanOrEqual(1);
    const found = res.ReplicationInstances!.find((i) => i.ReplicationInstanceArn === instanceArn);
    expect(found).toBeDefined();
    expect(found!.ReplicationInstanceIdentifier).toBe("test-instance");
  });

  test("CreateReplicationInstance - duplicate", async () => {
    await expect(
      dms.send(new CreateReplicationInstanceCommand({
        ReplicationInstanceIdentifier: "test-instance",
        ReplicationInstanceClass: "dms.t3.medium",
      })),
    ).rejects.toThrow();
  });

  test("CreateEndpoint - source", async () => {
    const res = await dms.send(new CreateEndpointCommand({
      EndpointIdentifier: "source-ep",
      EndpointType: "source",
      EngineName: "mysql",
      ServerName: "source-db.example.com",
      Port: 3306,
      DatabaseName: "mydb",
      Username: "admin",
    }));
    sourceEndpointArn = res.Endpoint!.EndpointArn!;
    expect(sourceEndpointArn).toBeDefined();
    expect(res.Endpoint!.EndpointType).toBe("SOURCE");
    expect(res.Endpoint!.EngineName).toBe("mysql");
  });

  test("CreateEndpoint - target", async () => {
    const res = await dms.send(new CreateEndpointCommand({
      EndpointIdentifier: "target-ep",
      EndpointType: "target",
      EngineName: "postgres",
      ServerName: "target-db.example.com",
      Port: 5432,
      DatabaseName: "targetdb",
      Username: "admin",
    }));
    targetEndpointArn = res.Endpoint!.EndpointArn!;
    expect(targetEndpointArn).toBeDefined();
    expect(res.Endpoint!.EndpointType).toBe("TARGET");
  });

  test("DescribeEndpoints", async () => {
    const res = await dms.send(new DescribeEndpointsCommand({}));
    expect(res.Endpoints!.length).toBeGreaterThanOrEqual(2);
  });

  test("ModifyEndpoint", async () => {
    const res = await dms.send(new ModifyEndpointCommand({
      EndpointArn: sourceEndpointArn,
      Port: 3307,
    }));
    expect(res.Endpoint!.Port).toBe(3307);
  });

  test("TestConnection", async () => {
    const res = await dms.send(new TestConnectionCommand({
      ReplicationInstanceArn: instanceArn,
      EndpointArn: sourceEndpointArn,
    }));
    expect(res.Connection).toBeDefined();
    expect(res.Connection!.Status).toBe("successful");
  });

  test("DescribeConnections", async () => {
    const res = await dms.send(new DescribeConnectionsCommand({}));
    expect(res.Connections).toBeDefined();
    expect(res.Connections!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateReplicationTask", async () => {
    const res = await dms.send(new CreateReplicationTaskCommand({
      ReplicationTaskIdentifier: "test-task",
      SourceEndpointArn: sourceEndpointArn,
      TargetEndpointArn: targetEndpointArn,
      ReplicationInstanceArn: instanceArn,
      MigrationType: "full-load",
      TableMappings: JSON.stringify({ rules: [{ "rule-type": "selection", "rule-id": "1", "rule-name": "1", "object-locator": { "schema-name": "%", "table-name": "%" }, "rule-action": "include" }] }),
    }));
    taskArn = res.ReplicationTask!.ReplicationTaskArn!;
    expect(taskArn).toBeDefined();
    expect(res.ReplicationTask!.MigrationType).toBe("full-load");
    expect(res.ReplicationTask!.Status).toBe("ready");
  });

  test("DescribeReplicationTasks", async () => {
    const res = await dms.send(new DescribeReplicationTasksCommand({}));
    expect(res.ReplicationTasks!.length).toBeGreaterThanOrEqual(1);
    const found = res.ReplicationTasks!.find((t) => t.ReplicationTaskArn === taskArn);
    expect(found).toBeDefined();
  });

  test("StartReplicationTask", async () => {
    const res = await dms.send(new StartReplicationTaskCommand({
      ReplicationTaskArn: taskArn,
      StartReplicationTaskType: "start-replication",
    }));
    expect(res.ReplicationTask!.Status).toBe("running");
  });

  test("StopReplicationTask", async () => {
    const res = await dms.send(new StopReplicationTaskCommand({
      ReplicationTaskArn: taskArn,
    }));
    expect(res.ReplicationTask!.Status).toBe("stopped");
  });

  test("StopReplicationTask - not running", async () => {
    await expect(
      dms.send(new StopReplicationTaskCommand({ ReplicationTaskArn: taskArn })),
    ).rejects.toThrow();
  });

  // --- Tags ---

  test("AddTagsToResource", async () => {
    await dms.send(new AddTagsToResourceCommand({
      ResourceArn: instanceArn,
      Tags: [{ Key: "env", Value: "test" }, { Key: "team", Value: "data" }],
    }));
  });

  test("ListTagsForResource", async () => {
    const res = await dms.send(new ListTagsForResourceCommand({
      ResourceArn: instanceArn,
    }));
    expect(res.TagList).toBeDefined();
    expect(res.TagList!.find((t) => t.Key === "env")?.Value).toBe("test");
  });

  test("RemoveTagsFromResource", async () => {
    await dms.send(new RemoveTagsFromResourceCommand({
      ResourceArn: instanceArn,
      TagKeys: ["team"],
    }));
    const res = await dms.send(new ListTagsForResourceCommand({ ResourceArn: instanceArn }));
    expect(res.TagList!.find((t) => t.Key === "team")).toBeUndefined();
    expect(res.TagList!.find((t) => t.Key === "env")).toBeDefined();
  });

  // --- Cleanup ---

  test("DeleteReplicationTask", async () => {
    const res = await dms.send(new DeleteReplicationTaskCommand({ ReplicationTaskArn: taskArn }));
    expect(res.ReplicationTask!.Status).toBe("deleting");
  });

  test("DeleteEndpoint - source", async () => {
    await dms.send(new DeleteEndpointCommand({ EndpointArn: sourceEndpointArn }));
    // verify
    const desc = await dms.send(new DescribeEndpointsCommand({}));
    expect(desc.Endpoints!.find((e) => e.EndpointArn === sourceEndpointArn)).toBeUndefined();
  });

  test("DeleteEndpoint - target", async () => {
    await dms.send(new DeleteEndpointCommand({ EndpointArn: targetEndpointArn }));
  });

  test("DeleteReplicationInstance", async () => {
    const res = await dms.send(new DeleteReplicationInstanceCommand({ ReplicationInstanceArn: instanceArn }));
    expect(res.ReplicationInstance!.ReplicationInstanceStatus).toBe("deleting");
  });

  test("DeleteReplicationInstance - not found", async () => {
    await expect(
      dms.send(new DeleteReplicationInstanceCommand({ ReplicationInstanceArn: "arn:aws:dms:us-east-1:000000000000:rep:nonexistent" })),
    ).rejects.toThrow();
  });
});
