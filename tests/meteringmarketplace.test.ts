import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  MarketplaceMeteringClient,
  MeterUsageCommand,
  BatchMeterUsageCommand,
  ResolveCustomerCommand,
} from "@aws-sdk/client-marketplace-metering";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new MarketplaceMeteringClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("MeteringMarketplace", () => {
  test("MeterUsage", async () => {
    const res = await client.send(new MeterUsageCommand({
      ProductCode: "test-product",
      Timestamp: new Date(),
      UsageDimension: "requests",
      UsageQuantity: 100,
    }));
    expect(res.MeteringRecordId).toBeDefined();
  });

  test("BatchMeterUsage", async () => {
    const res = await client.send(new BatchMeterUsageCommand({
      ProductCode: "test-product",
      UsageRecords: [
        { Timestamp: new Date(), CustomerIdentifier: "cust-1", Dimension: "requests", Quantity: 50 },
      ],
    }));
    expect(res.Results).toBeDefined();
    expect(res.Results!.length).toBeGreaterThanOrEqual(1);
  });

  test("ResolveCustomer", async () => {
    const res = await client.send(new ResolveCustomerCommand({
      RegistrationToken: "test-token-123",
    }));
    expect(res.CustomerIdentifier).toBeDefined();
    expect(res.ProductCode).toBeDefined();
  });
});
