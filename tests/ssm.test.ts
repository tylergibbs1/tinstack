import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  DeleteParameterCommand,
  DescribeParametersCommand,
} from "@aws-sdk/client-ssm";
import { startServer, stopServer, clientConfig } from "./helpers";

const ssm = new SSMClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SSM Parameter Store", () => {
  test("PutParameter + GetParameter", async () => {
    await ssm.send(new PutParameterCommand({
      Name: "/app/db/host",
      Value: "localhost",
      Type: "String",
    }));

    const res = await ssm.send(new GetParameterCommand({ Name: "/app/db/host" }));
    expect(res.Parameter?.Value).toBe("localhost");
    expect(res.Parameter?.Version).toBe(1);
    expect(res.Parameter?.Type).toBe("String");
  });

  test("PutParameter overwrite", async () => {
    await ssm.send(new PutParameterCommand({
      Name: "/app/db/host",
      Value: "db.example.com",
      Type: "String",
      Overwrite: true,
    }));

    const res = await ssm.send(new GetParameterCommand({ Name: "/app/db/host" }));
    expect(res.Parameter?.Value).toBe("db.example.com");
    expect(res.Parameter?.Version).toBe(2);
  });

  test("PutParameter without overwrite fails", async () => {
    try {
      await ssm.send(new PutParameterCommand({
        Name: "/app/db/host",
        Value: "other",
        Type: "String",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ParameterAlreadyExists");
    }
  });

  test("GetParametersByPath", async () => {
    await ssm.send(new PutParameterCommand({ Name: "/app/db/port", Value: "5432", Type: "String" }));
    await ssm.send(new PutParameterCommand({ Name: "/app/db/name", Value: "mydb", Type: "String" }));

    const res = await ssm.send(new GetParametersByPathCommand({ Path: "/app/db" }));
    expect(res.Parameters?.length).toBeGreaterThanOrEqual(3);
  });

  test("DescribeParameters", async () => {
    const res = await ssm.send(new DescribeParametersCommand({}));
    expect(res.Parameters?.length).toBeGreaterThan(0);
  });

  test("DeleteParameter", async () => {
    await ssm.send(new DeleteParameterCommand({ Name: "/app/db/port" }));
    try {
      await ssm.send(new GetParameterCommand({ Name: "/app/db/port" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ParameterNotFound");
    }
  });
});
