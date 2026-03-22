import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SESv2Client,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  ListEmailIdentitiesCommand,
  DeleteEmailIdentityCommand,
  SendEmailCommand,
  GetAccountCommand,
  CreateEmailTemplateCommand,
  GetEmailTemplateCommand,
  ListEmailTemplatesCommand,
  UpdateEmailTemplateCommand,
  DeleteEmailTemplateCommand,
  SendBulkEmailCommand,
  CreateConfigurationSetCommand,
  GetConfigurationSetCommand,
  ListConfigurationSetsCommand,
  DeleteConfigurationSetCommand,
  PutSuppressedDestinationCommand,
  GetSuppressedDestinationCommand,
  ListSuppressedDestinationsCommand,
  PutAccountSendingAttributesCommand,
  PutEmailIdentityDkimAttributesCommand,
} from "@aws-sdk/client-sesv2";
import { startServer, stopServer, clientConfig } from "./helpers";

const ses = new SESv2Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SES v2", () => {
  // --- Email Identities (existing tests) ---

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

  // --- Email Templates ---

  describe("Email Templates", () => {
    test("CreateEmailTemplate", async () => {
      await ses.send(
        new CreateEmailTemplateCommand({
          TemplateName: "welcome-template",
          TemplateContent: {
            Subject: "Welcome {{name}}!",
            Html: "<h1>Hello {{name}}</h1>",
            Text: "Hello {{name}}",
          },
        }),
      );
    });

    test("CreateEmailTemplate — duplicate throws AlreadyExistsException", async () => {
      await expect(
        ses.send(
          new CreateEmailTemplateCommand({
            TemplateName: "welcome-template",
            TemplateContent: {
              Subject: "Duplicate",
            },
          }),
        ),
      ).rejects.toThrow();
    });

    test("GetEmailTemplate", async () => {
      const res = await ses.send(
        new GetEmailTemplateCommand({ TemplateName: "welcome-template" }),
      );
      expect(res.TemplateName).toBe("welcome-template");
      expect(res.TemplateContent!.Subject).toBe("Welcome {{name}}!");
      expect(res.TemplateContent!.Html).toBe("<h1>Hello {{name}}</h1>");
      expect(res.TemplateContent!.Text).toBe("Hello {{name}}");
    });

    test("GetEmailTemplate — not found throws NotFoundException", async () => {
      await expect(
        ses.send(new GetEmailTemplateCommand({ TemplateName: "nonexistent" })),
      ).rejects.toThrow();
    });

    test("ListEmailTemplates", async () => {
      await ses.send(
        new CreateEmailTemplateCommand({
          TemplateName: "goodbye-template",
          TemplateContent: {
            Subject: "Goodbye!",
            Text: "Bye",
          },
        }),
      );

      const res = await ses.send(new ListEmailTemplatesCommand({}));
      expect(res.TemplatesMetadata!.length).toBeGreaterThanOrEqual(2);
      expect(res.TemplatesMetadata!.some((t) => t.TemplateName === "welcome-template")).toBe(true);
      expect(res.TemplatesMetadata!.some((t) => t.TemplateName === "goodbye-template")).toBe(true);
    });

    test("UpdateEmailTemplate", async () => {
      await ses.send(
        new UpdateEmailTemplateCommand({
          TemplateName: "welcome-template",
          TemplateContent: {
            Subject: "Updated Welcome!",
            Html: "<h1>Updated</h1>",
            Text: "Updated",
          },
        }),
      );

      const res = await ses.send(
        new GetEmailTemplateCommand({ TemplateName: "welcome-template" }),
      );
      expect(res.TemplateContent!.Subject).toBe("Updated Welcome!");
    });

    test("UpdateEmailTemplate — not found throws NotFoundException", async () => {
      await expect(
        ses.send(
          new UpdateEmailTemplateCommand({
            TemplateName: "nonexistent",
            TemplateContent: { Subject: "nope" },
          }),
        ),
      ).rejects.toThrow();
    });

    test("DeleteEmailTemplate", async () => {
      await ses.send(
        new DeleteEmailTemplateCommand({ TemplateName: "goodbye-template" }),
      );

      const res = await ses.send(new ListEmailTemplatesCommand({}));
      expect(res.TemplatesMetadata!.some((t) => t.TemplateName === "goodbye-template")).toBe(false);
    });

    test("DeleteEmailTemplate — not found throws NotFoundException", async () => {
      await expect(
        ses.send(new DeleteEmailTemplateCommand({ TemplateName: "nonexistent" })),
      ).rejects.toThrow();
    });
  });

  // --- Send Bulk Email ---

  describe("SendBulkEmail", () => {
    test("sends to multiple destinations with template", async () => {
      const res = await ses.send(
        new SendBulkEmailCommand({
          DefaultContent: {
            Template: {
              TemplateName: "welcome-template",
              TemplateData: '{"name":"World"}',
            },
          },
          BulkEmailEntries: [
            {
              Destination: { ToAddresses: ["user1@example.com"] },
            },
            {
              Destination: { ToAddresses: ["user2@example.com"] },
            },
            {
              Destination: { ToAddresses: ["user3@example.com"] },
              ReplacementEmailContent: {
                ReplacementTemplate: {
                  ReplacementTemplateData: '{"name":"User3"}',
                },
              },
            },
          ],
        }),
      );

      expect(res.BulkEmailEntryResults).toBeDefined();
      expect(res.BulkEmailEntryResults!.length).toBe(3);
      for (const result of res.BulkEmailEntryResults!) {
        expect(result.Status).toBe("SUCCESS");
        expect(result.MessageId).toBeDefined();
      }
    });

    test("fails when template does not exist", async () => {
      await expect(
        ses.send(
          new SendBulkEmailCommand({
            DefaultContent: {
              Template: {
                TemplateName: "nonexistent-template",
                TemplateData: "{}",
              },
            },
            BulkEmailEntries: [
              { Destination: { ToAddresses: ["user@example.com"] } },
            ],
          }),
        ),
      ).rejects.toThrow();
    });
  });

  // --- Configuration Sets ---

  describe("Configuration Sets", () => {
    test("CreateConfigurationSet", async () => {
      await ses.send(
        new CreateConfigurationSetCommand({
          ConfigurationSetName: "my-config-set",
          SendingOptions: { SendingEnabled: true },
          TrackingOptions: { CustomRedirectDomain: "track.example.com" },
        }),
      );
    });

    test("CreateConfigurationSet — duplicate throws AlreadyExistsException", async () => {
      await expect(
        ses.send(
          new CreateConfigurationSetCommand({
            ConfigurationSetName: "my-config-set",
          }),
        ),
      ).rejects.toThrow();
    });

    test("GetConfigurationSet", async () => {
      const res = await ses.send(
        new GetConfigurationSetCommand({ ConfigurationSetName: "my-config-set" }),
      );
      expect(res.ConfigurationSetName).toBe("my-config-set");
      expect(res.SendingOptions?.SendingEnabled).toBe(true);
      expect(res.TrackingOptions?.CustomRedirectDomain).toBe("track.example.com");
    });

    test("GetConfigurationSet — not found throws NotFoundException", async () => {
      await expect(
        ses.send(new GetConfigurationSetCommand({ ConfigurationSetName: "nonexistent" })),
      ).rejects.toThrow();
    });

    test("ListConfigurationSets", async () => {
      await ses.send(
        new CreateConfigurationSetCommand({
          ConfigurationSetName: "another-config-set",
        }),
      );

      const res = await ses.send(new ListConfigurationSetsCommand({}));
      expect(res.ConfigurationSets!.length).toBeGreaterThanOrEqual(2);
    });

    test("DeleteConfigurationSet", async () => {
      await ses.send(
        new DeleteConfigurationSetCommand({ ConfigurationSetName: "another-config-set" }),
      );

      const res = await ses.send(new ListConfigurationSetsCommand({}));
      const names = res.ConfigurationSets ?? [];
      expect(names.some((n) => n === "another-config-set")).toBe(false);
    });

    test("DeleteConfigurationSet — not found throws NotFoundException", async () => {
      await expect(
        ses.send(new DeleteConfigurationSetCommand({ ConfigurationSetName: "nonexistent" })),
      ).rejects.toThrow();
    });
  });

  // --- Suppression List ---

  describe("Suppression List", () => {
    test("PutSuppressedDestination — BOUNCE", async () => {
      await ses.send(
        new PutSuppressedDestinationCommand({
          EmailAddress: "bounced@example.com",
          Reason: "BOUNCE",
        }),
      );
    });

    test("PutSuppressedDestination — COMPLAINT", async () => {
      await ses.send(
        new PutSuppressedDestinationCommand({
          EmailAddress: "complained@example.com",
          Reason: "COMPLAINT",
        }),
      );
    });

    test("GetSuppressedDestination", async () => {
      const res = await ses.send(
        new GetSuppressedDestinationCommand({ EmailAddress: "bounced@example.com" }),
      );
      expect(res.SuppressedDestination!.EmailAddress).toBe("bounced@example.com");
      expect(res.SuppressedDestination!.Reason).toBe("BOUNCE");
      expect(res.SuppressedDestination!.LastUpdateTime).toBeDefined();
    });

    test("GetSuppressedDestination — not found throws NotFoundException", async () => {
      await expect(
        ses.send(new GetSuppressedDestinationCommand({ EmailAddress: "unknown@example.com" })),
      ).rejects.toThrow();
    });

    test("ListSuppressedDestinations", async () => {
      const res = await ses.send(new ListSuppressedDestinationsCommand({}));
      expect(res.SuppressedDestinationSummaries!.length).toBeGreaterThanOrEqual(2);
      expect(
        res.SuppressedDestinationSummaries!.some((d) => d.EmailAddress === "bounced@example.com"),
      ).toBe(true);
      expect(
        res.SuppressedDestinationSummaries!.some((d) => d.EmailAddress === "complained@example.com"),
      ).toBe(true);
    });

    test("PutSuppressedDestination — overwrite existing", async () => {
      await ses.send(
        new PutSuppressedDestinationCommand({
          EmailAddress: "bounced@example.com",
          Reason: "COMPLAINT",
        }),
      );

      const res = await ses.send(
        new GetSuppressedDestinationCommand({ EmailAddress: "bounced@example.com" }),
      );
      expect(res.SuppressedDestination!.Reason).toBe("COMPLAINT");
    });
  });

  // --- Account Sending Attributes ---

  describe("Account Sending Attributes", () => {
    test("PutAccountSendingAttributes — disable sending", async () => {
      await ses.send(
        new PutAccountSendingAttributesCommand({ SendingEnabled: false }),
      );

      const res = await ses.send(new GetAccountCommand({}));
      expect(res.SendingEnabled).toBe(false);
    });

    test("PutAccountSendingAttributes — re-enable sending", async () => {
      await ses.send(
        new PutAccountSendingAttributesCommand({ SendingEnabled: true }),
      );

      const res = await ses.send(new GetAccountCommand({}));
      expect(res.SendingEnabled).toBe(true);
    });
  });

  // --- DKIM Attributes ---

  describe("DKIM Attributes", () => {
    test("PutEmailIdentityDkimAttributes", async () => {
      // Create an identity first
      await ses.send(
        new CreateEmailIdentityCommand({ EmailIdentity: "dkim-test.example.com" }),
      );

      await ses.send(
        new PutEmailIdentityDkimAttributesCommand({
          EmailIdentity: "dkim-test.example.com",
          SigningEnabled: true,
        }),
      );

      const res = await ses.send(
        new GetEmailIdentityCommand({ EmailIdentity: "dkim-test.example.com" }),
      );
      expect(res.DkimAttributes?.SigningEnabled).toBe(true);
    });

    test("PutEmailIdentityDkimAttributes — not found throws NotFoundException", async () => {
      await expect(
        ses.send(
          new PutEmailIdentityDkimAttributesCommand({
            EmailIdentity: "nonexistent.example.com",
            SigningEnabled: true,
          }),
        ),
      ).rejects.toThrow();
    });
  });
});
