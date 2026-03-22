import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  Macie2Client,
  EnableMacieCommand,
  GetMacieSessionCommand,
  DisableMacieCommand,
  CreateClassificationJobCommand,
  ListClassificationJobsCommand,
} from "@aws-sdk/client-macie2";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new Macie2Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Macie2", () => {
  test("EnableMacie", async () => {
    const res = await client.send(new EnableMacieCommand({}));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("GetMacieSession", async () => {
    const res = await client.send(new GetMacieSessionCommand({}));
    expect(res.status).toBe("ENABLED");
  });

  test("CreateClassificationJob + List", async () => {
    const res = await client.send(new CreateClassificationJobCommand({
      name: "test-job",
      jobType: "ONE_TIME",
      s3JobDefinition: { bucketDefinitions: [{ accountId: "123456789012", buckets: ["test-bucket"] }] },
      clientToken: "test-token",
    }));
    expect(res.jobId).toBeDefined();

    const list = await client.send(new ListClassificationJobsCommand({}));
    expect(list.items).toBeDefined();
    expect(list.items!.length).toBeGreaterThanOrEqual(1);
  });

  test("DisableMacie", async () => {
    await client.send(new DisableMacieCommand({}));
    try {
      await client.send(new GetMacieSessionCommand({}));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("not enabled");
    }
  });
});
