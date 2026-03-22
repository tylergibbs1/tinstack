import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  KMSClient,
  CreateKeyCommand,
  DescribeKeyCommand,
  ListKeysCommand,
  CreateAliasCommand,
  ListAliasesCommand,
  EncryptCommand,
  DecryptCommand,
  GenerateDataKeyCommand,
  DisableKeyCommand,
  ScheduleKeyDeletionCommand,
} from "@aws-sdk/client-kms";
import { startServer, stopServer, clientConfig } from "./helpers";

const kms = new KMSClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("KMS", () => {
  let keyId: string;

  test("CreateKey", async () => {
    const res = await kms.send(new CreateKeyCommand({ Description: "Test key" }));
    keyId = res.KeyMetadata!.KeyId!;
    expect(keyId).toBeDefined();
    expect(res.KeyMetadata!.Enabled).toBe(true);
    expect(res.KeyMetadata!.KeyState).toBe("Enabled");
  });

  test("DescribeKey", async () => {
    const res = await kms.send(new DescribeKeyCommand({ KeyId: keyId }));
    expect(res.KeyMetadata!.Description).toBe("Test key");
  });

  test("ListKeys", async () => {
    const res = await kms.send(new ListKeysCommand({}));
    expect(res.Keys?.some((k) => k.KeyId === keyId)).toBe(true);
  });

  test("CreateAlias", async () => {
    await kms.send(new CreateAliasCommand({ AliasName: "alias/test-key", TargetKeyId: keyId }));
    const res = await kms.send(new ListAliasesCommand({}));
    expect(res.Aliases?.some((a) => a.AliasName === "alias/test-key")).toBe(true);
  });

  test("GenerateDataKey", async () => {
    const res = await kms.send(new GenerateDataKeyCommand({ KeyId: keyId, KeySpec: "AES_256" }));
    expect(res.Plaintext).toBeDefined();
    expect(res.CiphertextBlob).toBeDefined();
  });

  test("DisableKey", async () => {
    await kms.send(new DisableKeyCommand({ KeyId: keyId }));
    const res = await kms.send(new DescribeKeyCommand({ KeyId: keyId }));
    expect(res.KeyMetadata!.Enabled).toBe(false);
  });

  test("ScheduleKeyDeletion", async () => {
    const res = await kms.send(new ScheduleKeyDeletionCommand({ KeyId: keyId, PendingWindowInDays: 7 }));
    expect(res.KeyState).toBe("PendingDeletion");
  });
});
