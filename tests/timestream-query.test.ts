import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  TimestreamQueryClient,
  QueryCommand,
  DescribeEndpointsCommand,
} from "@aws-sdk/client-timestream-query";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new TimestreamQueryClient({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Timestream Query", () => {
  test("DescribeEndpoints", async () => {
    const result = await client.send(new DescribeEndpointsCommand({}));
    expect(result.Endpoints).toBeDefined();
    expect(result.Endpoints!.length).toBeGreaterThan(0);
    expect(result.Endpoints![0].Address).toBeDefined();
  });

  test("Query — returns empty results", async () => {
    const result = await client.send(new QueryCommand({
      QueryString: "SELECT * FROM testdb.testtable",
    }));
    expect(result.QueryId).toBeDefined();
    expect(result.Rows).toBeDefined();
    expect(result.ColumnInfo).toBeDefined();
    expect(result.ColumnInfo!.length).toBeGreaterThan(0);
  });
});
