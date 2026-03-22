import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  S3TablesClient,
  CreateTableBucketCommand,
  GetTableBucketCommand,
  ListTableBucketsCommand,
  DeleteTableBucketCommand,
  CreateTableCommand,
  GetTableCommand,
  ListTablesCommand,
} from "@aws-sdk/client-s3tables";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new S3TablesClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("S3Tables", () => {
  let tableBucketArn: string;

  test("CreateTableBucket", async () => {
    const res = await client.send(new CreateTableBucketCommand({ name: "test-table-bucket" }));
    expect(res.arn).toBeDefined();
    tableBucketArn = res.arn!;
  });

  test("GetTableBucket", async () => {
    const res = await client.send(new GetTableBucketCommand({ tableBucketARN: tableBucketArn }));
    expect(res.name).toBe("test-table-bucket");
  });

  test("ListTableBuckets", async () => {
    const res = await client.send(new ListTableBucketsCommand({}));
    expect(res.tableBuckets).toBeDefined();
    expect(res.tableBuckets!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateTable + GetTable + ListTables", async () => {
    const res = await client.send(new CreateTableCommand({
      tableBucketARN: tableBucketArn,
      namespace: "default",
      name: "test-table",
      format: "ICEBERG",
    }));
    expect(res.tableARN).toBeDefined();

    const get = await client.send(new GetTableCommand({
      tableBucketARN: tableBucketArn,
      namespace: "default",
      name: "test-table",
    }));
    expect(get.name).toBe("test-table");

    const list = await client.send(new ListTablesCommand({ tableBucketARN: tableBucketArn }));
    expect(list.tables!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteTableBucket", async () => {
    await client.send(new DeleteTableBucketCommand({ tableBucketARN: tableBucketArn }));
    const res = await client.send(new ListTableBucketsCommand({}));
    expect(res.tableBuckets!.some((b: any) => b.arn === tableBucketArn)).toBe(false);
  });
});
