import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  QuickSightClient,
  CreateDataSetCommand,
  DescribeDataSetCommand,
  ListDataSetsCommand,
  DeleteDataSetCommand,
  CreateDataSourceCommand,
  DescribeDataSourceCommand,
  ListDataSourcesCommand,
  DeleteDataSourceCommand,
  CreateDashboardCommand,
  DescribeDashboardCommand,
  ListDashboardsCommand,
  DeleteDashboardCommand,
  CreateAnalysisCommand,
  DescribeAnalysisCommand,
  ListAnalysesCommand,
  CreateGroupCommand,
  DescribeGroupCommand,
  ListGroupsCommand,
  DeleteGroupCommand,
  CreateGroupMembershipCommand,
  ListGroupMembershipsCommand,
} from "@aws-sdk/client-quicksight";
import { startServer, stopServer, clientConfig } from "./helpers";

const qs = new QuickSightClient(clientConfig);
const ACCOUNT_ID = "000000000000";

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("QuickSight", () => {
  // --- DataSets ---
  test("CreateDataSet + DescribeDataSet", async () => {
    const create = await qs.send(new CreateDataSetCommand({
      AwsAccountId: ACCOUNT_ID,
      DataSetId: "ds-test-1",
      Name: "Test DataSet",
      ImportMode: "SPICE",
      PhysicalTableMap: {},
    }));
    expect(create.Arn).toContain("dataset/ds-test-1");

    const desc = await qs.send(new DescribeDataSetCommand({
      AwsAccountId: ACCOUNT_ID,
      DataSetId: "ds-test-1",
    }));
    expect(desc.DataSet).toBeDefined();
    expect(desc.DataSet!.Name).toBe("Test DataSet");
  });

  test("ListDataSets", async () => {
    const res = await qs.send(new ListDataSetsCommand({
      AwsAccountId: ACCOUNT_ID,
    }));
    expect(res.DataSetSummaries!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteDataSet", async () => {
    const res = await qs.send(new DeleteDataSetCommand({
      AwsAccountId: ACCOUNT_ID,
      DataSetId: "ds-test-1",
    }));
    expect(res.DataSetId).toBe("ds-test-1");
  });

  // --- DataSources ---
  test("CreateDataSource + DescribeDataSource", async () => {
    const create = await qs.send(new CreateDataSourceCommand({
      AwsAccountId: ACCOUNT_ID,
      DataSourceId: "dsrc-test-1",
      Name: "Test DataSource",
      Type: "S3",
    }));
    expect(create.Arn).toContain("datasource/dsrc-test-1");

    const desc = await qs.send(new DescribeDataSourceCommand({
      AwsAccountId: ACCOUNT_ID,
      DataSourceId: "dsrc-test-1",
    }));
    expect(desc.DataSource).toBeDefined();
    expect(desc.DataSource!.Name).toBe("Test DataSource");
  });

  test("ListDataSources", async () => {
    const res = await qs.send(new ListDataSourcesCommand({
      AwsAccountId: ACCOUNT_ID,
    }));
    expect(res.DataSources!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteDataSource", async () => {
    const res = await qs.send(new DeleteDataSourceCommand({
      AwsAccountId: ACCOUNT_ID,
      DataSourceId: "dsrc-test-1",
    }));
    expect(res.DataSourceId).toBe("dsrc-test-1");
  });

  // --- Dashboards ---
  test("CreateDashboard + DescribeDashboard", async () => {
    const create = await qs.send(new CreateDashboardCommand({
      AwsAccountId: ACCOUNT_ID,
      DashboardId: "dash-test-1",
      Name: "Test Dashboard",
      SourceEntity: {
        SourceTemplate: {
          DataSetReferences: [],
          Arn: "arn:aws:quicksight:us-east-1:000000000000:template/test",
        },
      },
    }));
    expect(create.Arn).toContain("dashboard/dash-test-1");

    const desc = await qs.send(new DescribeDashboardCommand({
      AwsAccountId: ACCOUNT_ID,
      DashboardId: "dash-test-1",
    }));
    expect(desc.Dashboard).toBeDefined();
    expect(desc.Dashboard!.Name).toBe("Test Dashboard");
  });

  test("ListDashboards", async () => {
    const res = await qs.send(new ListDashboardsCommand({
      AwsAccountId: ACCOUNT_ID,
    }));
    expect(res.DashboardSummaryList!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteDashboard", async () => {
    await qs.send(new DeleteDashboardCommand({
      AwsAccountId: ACCOUNT_ID,
      DashboardId: "dash-test-1",
    }));
    const res = await qs.send(new ListDashboardsCommand({
      AwsAccountId: ACCOUNT_ID,
    }));
    expect(res.DashboardSummaryList!.some((d) => d.DashboardId === "dash-test-1")).toBe(false);
  });

  // --- Analyses ---
  test("CreateAnalysis + DescribeAnalysis", async () => {
    const create = await qs.send(new CreateAnalysisCommand({
      AwsAccountId: ACCOUNT_ID,
      AnalysisId: "analysis-test-1",
      Name: "Test Analysis",
      SourceEntity: {
        SourceTemplate: {
          DataSetReferences: [],
          Arn: "arn:aws:quicksight:us-east-1:000000000000:template/test",
        },
      },
    }));
    expect(create.Arn).toContain("analysis/analysis-test-1");

    const desc = await qs.send(new DescribeAnalysisCommand({
      AwsAccountId: ACCOUNT_ID,
      AnalysisId: "analysis-test-1",
    }));
    expect(desc.Analysis).toBeDefined();
    expect(desc.Analysis!.Name).toBe("Test Analysis");
  });

  test("ListAnalyses", async () => {
    const res = await qs.send(new ListAnalysesCommand({
      AwsAccountId: ACCOUNT_ID,
    }));
    expect(res.AnalysisSummaryList!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Groups ---
  test("CreateGroup + DescribeGroup", async () => {
    const create = await qs.send(new CreateGroupCommand({
      AwsAccountId: ACCOUNT_ID,
      Namespace: "default",
      GroupName: "test-group",
      Description: "A test group",
    }));
    expect(create.Group).toBeDefined();
    expect(create.Group!.GroupName).toBe("test-group");

    const desc = await qs.send(new DescribeGroupCommand({
      AwsAccountId: ACCOUNT_ID,
      Namespace: "default",
      GroupName: "test-group",
    }));
    expect(desc.Group!.GroupName).toBe("test-group");
    expect(desc.Group!.Description).toBe("A test group");
  });

  test("ListGroups", async () => {
    const res = await qs.send(new ListGroupsCommand({
      AwsAccountId: ACCOUNT_ID,
      Namespace: "default",
    }));
    expect(res.GroupList!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateGroupMembership + ListGroupMemberships", async () => {
    await qs.send(new CreateGroupMembershipCommand({
      AwsAccountId: ACCOUNT_ID,
      Namespace: "default",
      GroupName: "test-group",
      MemberName: "user1",
    }));

    const res = await qs.send(new ListGroupMembershipsCommand({
      AwsAccountId: ACCOUNT_ID,
      Namespace: "default",
      GroupName: "test-group",
    }));
    expect(res.GroupMemberList!.length).toBe(1);
    expect(res.GroupMemberList![0].MemberName).toBe("user1");
  });

  test("DeleteGroup", async () => {
    await qs.send(new DeleteGroupCommand({
      AwsAccountId: ACCOUNT_ID,
      Namespace: "default",
      GroupName: "test-group",
    }));
    const res = await qs.send(new ListGroupsCommand({
      AwsAccountId: ACCOUNT_ID,
      Namespace: "default",
    }));
    expect(res.GroupList!.some((g) => g.GroupName === "test-group")).toBe(false);
  });
});
