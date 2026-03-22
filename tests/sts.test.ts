import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  STSClient,
  GetCallerIdentityCommand,
  AssumeRoleCommand,
  AssumeRoleWithWebIdentityCommand,
  AssumeRoleWithSAMLCommand,
  GetAccessKeyInfoCommand,
} from "@aws-sdk/client-sts";
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

  test("AssumeRoleWithWebIdentity", async () => {
    const res = await sts.send(new AssumeRoleWithWebIdentityCommand({
      RoleArn: "arn:aws:iam::000000000000:role/web-identity-role",
      RoleSessionName: "web-session",
      WebIdentityToken: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-token",
    }));
    expect(res.Credentials?.AccessKeyId).toBeDefined();
    expect(res.Credentials?.SecretAccessKey).toBeDefined();
    expect(res.Credentials?.SessionToken).toBeDefined();
    expect(res.AssumedRoleUser?.Arn).toContain("web-session");
    expect(res.SubjectFromWebIdentityToken).toBeDefined();
  });

  test("AssumeRoleWithSAML", async () => {
    const res = await sts.send(new AssumeRoleWithSAMLCommand({
      RoleArn: "arn:aws:iam::000000000000:role/saml-role",
      PrincipalArn: "arn:aws:iam::000000000000:saml-provider/MyProvider",
      SAMLAssertion: Buffer.from("<saml>test</saml>").toString("base64"),
    }));
    expect(res.Credentials?.AccessKeyId).toBeDefined();
    expect(res.Credentials?.SecretAccessKey).toBeDefined();
    expect(res.Credentials?.SessionToken).toBeDefined();
    expect(res.AssumedRoleUser?.Arn).toBeDefined();
  });

  test("GetAccessKeyInfo", async () => {
    const res = await sts.send(new GetAccessKeyInfoCommand({
      AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
    }));
    expect(res.Account).toBe("000000000000");
  });
});
