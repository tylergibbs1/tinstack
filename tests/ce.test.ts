import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostForecastCommand,
  GetDimensionValuesCommand,
  GetTagsCommand,
  CreateCostCategoryDefinitionCommand,
  DescribeCostCategoryDefinitionCommand,
  ListCostCategoryDefinitionsCommand,
  DeleteCostCategoryDefinitionCommand,
  UpdateCostCategoryDefinitionCommand,
} from "@aws-sdk/client-cost-explorer";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new CostExplorerClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Cost Explorer", () => {
  let costCategoryArn: string;

  test("GetCostAndUsage", async () => {
    const res = await client.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: "2024-01-01", End: "2024-02-01" },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
    }));
    expect(res.ResultsByTime).toBeDefined();
    expect(res.ResultsByTime!.length).toBe(1);
    expect(res.ResultsByTime![0].Total).toBeDefined();
    expect(res.ResultsByTime![0].Total!["UnblendedCost"]).toBeDefined();
    expect(res.ResultsByTime![0].Total!["UnblendedCost"].Amount).toBeDefined();
  });

  test("GetCostForecast", async () => {
    const res = await client.send(new GetCostForecastCommand({
      TimePeriod: { Start: "2024-02-01", End: "2024-03-01" },
      Metric: "UNBLENDED_COST",
      Granularity: "MONTHLY",
    }));
    expect(res.Total).toBeDefined();
    expect(res.Total!.Amount).toBeDefined();
    expect(res.ForecastResultsByTime).toBeDefined();
  });

  test("GetDimensionValues", async () => {
    const res = await client.send(new GetDimensionValuesCommand({
      TimePeriod: { Start: "2024-01-01", End: "2024-02-01" },
      Dimension: "SERVICE",
    }));
    expect(res.DimensionValues).toBeDefined();
    expect(res.DimensionValues!.length).toBeGreaterThanOrEqual(1);
    expect(res.ReturnSize).toBeDefined();
  });

  test("GetTags", async () => {
    const res = await client.send(new GetTagsCommand({
      TimePeriod: { Start: "2024-01-01", End: "2024-02-01" },
    }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.length).toBeGreaterThanOrEqual(1);
    expect(res.ReturnSize).toBeDefined();
  });

  test("CreateCostCategoryDefinition", async () => {
    const res = await client.send(new CreateCostCategoryDefinitionCommand({
      Name: "test-category",
      RuleVersion: "CostCategoryExpression.v1",
      Rules: [
        {
          Value: "Engineering",
          Rule: { Dimensions: { Key: "LINKED_ACCOUNT", Values: ["123456789012"] } },
        },
      ],
    }));
    expect(res.CostCategoryArn).toBeDefined();
    costCategoryArn = res.CostCategoryArn!;
  });

  test("DescribeCostCategoryDefinition", async () => {
    const res = await client.send(new DescribeCostCategoryDefinitionCommand({
      CostCategoryArn: costCategoryArn,
    }));
    expect(res.CostCategory).toBeDefined();
    expect(res.CostCategory!.Name).toBe("test-category");
    expect(res.CostCategory!.Rules!.length).toBe(1);
  });

  test("ListCostCategoryDefinitions", async () => {
    const res = await client.send(new ListCostCategoryDefinitionsCommand({}));
    expect(res.CostCategoryReferences).toBeDefined();
    expect(res.CostCategoryReferences!.length).toBeGreaterThanOrEqual(1);
    const found = res.CostCategoryReferences!.find((c) => c.CostCategoryArn === costCategoryArn);
    expect(found).toBeDefined();
    expect(found!.Name).toBe("test-category");
  });

  test("UpdateCostCategoryDefinition", async () => {
    const res = await client.send(new UpdateCostCategoryDefinitionCommand({
      CostCategoryArn: costCategoryArn,
      RuleVersion: "CostCategoryExpression.v1",
      Rules: [
        {
          Value: "Platform",
          Rule: { Dimensions: { Key: "SERVICE", Values: ["Amazon S3"] } },
        },
      ],
    }));
    expect(res.CostCategoryArn).toBe(costCategoryArn);

    const desc = await client.send(new DescribeCostCategoryDefinitionCommand({
      CostCategoryArn: costCategoryArn,
    }));
    expect(desc.CostCategory!.Rules![0].Value).toBe("Platform");
  });

  test("DeleteCostCategoryDefinition", async () => {
    const res = await client.send(new DeleteCostCategoryDefinitionCommand({
      CostCategoryArn: costCategoryArn,
    }));
    expect(res.CostCategoryArn).toBe(costCategoryArn);

    await expect(
      client.send(new DescribeCostCategoryDefinitionCommand({
        CostCategoryArn: costCategoryArn,
      })),
    ).rejects.toThrow();
  });
});
