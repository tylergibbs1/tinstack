import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
} from "@aws-sdk/client-rds-data";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const client = new RDSDataClient({
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("RDS Data", () => {
  let transactionId: string;

  test("ExecuteStatement", async () => {
    const res = await client.send(new ExecuteStatementCommand({
      resourceArn: "arn:aws:rds:us-east-1:000000000000:cluster:test",
      secretArn: "arn:aws:secretsmanager:us-east-1:000000000000:secret:test",
      sql: "SELECT 1",
    }));
    expect(res.records).toBeDefined();
  });

  test("BeginTransaction", async () => {
    const res = await client.send(new BeginTransactionCommand({
      resourceArn: "arn:aws:rds:us-east-1:000000000000:cluster:test",
      secretArn: "arn:aws:secretsmanager:us-east-1:000000000000:secret:test",
    }));
    transactionId = res.transactionId!;
    expect(transactionId).toBeDefined();
  });

  test("CommitTransaction", async () => {
    const res = await client.send(new CommitTransactionCommand({
      resourceArn: "arn:aws:rds:us-east-1:000000000000:cluster:test",
      secretArn: "arn:aws:secretsmanager:us-east-1:000000000000:secret:test",
      transactionId,
    }));
    expect(res.transactionStatus).toBe("Transaction Committed");
  });
});
