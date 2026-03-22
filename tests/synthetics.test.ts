import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SyntheticsClient,
  CreateCanaryCommand,
  GetCanaryCommand,
  DescribeCanariesCommand,
  UpdateCanaryCommand,
  DeleteCanaryCommand,
  StartCanaryCommand,
  StopCanaryCommand,
  DescribeCanariesLastRunCommand,
} from "@aws-sdk/client-synthetics";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new SyntheticsClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Synthetics", () => {
  let canaryArn: string;
  const canaryName = "test-canary";

  test("CreateCanary", async () => {
    const res = await client.send(new CreateCanaryCommand({
      Name: canaryName,
      Code: { Handler: "index.handler", S3Bucket: "my-bucket", S3Key: "canary.zip" },
      ArtifactS3Location: "s3://my-bucket/artifacts",
      ExecutionRoleArn: "arn:aws:iam::000000000000:role/canary-role",
      RuntimeVersion: "syn-nodejs-puppeteer-6.2",
      Schedule: { Expression: "rate(5 minutes)" },
      RunConfig: { TimeoutInSeconds: 60 },
    }));
    expect(res.Canary).toBeDefined();
    expect(res.Canary!.Name).toBe(canaryName);
    expect(res.Canary!.Status?.State).toBe("READY");
    canaryArn = res.Canary!.Arn!;
  });

  test("GetCanary", async () => {
    const res = await client.send(new GetCanaryCommand({ Name: canaryName }));
    expect(res.Canary).toBeDefined();
    expect(res.Canary!.Name).toBe(canaryName);
    expect(res.Canary!.RuntimeVersion).toBe("syn-nodejs-puppeteer-6.2");
    expect(res.Canary!.ExecutionRoleArn).toBe("arn:aws:iam::000000000000:role/canary-role");
  });

  test("DescribeCanaries", async () => {
    const res = await client.send(new DescribeCanariesCommand({}));
    expect(res.Canaries).toBeDefined();
    const found = res.Canaries!.find((c) => c.Name === canaryName);
    expect(found).toBeDefined();
  });

  test("UpdateCanary", async () => {
    await client.send(new UpdateCanaryCommand({
      Name: canaryName,
      RuntimeVersion: "syn-nodejs-puppeteer-7.0",
    }));

    const res = await client.send(new GetCanaryCommand({ Name: canaryName }));
    expect(res.Canary!.RuntimeVersion).toBe("syn-nodejs-puppeteer-7.0");
  });

  test("StartCanary", async () => {
    await client.send(new StartCanaryCommand({ Name: canaryName }));
    const res = await client.send(new GetCanaryCommand({ Name: canaryName }));
    expect(res.Canary!.Status?.State).toBe("RUNNING");
  });

  test("DescribeCanariesLastRun", async () => {
    const res = await client.send(new DescribeCanariesLastRunCommand({}));
    expect(res.CanariesLastRun).toBeDefined();
    const found = res.CanariesLastRun!.find((r) => r.CanaryName === canaryName);
    expect(found).toBeDefined();
    expect(found!.LastRun).toBeDefined();
  });

  test("StopCanary", async () => {
    await client.send(new StopCanaryCommand({ Name: canaryName }));
    const res = await client.send(new GetCanaryCommand({ Name: canaryName }));
    expect(res.Canary!.Status?.State).toBe("STOPPED");
  });

  test("CreateCanary with tags and verify tags on GetCanary", async () => {
    await client.send(new CreateCanaryCommand({
      Name: "tagged-canary",
      Code: { Handler: "index.handler" },
      ArtifactS3Location: "s3://my-bucket/artifacts",
      ExecutionRoleArn: "arn:aws:iam::000000000000:role/canary-role",
      RuntimeVersion: "syn-nodejs-puppeteer-6.2",
      Schedule: { Expression: "rate(10 minutes)" },
      RunConfig: { TimeoutInSeconds: 60 },
      Tags: { env: "test", team: "platform" },
    }));

    const res = await client.send(new GetCanaryCommand({ Name: "tagged-canary" }));
    expect(res.Canary!.Tags).toBeDefined();
    expect(res.Canary!.Tags!["env"]).toBe("test");
    expect(res.Canary!.Tags!["team"]).toBe("platform");

    // cleanup
    await client.send(new DeleteCanaryCommand({ Name: "tagged-canary" }));
  });

  test("DeleteCanary", async () => {
    await client.send(new DeleteCanaryCommand({ Name: canaryName }));
    await expect(
      client.send(new GetCanaryCommand({ Name: canaryName })),
    ).rejects.toThrow();
  });

  test("CreateCanary - duplicate", async () => {
    await client.send(new CreateCanaryCommand({
      Name: "dup-canary",
      Code: { Handler: "index.handler" },
      ArtifactS3Location: "s3://my-bucket/artifacts",
      ExecutionRoleArn: "arn:aws:iam::000000000000:role/canary-role",
      RuntimeVersion: "syn-nodejs-puppeteer-6.2",
      Schedule: { Expression: "rate(5 minutes)" },
      RunConfig: { TimeoutInSeconds: 60 },
    }));

    await expect(
      client.send(new CreateCanaryCommand({
        Name: "dup-canary",
        Code: { Handler: "index.handler" },
        ArtifactS3Location: "s3://my-bucket/artifacts",
        ExecutionRoleArn: "arn:aws:iam::000000000000:role/canary-role",
        RuntimeVersion: "syn-nodejs-puppeteer-6.2",
        Schedule: { Expression: "rate(5 minutes)" },
        RunConfig: { TimeoutInSeconds: 60 },
      })),
    ).rejects.toThrow();

    // cleanup
    await client.send(new DeleteCanaryCommand({ Name: "dup-canary" }));
  });
});
