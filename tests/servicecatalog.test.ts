import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ServiceCatalogClient,
  CreatePortfolioCommand,
  DescribePortfolioCommand,
  ListPortfoliosCommand,
  DeletePortfolioCommand,
  SearchProductsCommand,
} from "@aws-sdk/client-service-catalog";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ServiceCatalogClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Service Catalog", () => {
  let portfolioId: string;

  test("CreatePortfolio", async () => {
    const res = await client.send(new CreatePortfolioCommand({
      DisplayName: "Test Portfolio",
      ProviderName: "TestProvider",
      IdempotencyToken: "tok1",
    }));
    portfolioId = res.PortfolioDetail!.Id!;
    expect(portfolioId).toBeDefined();
    expect(res.PortfolioDetail!.DisplayName).toBe("Test Portfolio");
  });

  test("DescribePortfolio", async () => {
    const res = await client.send(new DescribePortfolioCommand({ Id: portfolioId }));
    expect(res.PortfolioDetail!.DisplayName).toBe("Test Portfolio");
  });

  test("ListPortfolios", async () => {
    const res = await client.send(new ListPortfoliosCommand({}));
    expect(res.PortfolioDetails!.length).toBeGreaterThanOrEqual(1);
  });

  test("SearchProducts", async () => {
    const res = await client.send(new SearchProductsCommand({}));
    expect(res.ProductViewSummaries).toBeDefined();
  });

  test("DeletePortfolio", async () => {
    await client.send(new DeletePortfolioCommand({ Id: portfolioId }));
    await expect(client.send(new DescribePortfolioCommand({ Id: portfolioId }))).rejects.toThrow();
  });
});
