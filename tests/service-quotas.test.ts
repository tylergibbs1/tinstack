import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ServiceQuotasClient,
  GetServiceQuotaCommand,
  ListServiceQuotasCommand,
  RequestServiceQuotaIncreaseCommand,
  ListRequestedServiceQuotaChangeHistoryCommand,
  GetAWSDefaultServiceQuotaCommand,
} from "@aws-sdk/client-service-quotas";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ServiceQuotasClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Service Quotas", () => {
  test("GetServiceQuota", async () => {
    const res = await client.send(new GetServiceQuotaCommand({
      ServiceCode: "s3",
      QuotaCode: "L-DC2B2D3D",
    }));
    expect(res.Quota).toBeDefined();
    expect(res.Quota!.ServiceCode).toBe("s3");
    expect(res.Quota!.Value).toBe(100);
  });

  test("GetAWSDefaultServiceQuota", async () => {
    const res = await client.send(new GetAWSDefaultServiceQuotaCommand({
      ServiceCode: "lambda",
      QuotaCode: "L-B99A9384",
    }));
    expect(res.Quota).toBeDefined();
    expect(res.Quota!.Value).toBe(1000);
  });

  test("ListServiceQuotas", async () => {
    const res = await client.send(new ListServiceQuotasCommand({ ServiceCode: "s3" }));
    expect(res.Quotas).toBeDefined();
    expect(res.Quotas!.length).toBeGreaterThanOrEqual(1);
  });

  test("RequestServiceQuotaIncrease", async () => {
    const res = await client.send(new RequestServiceQuotaIncreaseCommand({
      ServiceCode: "s3",
      QuotaCode: "L-DC2B2D3D",
      DesiredValue: 200,
    }));
    expect(res.RequestedQuota).toBeDefined();
    expect(res.RequestedQuota!.Status).toBe("APPROVED");
    expect(res.RequestedQuota!.DesiredValue).toBe(200);
  });

  test("ListRequestedServiceQuotaChangeHistory", async () => {
    const res = await client.send(new ListRequestedServiceQuotaChangeHistoryCommand({
      ServiceCode: "s3",
    }));
    expect(res.RequestedQuotas).toBeDefined();
    expect(res.RequestedQuotas!.length).toBeGreaterThanOrEqual(1);
  });

  test("Quota value updated after increase", async () => {
    const res = await client.send(new GetServiceQuotaCommand({
      ServiceCode: "s3",
      QuotaCode: "L-DC2B2D3D",
    }));
    expect(res.Quota!.Value).toBe(200);
  });

  test("GetServiceQuota - not found", async () => {
    await expect(
      client.send(new GetServiceQuotaCommand({ ServiceCode: "nonexistent", QuotaCode: "X-FAKE" })),
    ).rejects.toThrow();
  });
});
