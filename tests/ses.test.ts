import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SESv2Client,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  ListEmailIdentitiesCommand,
  DeleteEmailIdentityCommand,
  SendEmailCommand,
  GetAccountCommand,
} from "@aws-sdk/client-sesv2";
import { startServer, stopServer, clientConfig } from "./helpers";

const ses = new SESv2Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SES v2", () => {
  test("CreateEmailIdentity — email", async () => {
    const res = await ses.send(
      new CreateEmailIdentityCommand({ EmailIdentity: "sender@example.com" }),
    );
    expect(res.IdentityType).toBe("EMAIL_ADDRESS");
    expect(res.VerifiedForSendingStatus).toBe(true);
  });

  test("CreateEmailIdentity — domain", async () => {
    const res = await ses.send(
      new CreateEmailIdentityCommand({ EmailIdentity: "example.com" }),
    );
    expect(res.IdentityType).toBe("DOMAIN");
  });

  test("GetEmailIdentity", async () => {
    const res = await ses.send(
      new GetEmailIdentityCommand({ EmailIdentity: "sender@example.com" }),
    );
    expect(res.IdentityType).toBe("EMAIL_ADDRESS");
    expect(res.VerifiedForSendingStatus).toBe(true);
  });

  test("ListEmailIdentities", async () => {
    const res = await ses.send(new ListEmailIdentitiesCommand({}));
    expect(res.EmailIdentities!.length).toBeGreaterThanOrEqual(2);
    expect(res.EmailIdentities!.some((i) => i.IdentityName === "sender@example.com")).toBe(true);
  });

  test("SendEmail", async () => {
    const res = await ses.send(
      new SendEmailCommand({
        FromEmailAddress: "sender@example.com",
        Destination: {
          ToAddresses: ["recipient@example.com"],
        },
        Content: {
          Simple: {
            Subject: { Data: "Test Subject" },
            Body: { Text: { Data: "Hello from tinstack!" } },
          },
        },
      }),
    );
    expect(res.MessageId).toBeDefined();
  });

  test("GetAccount", async () => {
    const res = await ses.send(new GetAccountCommand({}));
    expect(res.SendingEnabled).toBe(true);
    expect(res.SendQuota).toBeDefined();
    expect(res.SendQuota!.Max24HourSend).toBeGreaterThan(0);
  });

  test("DeleteEmailIdentity", async () => {
    await ses.send(
      new DeleteEmailIdentityCommand({ EmailIdentity: "sender@example.com" }),
    );

    const res = await ses.send(new ListEmailIdentitiesCommand({}));
    expect(res.EmailIdentities!.some((i) => i.IdentityName === "sender@example.com")).toBe(false);
  });
});
