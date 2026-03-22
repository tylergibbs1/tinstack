import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  UpdateSecretCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
  DescribeSecretCommand,
  GetRandomPasswordCommand,
} from "@aws-sdk/client-secrets-manager";
import { startServer, stopServer, clientConfig } from "./helpers";

const sm = new SecretsManagerClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Secrets Manager", () => {
  const secretName = "test/secret-" + Date.now();

  test("CreateSecret", async () => {
    const res = await sm.send(new CreateSecretCommand({
      Name: secretName,
      SecretString: JSON.stringify({ username: "admin", password: "s3cret" }),
      Description: "Test secret",
    }));
    expect(res.ARN).toContain("secretsmanager");
    expect(res.Name).toBe(secretName);
    expect(res.VersionId).toBeDefined();
  });

  test("GetSecretValue", async () => {
    const res = await sm.send(new GetSecretValueCommand({ SecretId: secretName }));
    expect(res.Name).toBe(secretName);
    const parsed = JSON.parse(res.SecretString!);
    expect(parsed.username).toBe("admin");
    expect(parsed.password).toBe("s3cret");
    expect(res.VersionStages).toContain("AWSCURRENT");
  });

  test("UpdateSecret", async () => {
    await sm.send(new UpdateSecretCommand({
      SecretId: secretName,
      SecretString: JSON.stringify({ username: "admin", password: "n3wP@ss!" }),
    }));

    const res = await sm.send(new GetSecretValueCommand({ SecretId: secretName }));
    const parsed = JSON.parse(res.SecretString!);
    expect(parsed.password).toBe("n3wP@ss!");
  });

  test("PutSecretValue", async () => {
    const res = await sm.send(new PutSecretValueCommand({
      SecretId: secretName,
      SecretString: "plain-text-secret",
    }));
    expect(res.VersionId).toBeDefined();
  });

  test("DescribeSecret", async () => {
    const res = await sm.send(new DescribeSecretCommand({ SecretId: secretName }));
    expect(res.Name).toBe(secretName);
    expect(res.Description).toBe("Test secret");
    expect(res.VersionIdsToStages).toBeDefined();
  });

  test("ListSecrets", async () => {
    const res = await sm.send(new ListSecretsCommand({}));
    expect(res.SecretList?.some((s) => s.Name === secretName)).toBe(true);
  });

  test("GetRandomPassword", async () => {
    const res = await sm.send(new GetRandomPasswordCommand({ PasswordLength: 32 }));
    expect(res.RandomPassword?.length).toBe(32);
  });

  test("DeleteSecret", async () => {
    const res = await sm.send(new DeleteSecretCommand({
      SecretId: secretName,
      ForceDeleteWithoutRecovery: true,
    }));
    expect(res.Name).toBe(secretName);

    try {
      await sm.send(new GetSecretValueCommand({ SecretId: secretName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });
});
