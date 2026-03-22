import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SESClient,
  VerifyEmailIdentityCommand,
  ListIdentitiesCommand,
  GetIdentityVerificationAttributesCommand,
  SendEmailCommand,
  DeleteIdentityCommand,
} from "@aws-sdk/client-ses";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new SESClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SES v1", () => {
  const email = "test@example.com";

  test("VerifyEmailIdentity", async () => {
    await client.send(new VerifyEmailIdentityCommand({ EmailAddress: email }));
    // No error means success
  });

  test("ListIdentities", async () => {
    const res = await client.send(new ListIdentitiesCommand({}));
    expect(res.Identities).toBeDefined();
    expect(res.Identities).toContain(email);
  });

  test("GetIdentityVerificationAttributes", async () => {
    const res = await client.send(new GetIdentityVerificationAttributesCommand({
      Identities: [email, "nonexistent@example.com"],
    }));
    expect(res.VerificationAttributes).toBeDefined();
    expect(res.VerificationAttributes![email]).toBeDefined();
    expect(res.VerificationAttributes![email].VerificationStatus).toBe("Success");
    expect(res.VerificationAttributes!["nonexistent@example.com"].VerificationStatus).toBe("NotStarted");
  });

  test("SendEmail", async () => {
    const res = await client.send(new SendEmailCommand({
      Source: email,
      Destination: {
        ToAddresses: ["recipient@example.com"],
      },
      Message: {
        Subject: { Data: "Test Subject" },
        Body: { Text: { Data: "Hello from SES v1!" } },
      },
    }));
    expect(res.MessageId).toBeDefined();
  });

  test("DeleteIdentity", async () => {
    await client.send(new DeleteIdentityCommand({ Identity: email }));
    const res = await client.send(new ListIdentitiesCommand({}));
    expect(res.Identities).not.toContain(email);
  });

  test("DeleteIdentity - idempotent", async () => {
    // Deleting a non-existent identity should not throw in v1
    await client.send(new DeleteIdentityCommand({ Identity: "nonexistent@example.com" }));
  });
});
