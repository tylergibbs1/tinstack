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
  EnableKeyCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListResourceTagsCommand,
  EnableKeyRotationCommand,
  DisableKeyRotationCommand,
  GetKeyRotationStatusCommand,
  GenerateRandomCommand,
  SignCommand,
  VerifyCommand,
  ReEncryptCommand,
  CreateGrantCommand,
  ListGrantsCommand,
  RevokeGrantCommand,
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

  test("TagResource and ListResourceTags", async () => {
    await kms.send(new TagResourceCommand({
      KeyId: keyId,
      Tags: [{ TagKey: "env", TagValue: "test" }, { TagKey: "team", TagValue: "platform" }],
    }));
    const res = await kms.send(new ListResourceTagsCommand({ KeyId: keyId }));
    expect(res.Tags!.some((t) => t.TagKey === "env" && t.TagValue === "test")).toBe(true);
    expect(res.Tags!.some((t) => t.TagKey === "team" && t.TagValue === "platform")).toBe(true);
  });

  test("UntagResource", async () => {
    await kms.send(new UntagResourceCommand({ KeyId: keyId, TagKeys: ["team"] }));
    const res = await kms.send(new ListResourceTagsCommand({ KeyId: keyId }));
    expect(res.Tags!.some((t) => t.TagKey === "team")).toBe(false);
    expect(res.Tags!.some((t) => t.TagKey === "env")).toBe(true);
  });

  test("EnableKeyRotation and GetKeyRotationStatus", async () => {
    await kms.send(new EnableKeyRotationCommand({ KeyId: keyId }));
    const res = await kms.send(new GetKeyRotationStatusCommand({ KeyId: keyId }));
    expect(res.KeyRotationEnabled).toBe(true);
  });

  test("DisableKeyRotation", async () => {
    await kms.send(new DisableKeyRotationCommand({ KeyId: keyId }));
    const res = await kms.send(new GetKeyRotationStatusCommand({ KeyId: keyId }));
    expect(res.KeyRotationEnabled).toBe(false);
  });

  test("GenerateRandom", async () => {
    const res = await kms.send(new GenerateRandomCommand({ NumberOfBytes: 32 }));
    expect(res.Plaintext).toBeDefined();
    expect(res.Plaintext!.byteLength).toBe(32);
  });

  test("Sign and Verify", async () => {
    // Create a key suitable for signing
    const signKey = await kms.send(new CreateKeyCommand({
      Description: "Signing key",
      KeyUsage: "SIGN_VERIFY",
      KeySpec: "RSA_2048",
    }));
    const signKeyId = signKey.KeyMetadata!.KeyId!;
    const message = Buffer.from("hello world").toString("base64");

    const signRes = await kms.send(new SignCommand({
      KeyId: signKeyId,
      Message: Buffer.from("hello world"),
      SigningAlgorithm: "RSASSA_PSS_SHA_256",
    }));
    expect(signRes.Signature).toBeDefined();
    expect(signRes.KeyId).toContain(signKeyId);
    expect(signRes.SigningAlgorithm).toBe("RSASSA_PSS_SHA_256");

    const verifyRes = await kms.send(new VerifyCommand({
      KeyId: signKeyId,
      Message: Buffer.from("hello world"),
      Signature: signRes.Signature!,
      SigningAlgorithm: "RSASSA_PSS_SHA_256",
    }));
    expect(verifyRes.SignatureValid).toBe(true);
  });

  test("ReEncrypt", async () => {
    // Encrypt with the original key
    const plaintext = Buffer.from("re-encrypt me").toString("base64");
    const encRes = await kms.send(new EncryptCommand({
      KeyId: keyId,
      Plaintext: Buffer.from("re-encrypt me"),
    }));

    // Create a second key
    const key2 = await kms.send(new CreateKeyCommand({ Description: "Second key" }));
    const key2Id = key2.KeyMetadata!.KeyId!;

    const reRes = await kms.send(new ReEncryptCommand({
      CiphertextBlob: encRes.CiphertextBlob!,
      DestinationKeyId: key2Id,
    }));
    expect(reRes.CiphertextBlob).toBeDefined();
    expect(reRes.KeyId).toContain(key2Id);

    // Decrypt with second key should work
    const decRes = await kms.send(new DecryptCommand({
      CiphertextBlob: reRes.CiphertextBlob!,
    }));
    expect(Buffer.from(decRes.Plaintext!).toString()).toContain("re-encrypt me");
  });

  test("CreateGrant and ListGrants", async () => {
    const grantRes = await kms.send(new CreateGrantCommand({
      KeyId: keyId,
      GranteePrincipal: "arn:aws:iam::000000000000:role/test-role",
      Operations: ["Encrypt", "Decrypt"],
    }));
    expect(grantRes.GrantId).toBeDefined();
    expect(grantRes.GrantToken).toBeDefined();

    const listRes = await kms.send(new ListGrantsCommand({ KeyId: keyId }));
    expect(listRes.Grants!.some((g) => g.GrantId === grantRes.GrantId)).toBe(true);
  });

  test("RevokeGrant", async () => {
    const grantRes = await kms.send(new CreateGrantCommand({
      KeyId: keyId,
      GranteePrincipal: "arn:aws:iam::000000000000:role/other-role",
      Operations: ["Decrypt"],
    }));
    await kms.send(new RevokeGrantCommand({ KeyId: keyId, GrantId: grantRes.GrantId! }));
    const listRes = await kms.send(new ListGrantsCommand({ KeyId: keyId }));
    expect(listRes.Grants!.some((g) => g.GrantId === grantRes.GrantId)).toBe(false);
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
