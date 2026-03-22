import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  TimestreamInfluxDBClient,
  CreateDbInstanceCommand,
  GetDbInstanceCommand,
  ListDbInstancesCommand,
  DeleteDbInstanceCommand,
  CreateDbParameterGroupCommand,
} from "@aws-sdk/client-timestream-influxdb";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new TimestreamInfluxDBClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Timestream InfluxDB", () => {
  let dbInstanceId: string;

  test("CreateDbInstance", async () => {
    const res = await client.send(new CreateDbInstanceCommand({
      name: "test-instance",
      dbInstanceType: "db.influx.medium" as any,
      vpcSubnetIds: ["subnet-1"],
      allocatedStorage: 20,
      password: "testpassword123",
      vpcSecurityGroupIds: ["sg-1"],
      dbStorageType: "InfluxIOIncludedT1" as any,
    }));
    dbInstanceId = res.id!;
    expect(dbInstanceId).toBeDefined();
    expect(res.name).toBe("test-instance");
  });

  test("GetDbInstance", async () => {
    const res = await client.send(new GetDbInstanceCommand({ identifier: dbInstanceId }));
    expect(res.name).toBe("test-instance");
    expect(res.status).toBe("AVAILABLE");
  });

  test("ListDbInstances", async () => {
    const res = await client.send(new ListDbInstancesCommand({}));
    expect(res.items!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateDbParameterGroup", async () => {
    const res = await client.send(new CreateDbParameterGroupCommand({
      name: "test-param-group",
      description: "test",
    }));
    expect(res.id).toBeDefined();
  });

  test("DeleteDbInstance", async () => {
    const res = await client.send(new DeleteDbInstanceCommand({ identifier: dbInstanceId }));
    expect(res.status).toBe("DELETING");
  });
});
