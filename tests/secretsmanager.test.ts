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
  PutResourcePolicyCommand,
  GetResourcePolicyCommand,
  DeleteResourcePolicyCommand,
  UpdateSecretVersionStageCommand,
  RotateSecretCommand,
  CancelRotateSecretCommand,
  BatchGetSecretValueCommand,
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

  test("PutResourcePolicy + GetResourcePolicy + DeleteResourcePolicy", async () => {
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Principal: "*", Action: "secretsmanager:GetSecretValue", Resource: "*" }],
    });

    await sm.send(new PutResourcePolicyCommand({
      SecretId: secretName,
      ResourcePolicy: policy,
    }));

    const get = await sm.send(new GetResourcePolicyCommand({ SecretId: secretName }));
    expect(get.ResourcePolicy).toBe(policy);
    expect(get.Name).toBe(secretName);

    await sm.send(new DeleteResourcePolicyCommand({ SecretId: secretName }));

    const getAfter = await sm.send(new GetResourcePolicyCommand({ SecretId: secretName }));
    expect(getAfter.ResourcePolicy ?? null).toBeNull();
  });

  test("UpdateSecretVersionStage", async () => {
    // Create a new version
    const v1 = await sm.send(new PutSecretValueCommand({
      SecretId: secretName,
      SecretString: "version-stage-test-1",
    }));
    const v1Id = v1.VersionId!;

    const v2 = await sm.send(new PutSecretValueCommand({
      SecretId: secretName,
      SecretString: "version-stage-test-2",
    }));
    const v2Id = v2.VersionId!;

    // v2 should be AWSCURRENT now, v1 should be AWSPREVIOUS
    // Move AWSCURRENT back to v1
    await sm.send(new UpdateSecretVersionStageCommand({
      SecretId: secretName,
      VersionStage: "AWSCURRENT",
      MoveToVersionId: v1Id,
      RemoveFromVersionId: v2Id,
    }));

    const val = await sm.send(new GetSecretValueCommand({ SecretId: secretName }));
    expect(val.SecretString).toBe("version-stage-test-1");
    expect(val.VersionId).toBe(v1Id);
  });

  test("GetRandomPassword", async () => {
    const res = await sm.send(new GetRandomPasswordCommand({ PasswordLength: 32 }));
    expect(res.RandomPassword?.length).toBe(32);
  });

  // --- RotateSecret ---

  test("RotateSecret", async () => {
    const res = await sm.send(new RotateSecretCommand({
      SecretId: secretName,
      RotationLambdaARN: "arn:aws:lambda:us-east-1:000000000000:function:my-rotation",
      RotationRules: { AutomaticallyAfterDays: 30 },
    }));
    expect(res.Name).toBe(secretName);
    expect(res.VersionId).toBeDefined();
    expect(res.ARN).toContain("secretsmanager");

    // Verify the rotated secret is still accessible
    const val = await sm.send(new GetSecretValueCommand({ SecretId: secretName }));
    expect(val.VersionStages).toContain("AWSCURRENT");
  });

  test("CancelRotateSecret", async () => {
    const res = await sm.send(new CancelRotateSecretCommand({
      SecretId: secretName,
    }));
    expect(res.Name).toBe(secretName);
    expect(res.ARN).toContain("secretsmanager");
  });

  // --- BatchGetSecretValue ---

  test("BatchGetSecretValue", async () => {
    // Create a second secret for batch
    const secret2Name = "test/batch-secret-" + Date.now();
    await sm.send(new CreateSecretCommand({
      Name: secret2Name,
      SecretString: "batch-value",
    }));

    const res = await sm.send(new BatchGetSecretValueCommand({
      SecretIdList: [secretName, secret2Name],
    }));
    expect(res.SecretValues?.length).toBe(2);
    expect(res.SecretValues?.some((s) => s.Name === secretName)).toBe(true);
    expect(res.SecretValues?.some((s) => s.Name === secret2Name)).toBe(true);

    // Clean up
    await sm.send(new DeleteSecretCommand({ SecretId: secret2Name, ForceDeleteWithoutRecovery: true }));
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
