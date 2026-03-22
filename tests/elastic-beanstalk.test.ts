import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ElasticBeanstalkClient,
  CreateApplicationCommand,
  DescribeApplicationsCommand,
  DeleteApplicationCommand,
  CreateApplicationVersionCommand,
  DescribeApplicationVersionsCommand,
  CreateEnvironmentCommand,
  DescribeEnvironmentsCommand,
  TerminateEnvironmentCommand,
  UpdateEnvironmentCommand,
} from "@aws-sdk/client-elastic-beanstalk";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ElasticBeanstalkClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Elastic Beanstalk", () => {
  const appName = "test-app";
  let envId: string;

  test("CreateApplication", async () => {
    const res = await client.send(new CreateApplicationCommand({
      ApplicationName: appName,
      Description: "A test app",
    }));
    expect(res.Application).toBeDefined();
    expect(res.Application!.ApplicationName).toBe(appName);
  });

  test("DescribeApplications", async () => {
    const res = await client.send(new DescribeApplicationsCommand({}));
    expect(res.Applications).toBeDefined();
    const found = res.Applications!.find((a) => a.ApplicationName === appName);
    expect(found).toBeDefined();
  });

  test("CreateApplicationVersion", async () => {
    const res = await client.send(new CreateApplicationVersionCommand({
      ApplicationName: appName,
      VersionLabel: "v1",
      Description: "First version",
    }));
    expect(res.ApplicationVersion).toBeDefined();
    expect(res.ApplicationVersion!.VersionLabel).toBe("v1");
  });

  test("DescribeApplicationVersions", async () => {
    const res = await client.send(new DescribeApplicationVersionsCommand({
      ApplicationName: appName,
    }));
    expect(res.ApplicationVersions).toBeDefined();
    expect(res.ApplicationVersions!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateEnvironment", async () => {
    const res = await client.send(new CreateEnvironmentCommand({
      ApplicationName: appName,
      EnvironmentName: "test-env",
      VersionLabel: "v1",
    }));
    envId = res.EnvironmentId!;
    expect(envId).toBeDefined();
    expect(res.EnvironmentName).toBe("test-env");
    expect(res.Status).toBe("Ready");
  });

  test("DescribeEnvironments", async () => {
    const res = await client.send(new DescribeEnvironmentsCommand({ ApplicationName: appName }));
    expect(res.Environments).toBeDefined();
    expect(res.Environments!.length).toBeGreaterThanOrEqual(1);
  });

  test("UpdateEnvironment", async () => {
    const res = await client.send(new UpdateEnvironmentCommand({
      EnvironmentId: envId,
      VersionLabel: "v1",
    }));
    expect(res.EnvironmentId).toBe(envId);
  });

  test("TerminateEnvironment", async () => {
    const res = await client.send(new TerminateEnvironmentCommand({ EnvironmentId: envId }));
    expect(res.Status).toBe("Terminated");
  });

  test("DeleteApplication", async () => {
    await client.send(new DeleteApplicationCommand({ ApplicationName: appName }));
    const res = await client.send(new DescribeApplicationsCommand({
      ApplicationNames: [appName],
    }));
    expect(res.Applications!.find((a) => a.ApplicationName === appName)).toBeUndefined();
  });
});
