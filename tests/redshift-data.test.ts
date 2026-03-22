import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  RedshiftDataClient,
  ExecuteStatementCommand,
  DescribeStatementCommand,
  GetStatementResultCommand,
  ListStatementsCommand,
  ListDatabasesCommand,
} from "@aws-sdk/client-redshift-data";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new RedshiftDataClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Redshift Data", () => {
  let statementId: string;

  test("ExecuteStatement", async () => {
    const res = await client.send(new ExecuteStatementCommand({
      ClusterIdentifier: "test-cluster",
      Database: "dev",
      Sql: "SELECT 1",
    }));
    statementId = res.Id!;
    expect(statementId).toBeDefined();
  });

  test("DescribeStatement", async () => {
    const res = await client.send(new DescribeStatementCommand({ Id: statementId }));
    expect(res.Status).toBe("FINISHED");
  });

  test("GetStatementResult", async () => {
    const res = await client.send(new GetStatementResultCommand({ Id: statementId }));
    expect(res.TotalNumRows).toBe(1);
  });

  test("ListStatements", async () => {
    const res = await client.send(new ListStatementsCommand({}));
    expect(res.Statements!.length).toBeGreaterThanOrEqual(1);
  });

  test("ListDatabases", async () => {
    const res = await client.send(new ListDatabasesCommand({
      ClusterIdentifier: "test-cluster",
      Database: "dev",
    }));
    expect(res.Databases!.length).toBeGreaterThanOrEqual(1);
  });
});
