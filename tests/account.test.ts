import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  AccountClient,
  GetContactInformationCommand,
  PutContactInformationCommand,
  PutAlternateContactCommand,
  GetAlternateContactCommand,
  DeleteAlternateContactCommand,
} from "@aws-sdk/client-account";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new AccountClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Account", () => {
  test("PutContactInformation", async () => {
    await client.send(new PutContactInformationCommand({
      ContactInformation: {
        FullName: "Test User",
        PhoneNumber: "+1-555-0100",
        City: "Seattle",
        CountryCode: "US",
        PostalCode: "98101",
        AddressLine1: "123 Test St",
      },
    }));
    // No error means success
  });

  test("GetContactInformation", async () => {
    const res = await client.send(new GetContactInformationCommand({}));
    expect(res.ContactInformation).toBeDefined();
    expect(res.ContactInformation!.FullName).toBe("Test User");
    expect(res.ContactInformation!.City).toBe("Seattle");
  });

  test("PutAlternateContact", async () => {
    await client.send(new PutAlternateContactCommand({
      AlternateContactType: "BILLING",
      EmailAddress: "billing@test.com",
      Name: "Billing Team",
      PhoneNumber: "+1-555-0200",
      Title: "Billing Manager",
    }));
  });

  test("GetAlternateContact", async () => {
    const res = await client.send(new GetAlternateContactCommand({
      AlternateContactType: "BILLING",
    }));
    expect(res.AlternateContact).toBeDefined();
    expect(res.AlternateContact!.EmailAddress).toBe("billing@test.com");
    expect(res.AlternateContact!.Name).toBe("Billing Team");
  });

  test("DeleteAlternateContact", async () => {
    await client.send(new DeleteAlternateContactCommand({ AlternateContactType: "BILLING" }));
    await expect(
      client.send(new GetAlternateContactCommand({ AlternateContactType: "BILLING" })),
    ).rejects.toThrow();
  });

  test("GetAlternateContact - not found", async () => {
    await expect(
      client.send(new GetAlternateContactCommand({ AlternateContactType: "SECURITY" })),
    ).rejects.toThrow();
  });
});
