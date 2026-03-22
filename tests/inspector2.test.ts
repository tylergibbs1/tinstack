import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  Inspector2Client,
  EnableCommand,
  DisableCommand,
  BatchGetAccountStatusCommand,
  ListFindingsCommand,
  CreateFilterCommand,
  ListFiltersCommand,
  DeleteFilterCommand,
  UpdateFilterCommand,
  ListCoverageCommand,
  DescribeOrganizationConfigurationCommand,
} from "@aws-sdk/client-inspector2";
import { startServer, stopServer, clientConfig } from "./helpers";

const inspector = new Inspector2Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Inspector v2", () => {
  let filterArn: string;

  test("Enable", async () => {
    const res = await inspector.send(new EnableCommand({
      resourceTypes: ["EC2", "ECR"],
    }));
    expect(res.accounts).toBeDefined();
    expect(res.accounts!.length).toBe(1);
    expect(res.accounts![0].status).toBe("ENABLED");
    expect(res.accounts![0].resourceStatus?.ec2).toBe("ENABLED");
    expect(res.accounts![0].resourceStatus?.ecr).toBe("ENABLED");
  });

  test("BatchGetAccountStatus", async () => {
    const res = await inspector.send(new BatchGetAccountStatusCommand({}));
    expect(res.accounts).toBeDefined();
    expect(res.accounts!.length).toBe(1);
    expect(res.accounts![0].state?.status).toBe("ENABLED");
    expect(res.accounts![0].resourceState?.ec2?.status).toBe("ENABLED");
    expect(res.accounts![0].resourceState?.ecr?.status).toBe("ENABLED");
  });

  test("ListFindings - empty", async () => {
    const res = await inspector.send(new ListFindingsCommand({}));
    expect(res.findings).toBeDefined();
    expect(res.findings!.length).toBe(0);
  });

  // --- Filters ---

  test("CreateFilter", async () => {
    const res = await inspector.send(new CreateFilterCommand({
      name: "test-filter",
      action: "SUPPRESS",
      description: "Test inspector filter",
      filterCriteria: {},
    }));
    filterArn = res.arn!;
    expect(filterArn).toBeDefined();
    expect(filterArn).toContain("inspector2");
  });

  test("ListFilters", async () => {
    const res = await inspector.send(new ListFiltersCommand({}));
    expect(res.filters).toBeDefined();
    expect(res.filters!.length).toBeGreaterThanOrEqual(1);
    const found = res.filters!.find((f) => f.arn === filterArn);
    expect(found).toBeDefined();
    expect(found!.name).toBe("test-filter");
    expect(found!.action).toBe("SUPPRESS");
  });

  test("UpdateFilter", async () => {
    const res = await inspector.send(new UpdateFilterCommand({
      filterArn,
      action: "NONE",
      description: "Updated filter",
    }));
    expect(res.arn).toBe(filterArn);
  });

  test("DeleteFilter", async () => {
    await inspector.send(new DeleteFilterCommand({
      arn: filterArn,
    }));
    const res = await inspector.send(new ListFiltersCommand({}));
    const found = res.filters!.find((f) => f.arn === filterArn);
    expect(found).toBeUndefined();
  });

  // --- Coverage ---

  test("ListCoverage", async () => {
    const res = await inspector.send(new ListCoverageCommand({}));
    expect(res.coveredResources).toBeDefined();
    expect(res.coveredResources!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Organization Configuration ---

  test("DescribeOrganizationConfiguration", async () => {
    const res = await inspector.send(new DescribeOrganizationConfigurationCommand({}));
    expect(res.autoEnable).toBeDefined();
  });

  // --- Disable ---

  test("Disable", async () => {
    const res = await inspector.send(new DisableCommand({
      resourceTypes: ["EC2"],
    }));
    expect(res.accounts).toBeDefined();
    expect(res.accounts![0].resourceStatus?.ec2).toBe("DISABLED");
    expect(res.accounts![0].resourceStatus?.ecr).toBe("ENABLED");
  });
});
