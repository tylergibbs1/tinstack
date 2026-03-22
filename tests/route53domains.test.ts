import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  Route53DomainsClient,
  RegisterDomainCommand,
  GetDomainDetailCommand,
  ListDomainsCommand,
  CheckDomainAvailabilityCommand,
} from "@aws-sdk/client-route-53-domains";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new Route53DomainsClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Route53Domains", () => {
  const contact = { FirstName: "Test", LastName: "User", ContactType: "PERSON" as const, Email: "test@example.com", PhoneNumber: "+1.0000000000", AddressLine1: "123 Main St", City: "Seattle", State: "WA", CountryCode: "US" as const, ZipCode: "98101" };

  test("RegisterDomain", async () => {
    const res = await client.send(new RegisterDomainCommand({
      DomainName: "example.com",
      DurationInYears: 1,
      AdminContact: contact,
      RegistrantContact: contact,
      TechContact: contact,
    }));
    expect(res.OperationId).toBeDefined();
  });

  test("GetDomainDetail", async () => {
    const res = await client.send(new GetDomainDetailCommand({ DomainName: "example.com" }));
    expect(res.DomainName).toBe("example.com");
    expect(res.Nameservers).toBeDefined();
    expect(res.Nameservers!.length).toBeGreaterThanOrEqual(1);
  });

  test("ListDomains", async () => {
    const res = await client.send(new ListDomainsCommand({}));
    expect(res.Domains).toBeDefined();
    expect(res.Domains!.length).toBeGreaterThanOrEqual(1);
  });

  test("CheckDomainAvailability", async () => {
    const res = await client.send(new CheckDomainAvailabilityCommand({ DomainName: "available-domain.com" }));
    expect(res.Availability).toBe("AVAILABLE");

    const res2 = await client.send(new CheckDomainAvailabilityCommand({ DomainName: "example.com" }));
    expect(res2.Availability).toBe("UNAVAILABLE");
  });
});
