import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  TimestreamWriteClient,
  CreateDatabaseCommand,
  DescribeDatabaseCommand,
  ListDatabasesCommand,
  DeleteDatabaseCommand,
  CreateTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
  DeleteTableCommand,
  WriteRecordsCommand,
} from "@aws-sdk/client-timestream-write";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new TimestreamWriteClient({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Timestream Write", () => {
  const dbName = "test-ts-db-" + Date.now();
  const tableName = "test-ts-table-" + Date.now();

  test("CreateDatabase", async () => {
    const result = await client.send(new CreateDatabaseCommand({ DatabaseName: dbName }));
    expect(result.Database?.DatabaseName).toBe(dbName);
    expect(result.Database?.Arn).toContain("timestream");
  });

  test("CreateDatabase — duplicate throws ConflictException", async () => {
    try {
      await client.send(new CreateDatabaseCommand({ DatabaseName: dbName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ConflictException");
    }
  });

  test("DescribeDatabase", async () => {
    const result = await client.send(new DescribeDatabaseCommand({ DatabaseName: dbName }));
    expect(result.Database?.DatabaseName).toBe(dbName);
    expect(result.Database?.TableCount).toBe(0);
  });

  test("ListDatabases", async () => {
    const result = await client.send(new ListDatabasesCommand({}));
    expect(result.Databases?.some((d) => d.DatabaseName === dbName)).toBe(true);
  });

  test("CreateTable", async () => {
    const result = await client.send(new CreateTableCommand({
      DatabaseName: dbName,
      TableName: tableName,
      RetentionProperties: { MemoryStoreRetentionPeriodInHours: 24, MagneticStoreRetentionPeriodInDays: 365 },
    }));
    expect(result.Table?.TableName).toBe(tableName);
    expect(result.Table?.DatabaseName).toBe(dbName);
    expect(result.Table?.TableStatus).toBe("ACTIVE");
  });

  test("DescribeTable", async () => {
    const result = await client.send(new DescribeTableCommand({ DatabaseName: dbName, TableName: tableName }));
    expect(result.Table?.TableName).toBe(tableName);
  });

  test("ListTables", async () => {
    const result = await client.send(new ListTablesCommand({ DatabaseName: dbName }));
    expect(result.Tables?.some((t) => t.TableName === tableName)).toBe(true);
  });

  test("WriteRecords", async () => {
    const result = await client.send(new WriteRecordsCommand({
      DatabaseName: dbName,
      TableName: tableName,
      Records: [
        { Dimensions: [{ Name: "host", Value: "server1" }], MeasureName: "cpu", MeasureValue: "42.5", MeasureValueType: "DOUBLE", Time: String(Date.now()) },
      ],
    }));
    expect(result.RecordsIngested?.Total).toBe(1);
  });

  test("DeleteTable", async () => {
    await client.send(new DeleteTableCommand({ DatabaseName: dbName, TableName: tableName }));
    try {
      await client.send(new DescribeTableCommand({ DatabaseName: dbName, TableName: tableName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("DeleteDatabase", async () => {
    await client.send(new DeleteDatabaseCommand({ DatabaseName: dbName }));
    try {
      await client.send(new DescribeDatabaseCommand({ DatabaseName: dbName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });
});
