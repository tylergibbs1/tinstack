import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SecurityHubClient,
  EnableSecurityHubCommand,
  DescribeHubCommand,
  GetEnabledStandardsCommand,
  BatchEnableStandardsCommand,
  BatchDisableStandardsCommand,
  GetFindingsCommand,
  BatchImportFindingsCommand,
  BatchUpdateFindingsCommand,
  CreateInsightCommand,
  GetInsightsCommand,
  DeleteInsightCommand,
} from "@aws-sdk/client-securityhub";
import { startServer, stopServer, clientConfig } from "./helpers";

const sh = new SecurityHubClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Security Hub", () => {
  let insightArn: string;

  test("EnableSecurityHub", async () => {
    const res = await sh.send(new EnableSecurityHubCommand({
      EnableDefaultStandards: true,
      Tags: { env: "test" },
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("DescribeHub", async () => {
    const res = await sh.send(new DescribeHubCommand({}));
    expect(res.HubArn).toContain("securityhub");
    expect(res.HubArn).toContain("hub/default");
    expect(res.SubscribedAt).toBeDefined();
    expect(res.AutoEnableControls).toBe(true);
  });

  // --- Standards ---

  test("GetEnabledStandards", async () => {
    const res = await sh.send(new GetEnabledStandardsCommand({}));
    expect(res.StandardsSubscriptions).toBeDefined();
  });

  test("BatchEnableStandards", async () => {
    const res = await sh.send(new BatchEnableStandardsCommand({
      StandardsSubscriptionRequests: [{
        StandardsArn: "arn:aws:securityhub:::ruleset/aws-foundational-security-best-practices/v/1.0.0",
      }],
    }));
    expect(res.StandardsSubscriptions).toBeDefined();
    expect(res.StandardsSubscriptions!.length).toBeGreaterThanOrEqual(1);
    expect(res.StandardsSubscriptions![0].StandardsStatus).toBe("READY");
  });

  test("BatchDisableStandards", async () => {
    const enabled = await sh.send(new GetEnabledStandardsCommand({}));
    const subArn = enabled.StandardsSubscriptions![0].StandardsSubscriptionArn!;

    const res = await sh.send(new BatchDisableStandardsCommand({
      StandardsSubscriptionArns: [subArn],
    }));
    expect(res.StandardsSubscriptions).toBeDefined();
  });

  // --- Findings ---

  test("BatchImportFindings", async () => {
    const res = await sh.send(new BatchImportFindingsCommand({
      Findings: [{
        SchemaVersion: "2018-10-08",
        Id: "test-finding-1",
        ProductArn: "arn:aws:securityhub:us-east-1:000000000000:product/000000000000/default",
        GeneratorId: "test-generator",
        AwsAccountId: "000000000000",
        Types: ["Software and Configuration Checks"],
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
        Severity: { Label: "MEDIUM", Normalized: 50 },
        Title: "Test Finding",
        Description: "This is a test finding",
        Resources: [{ Type: "AwsEc2Instance", Id: "i-12345" }],
      }],
    }));
    expect(res.SuccessCount).toBe(1);
    expect(res.FailedCount).toBe(0);
  });

  test("GetFindings", async () => {
    const res = await sh.send(new GetFindingsCommand({}));
    expect(res.Findings).toBeDefined();
    expect(res.Findings!.length).toBeGreaterThanOrEqual(1);
    const found = res.Findings!.find((f: any) => f.Id === "test-finding-1");
    expect(found).toBeDefined();
    expect(found!.Title).toBe("Test Finding");
  });

  test("BatchUpdateFindings", async () => {
    const res = await sh.send(new BatchUpdateFindingsCommand({
      FindingIdentifiers: [{
        Id: "test-finding-1",
        ProductArn: "arn:aws:securityhub:us-east-1:000000000000:product/000000000000/default",
      }],
      Note: { Text: "Updated note", UpdatedBy: "tester" },
      Severity: { Label: "HIGH", Normalized: 70 },
    }));
    expect(res.ProcessedFindings).toBeDefined();
    expect(res.ProcessedFindings!.length).toBe(1);
    expect(res.UnprocessedFindings!.length).toBe(0);
  });

  // --- Insights ---

  test("CreateInsight", async () => {
    const res = await sh.send(new CreateInsightCommand({
      Name: "test-insight",
      Filters: {
        SeverityLabel: [{ Value: "HIGH", Comparison: "EQUALS" }],
      },
      GroupByAttribute: "ResourceId",
    }));
    insightArn = res.InsightArn!;
    expect(insightArn).toBeDefined();
    expect(insightArn).toContain("insight/custom/");
  });

  test("GetInsights", async () => {
    const res = await sh.send(new GetInsightsCommand({
      InsightArns: [insightArn],
    }));
    expect(res.Insights).toBeDefined();
    expect(res.Insights!.length).toBe(1);
    expect(res.Insights![0].Name).toBe("test-insight");
    expect(res.Insights![0].GroupByAttribute).toBe("ResourceId");
  });

  test("DeleteInsight", async () => {
    const res = await sh.send(new DeleteInsightCommand({
      InsightArn: insightArn,
    }));
    expect(res.InsightArn).toBe(insightArn);
  });

  test("DeleteInsight - not found", async () => {
    await expect(
      sh.send(new DeleteInsightCommand({ InsightArn: "arn:aws:securityhub:us-east-1:000000000000:insight/custom/nonexistent" })),
    ).rejects.toThrow();
  });
});
