import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SWFClient,
  RegisterDomainCommand,
  ListDomainsCommand,
  DescribeDomainCommand,
  DeprecateDomainCommand,
  RegisterWorkflowTypeCommand,
  ListWorkflowTypesCommand,
} from "@aws-sdk/client-swf";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new SWFClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SWF", () => {
  test("RegisterDomain", async () => {
    const res = await client.send(new RegisterDomainCommand({
      name: "test-domain",
      workflowExecutionRetentionPeriodInDays: "30",
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("RegisterDomain - duplicate", async () => {
    await expect(client.send(new RegisterDomainCommand({
      name: "test-domain",
      workflowExecutionRetentionPeriodInDays: "30",
    }))).rejects.toThrow();
  });

  test("ListDomains", async () => {
    const res = await client.send(new ListDomainsCommand({ registrationStatus: "REGISTERED" }));
    expect(res.domainInfos!.length).toBeGreaterThanOrEqual(1);
  });

  test("DescribeDomain", async () => {
    const res = await client.send(new DescribeDomainCommand({ name: "test-domain" }));
    expect(res.domainInfo!.name).toBe("test-domain");
    expect(res.domainInfo!.status).toBe("REGISTERED");
  });

  test("RegisterWorkflowType and List", async () => {
    await client.send(new RegisterWorkflowTypeCommand({
      domain: "test-domain", name: "test-workflow", version: "1.0",
    }));
    const res = await client.send(new ListWorkflowTypesCommand({
      domain: "test-domain", registrationStatus: "REGISTERED",
    }));
    expect(res.typeInfos!.length).toBeGreaterThanOrEqual(1);
  });
});
