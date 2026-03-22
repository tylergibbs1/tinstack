import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CloudDirectoryClient,
  CreateSchemaCommand,
  ListDevelopmentSchemaArnsCommand,
} from "@aws-sdk/client-clouddirectory";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new CloudDirectoryClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Cloud Directory", () => {
  test("CreateSchema", async () => {
    const res = await client.send(new CreateSchemaCommand({ Name: "test-schema" }));
    expect(res.SchemaArn).toContain("test-schema");
  });

  test("ListDevelopmentSchemaArns", async () => {
    const res = await client.send(new ListDevelopmentSchemaArnsCommand({}));
    expect(res.SchemaArns!.length).toBeGreaterThanOrEqual(1);
  });
});
