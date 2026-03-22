import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  EMRServerlessClient,
  CreateApplicationCommand,
  GetApplicationCommand,
  ListApplicationsCommand,
  DeleteApplicationCommand,
  StartApplicationCommand,
  StopApplicationCommand,
  StartJobRunCommand,
  GetJobRunCommand,
  ListJobRunsCommand,
  CancelJobRunCommand,
} from "@aws-sdk/client-emr-serverless";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new EMRServerlessClient({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("EMR Serverless", () => {
  let applicationId: string;
  let jobRunId: string;

  test("CreateApplication", async () => {
    const result = await client.send(new CreateApplicationCommand({
      name: "test-emr-app",
      releaseLabel: "emr-6.9.0",
      type: "SPARK",
    }));
    expect(result.applicationId).toBeDefined();
    expect(result.name).toBe("test-emr-app");
    applicationId = result.applicationId!;
  });

  test("GetApplication", async () => {
    const result = await client.send(new GetApplicationCommand({ applicationId }));
    expect(result.application?.name).toBe("test-emr-app");
    expect(result.application?.state).toBe("CREATED");
    expect(result.application?.type).toBe("SPARK");
  });

  test("ListApplications", async () => {
    const result = await client.send(new ListApplicationsCommand({}));
    expect(result.applications).toBeDefined();
    expect(result.applications!.length).toBeGreaterThanOrEqual(1);
  });

  test("StartApplication", async () => {
    await client.send(new StartApplicationCommand({ applicationId }));
    const result = await client.send(new GetApplicationCommand({ applicationId }));
    expect(result.application?.state).toBe("STARTED");
  });

  test("StopApplication", async () => {
    await client.send(new StopApplicationCommand({ applicationId }));
    const result = await client.send(new GetApplicationCommand({ applicationId }));
    expect(result.application?.state).toBe("STOPPED");
  });

  test("StartJobRun", async () => {
    const result = await client.send(new StartJobRunCommand({
      applicationId,
      executionRoleArn: "arn:aws:iam::000000000000:role/emr-role",
      jobDriver: { sparkSubmit: { entryPoint: "s3://bucket/script.py" } },
    }));
    expect(result.jobRunId).toBeDefined();
    expect(result.applicationId).toBe(applicationId);
    jobRunId = result.jobRunId!;
  });

  test("GetJobRun", async () => {
    const result = await client.send(new GetJobRunCommand({ applicationId, jobRunId }));
    expect(result.jobRun?.jobRunId).toBe(jobRunId);
    expect(result.jobRun?.state).toBe("SUCCESS");
  });

  test("ListJobRuns", async () => {
    const result = await client.send(new ListJobRunsCommand({ applicationId }));
    expect(result.jobRuns?.some((r) => r.id === jobRunId)).toBe(true);
  });

  test("CancelJobRun", async () => {
    // Create a new run to cancel
    const newRun = await client.send(new StartJobRunCommand({
      applicationId,
      executionRoleArn: "arn:aws:iam::000000000000:role/emr-role",
      jobDriver: { sparkSubmit: { entryPoint: "s3://bucket/script2.py" } },
    }));
    await client.send(new CancelJobRunCommand({ applicationId, jobRunId: newRun.jobRunId! }));
    const result = await client.send(new GetJobRunCommand({ applicationId, jobRunId: newRun.jobRunId! }));
    expect(result.jobRun?.state).toBe("CANCELLED");
  });

  test("DeleteApplication", async () => {
    await client.send(new DeleteApplicationCommand({ applicationId }));
    try {
      await client.send(new GetApplicationCommand({ applicationId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });
});
