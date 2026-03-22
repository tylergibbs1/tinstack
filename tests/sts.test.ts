import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { startServer, stopServer, clientConfig } from "./helpers";

const sts = new STSClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("STS", () => {
  test("GetCallerIdentity", async () => {
    const res = await sts.send(new GetCallerIdentityCommand({}));
    expect(res.Account).toBe("000000000000");
    expect(res.Arn).toContain("iam");
    expect(res.UserId).toBeDefined();
  });

  test("AssumeRole", async () => {
    const res = await sts.send(new AssumeRoleCommand({
      RoleArn: "arn:aws:iam::000000000000:role/test-role",
      RoleSessionName: "test-session",
    }));
    expect(res.Credentials?.AccessKeyId).toBeDefined();
    expect(res.Credentials?.SecretAccessKey).toBeDefined();
    expect(res.Credentials?.SessionToken).toBeDefined();
    expect(res.AssumedRoleUser?.Arn).toContain("test-session");
  });
});
