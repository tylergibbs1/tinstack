import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SignerClient,
  PutSigningProfileCommand,
  GetSigningProfileCommand,
  ListSigningProfilesCommand,
  CancelSigningProfileCommand,
  StartSigningJobCommand,
  DescribeSigningJobCommand,
  ListSigningJobsCommand,
} from "@aws-sdk/client-signer";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new SignerClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Signer", () => {
  const profileName = "test-profile";
  let jobId: string;

  test("PutSigningProfile", async () => {
    const res = await client.send(new PutSigningProfileCommand({
      profileName,
      platformId: "AWSLambda-SHA384-ECDSA",
    }));
    expect(res.profileVersion).toBeDefined();
    expect(res.profileVersionArn).toBeDefined();
  });

  test("GetSigningProfile", async () => {
    const res = await client.send(new GetSigningProfileCommand({ profileName }));
    expect(res.profileName).toBe(profileName);
    expect(res.platformId).toBe("AWSLambda-SHA384-ECDSA");
    expect(res.status).toBe("Active");
  });

  test("ListSigningProfiles", async () => {
    const res = await client.send(new ListSigningProfilesCommand({}));
    expect(res.profiles).toBeDefined();
    expect(res.profiles!.length).toBeGreaterThanOrEqual(1);
  });

  test("StartSigningJob", async () => {
    const res = await client.send(new StartSigningJobCommand({
      profileName,
      source: { s3: { bucketName: "source-bucket", key: "code.zip", version: "1" } },
      destination: { s3: { bucketName: "dest-bucket", prefix: "signed/" } },
    }));
    jobId = res.jobId!;
    expect(jobId).toBeDefined();
  });

  test("DescribeSigningJob", async () => {
    const res = await client.send(new DescribeSigningJobCommand({ jobId }));
    expect(res.jobId).toBe(jobId);
    expect(res.profileName).toBe(profileName);
    expect(res.status).toBe("Succeeded");
  });

  test("ListSigningJobs", async () => {
    const res = await client.send(new ListSigningJobsCommand({}));
    expect(res.jobs).toBeDefined();
    expect(res.jobs!.length).toBeGreaterThanOrEqual(1);
  });

  test("CancelSigningProfile", async () => {
    await client.send(new CancelSigningProfileCommand({ profileName }));
    const res = await client.send(new GetSigningProfileCommand({ profileName }));
    expect(res.status).toBe("Canceled");
  });
});
