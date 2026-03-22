import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  KinesisAnalyticsV2Client,
  CreateApplicationCommand,
  DescribeApplicationCommand,
  ListApplicationsCommand,
  DeleteApplicationCommand,
  StartApplicationCommand,
  StopApplicationCommand,
} from "@aws-sdk/client-kinesis-analytics-v2";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new KinesisAnalyticsV2Client({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Kinesis Analytics v2", () => {
  const appName = "test-kda-app-" + Date.now();

  test("CreateApplication", async () => {
    const result = await client.send(new CreateApplicationCommand({
      ApplicationName: appName,
      RuntimeEnvironment: "FLINK-1_15",
      ServiceExecutionRole: "arn:aws:iam::000000000000:role/kda-role",
    }));
    expect(result.ApplicationDetail?.ApplicationName).toBe(appName);
    expect(result.ApplicationDetail?.ApplicationStatus).toBe("READY");
    expect(result.ApplicationDetail?.RuntimeEnvironment).toBe("FLINK-1_15");
  });

  test("CreateApplication — duplicate throws", async () => {
    try {
      await client.send(new CreateApplicationCommand({
        ApplicationName: appName,
        RuntimeEnvironment: "FLINK-1_15",
        ServiceExecutionRole: "arn:aws:iam::000000000000:role/kda-role",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceInUseException");
    }
  });

  test("DescribeApplication", async () => {
    const result = await client.send(new DescribeApplicationCommand({ ApplicationName: appName }));
    expect(result.ApplicationDetail?.ApplicationName).toBe(appName);
    expect(result.ApplicationDetail?.ApplicationVersionId).toBe(1);
  });

  test("ListApplications", async () => {
    const result = await client.send(new ListApplicationsCommand({}));
    expect(result.ApplicationSummaries?.some((a) => a.ApplicationName === appName)).toBe(true);
  });

  test("StartApplication", async () => {
    await client.send(new StartApplicationCommand({ ApplicationName: appName }));
    const result = await client.send(new DescribeApplicationCommand({ ApplicationName: appName }));
    expect(result.ApplicationDetail?.ApplicationStatus).toBe("RUNNING");
  });

  test("StopApplication", async () => {
    await client.send(new StopApplicationCommand({ ApplicationName: appName }));
    const result = await client.send(new DescribeApplicationCommand({ ApplicationName: appName }));
    expect(result.ApplicationDetail?.ApplicationStatus).toBe("READY");
  });

  test("DeleteApplication", async () => {
    await client.send(new DeleteApplicationCommand({
      ApplicationName: appName,
      CreateTimestamp: new Date(),
    }));
    try {
      await client.send(new DescribeApplicationCommand({ ApplicationName: appName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });
});
