import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CloudWatchClient,
  PutMetricDataCommand,
  GetMetricDataCommand,
  ListMetricsCommand,
  PutMetricAlarmCommand,
  DescribeAlarmsCommand,
  DeleteAlarmsCommand,
  SetAlarmStateCommand,
  EnableAlarmActionsCommand,
  DisableAlarmActionsCommand,
  DescribeAlarmsForMetricCommand,
  PutDashboardCommand,
  GetDashboardCommand,
  ListDashboardsCommand,
  DeleteDashboardsCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
  PutInsightRuleCommand,
  DescribeInsightRulesCommand,
  EnableInsightRulesCommand,
  DisableInsightRulesCommand,
  DeleteInsightRulesCommand,
} from "@aws-sdk/client-cloudwatch";
import { startServer, stopServer, clientConfig } from "./helpers";

const cw = new CloudWatchClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("CloudWatch Metrics", () => {
  const namespace = "TestApp";
  const now = Math.floor(Date.now() / 1000);

  test("PutMetricData", async () => {
    await cw.send(new PutMetricDataCommand({
      Namespace: namespace,
      MetricData: [
        { MetricName: "RequestCount", Value: 100, Unit: "Count", Dimensions: [{ Name: "API", Value: "/users" }] },
        { MetricName: "RequestCount", Value: 200, Unit: "Count", Dimensions: [{ Name: "API", Value: "/users" }] },
        { MetricName: "Latency", Value: 45.5, Unit: "Milliseconds" },
      ],
    }));
  });

  test("ListMetrics", async () => {
    const res = await cw.send(new ListMetricsCommand({ Namespace: namespace }));
    expect(res.Metrics?.length).toBeGreaterThanOrEqual(2);
    expect(res.Metrics?.some((m) => m.MetricName === "RequestCount")).toBe(true);
    expect(res.Metrics?.some((m) => m.MetricName === "Latency")).toBe(true);
  });

  test("GetMetricData", async () => {
    const res = await cw.send(new GetMetricDataCommand({
      StartTime: new Date((now - 3600) * 1000),
      EndTime: new Date((now + 3600) * 1000),
      MetricDataQueries: [{
        Id: "m1",
        MetricStat: {
          Metric: { Namespace: namespace, MetricName: "RequestCount", Dimensions: [{ Name: "API", Value: "/users" }] },
          Period: 60,
          Stat: "Sum",
        },
      }],
    }));
    expect(res.MetricDataResults?.length).toBe(1);
    expect(res.MetricDataResults![0].Values?.length).toBeGreaterThan(0);
  });

  test("PutMetricAlarm + DescribeAlarms + DeleteAlarms", async () => {
    await cw.send(new PutMetricAlarmCommand({
      AlarmName: "HighLatency",
      MetricName: "Latency",
      Namespace: namespace,
      Statistic: "Average",
      Period: 60,
      EvaluationPeriods: 1,
      Threshold: 100,
      ComparisonOperator: "GreaterThanThreshold",
    }));

    const alarms = await cw.send(new DescribeAlarmsCommand({ AlarmNames: ["HighLatency"] }));
    expect(alarms.MetricAlarms?.length).toBe(1);
    expect(alarms.MetricAlarms![0].AlarmName).toBe("HighLatency");
    expect(alarms.MetricAlarms![0].Threshold).toBe(100);

    await cw.send(new DeleteAlarmsCommand({ AlarmNames: ["HighLatency"] }));
    const after = await cw.send(new DescribeAlarmsCommand({ AlarmNames: ["HighLatency"] }));
    expect(after.MetricAlarms?.length).toBe(0);
  });

  // --- Alarm State Management ---

  test("SetAlarmState", async () => {
    await cw.send(new PutMetricAlarmCommand({
      AlarmName: "StateTestAlarm",
      MetricName: "Latency",
      Namespace: namespace,
      Statistic: "Average",
      Period: 60,
      EvaluationPeriods: 1,
      Threshold: 50,
      ComparisonOperator: "GreaterThanThreshold",
    }));

    await cw.send(new SetAlarmStateCommand({
      AlarmName: "StateTestAlarm",
      StateValue: "ALARM",
      StateReason: "Manual test trigger",
    }));

    const alarms = await cw.send(new DescribeAlarmsCommand({ AlarmNames: ["StateTestAlarm"] }));
    expect(alarms.MetricAlarms![0].StateValue).toBe("ALARM");
    expect(alarms.MetricAlarms![0].StateReason).toBe("Manual test trigger");
  });

  test("DisableAlarmActions + EnableAlarmActions", async () => {
    await cw.send(new DisableAlarmActionsCommand({ AlarmNames: ["StateTestAlarm"] }));

    let alarms = await cw.send(new DescribeAlarmsCommand({ AlarmNames: ["StateTestAlarm"] }));
    expect(alarms.MetricAlarms![0].ActionsEnabled).toBe(false);

    await cw.send(new EnableAlarmActionsCommand({ AlarmNames: ["StateTestAlarm"] }));

    alarms = await cw.send(new DescribeAlarmsCommand({ AlarmNames: ["StateTestAlarm"] }));
    expect(alarms.MetricAlarms![0].ActionsEnabled).toBe(true);
  });

  test("DescribeAlarmsForMetric", async () => {
    const res = await cw.send(new DescribeAlarmsForMetricCommand({
      MetricName: "Latency",
      Namespace: namespace,
    }));
    expect(res.MetricAlarms!.length).toBeGreaterThanOrEqual(1);
    expect(res.MetricAlarms!.some((a) => a.AlarmName === "StateTestAlarm")).toBe(true);
  });

  test("DescribeAlarmsForMetric — no match", async () => {
    const res = await cw.send(new DescribeAlarmsForMetricCommand({
      MetricName: "NonExistentMetric",
      Namespace: namespace,
    }));
    expect(res.MetricAlarms!.length).toBe(0);
  });

  // --- Cleanup alarm ---
  test("Delete alarm used in state tests", async () => {
    await cw.send(new DeleteAlarmsCommand({ AlarmNames: ["StateTestAlarm"] }));
  });

  // --- Dashboards ---

  test("PutDashboard + GetDashboard", async () => {
    const body = JSON.stringify({ widgets: [{ type: "metric", properties: {} }] });
    await cw.send(new PutDashboardCommand({
      DashboardName: "TestDashboard",
      DashboardBody: body,
    }));

    const res = await cw.send(new GetDashboardCommand({
      DashboardName: "TestDashboard",
    }));
    expect(res.DashboardName).toBe("TestDashboard");
    expect(res.DashboardArn).toContain("dashboard/TestDashboard");
    expect(res.DashboardBody).toBe(body);
  });

  test("PutDashboard — update existing", async () => {
    const newBody = JSON.stringify({ widgets: [{ type: "text", properties: {} }] });
    await cw.send(new PutDashboardCommand({
      DashboardName: "TestDashboard",
      DashboardBody: newBody,
    }));

    const res = await cw.send(new GetDashboardCommand({
      DashboardName: "TestDashboard",
    }));
    expect(res.DashboardBody).toBe(newBody);
  });

  test("ListDashboards", async () => {
    await cw.send(new PutDashboardCommand({
      DashboardName: "AnotherDashboard",
      DashboardBody: "{}",
    }));

    const res = await cw.send(new ListDashboardsCommand({}));
    expect(res.DashboardEntries!.length).toBeGreaterThanOrEqual(2);
    expect(res.DashboardEntries!.some((d) => d.DashboardName === "TestDashboard")).toBe(true);
    expect(res.DashboardEntries!.some((d) => d.DashboardName === "AnotherDashboard")).toBe(true);
  });

  test("ListDashboards — with prefix", async () => {
    const res = await cw.send(new ListDashboardsCommand({
      DashboardNamePrefix: "Test",
    }));
    expect(res.DashboardEntries!.length).toBe(1);
    expect(res.DashboardEntries![0].DashboardName).toBe("TestDashboard");
  });

  test("DeleteDashboards", async () => {
    await cw.send(new DeleteDashboardsCommand({
      DashboardNames: ["TestDashboard", "AnotherDashboard"],
    }));

    const res = await cw.send(new ListDashboardsCommand({}));
    expect(res.DashboardEntries!.some((d) => d.DashboardName === "TestDashboard")).toBe(false);
  });

  // --- Tagging ---

  test("TagResource + ListTagsForResource", async () => {
    // Create an alarm to tag
    await cw.send(new PutMetricAlarmCommand({
      AlarmName: "TagTestAlarm",
      MetricName: "Latency",
      Namespace: namespace,
      Statistic: "Average",
      Period: 60,
      EvaluationPeriods: 1,
      Threshold: 100,
      ComparisonOperator: "GreaterThanThreshold",
    }));

    const alarms = await cw.send(new DescribeAlarmsCommand({ AlarmNames: ["TagTestAlarm"] }));
    const alarmArn = alarms.MetricAlarms![0].AlarmArn!;

    await cw.send(new TagResourceCommand({
      ResourceARN: alarmArn,
      Tags: [
        { Key: "env", Value: "test" },
        { Key: "team", Value: "ops" },
      ],
    }));

    const tags = await cw.send(new ListTagsForResourceCommand({ ResourceARN: alarmArn }));
    expect(tags.Tags!.length).toBe(2);
    expect(tags.Tags!.some((t) => t.Key === "env" && t.Value === "test")).toBe(true);
  });

  test("UntagResource", async () => {
    const alarms = await cw.send(new DescribeAlarmsCommand({ AlarmNames: ["TagTestAlarm"] }));
    const alarmArn = alarms.MetricAlarms![0].AlarmArn!;

    await cw.send(new UntagResourceCommand({
      ResourceARN: alarmArn,
      TagKeys: ["team"],
    }));

    const tags = await cw.send(new ListTagsForResourceCommand({ ResourceARN: alarmArn }));
    expect(tags.Tags!.length).toBe(1);
    expect(tags.Tags![0].Key).toBe("env");

    await cw.send(new DeleteAlarmsCommand({ AlarmNames: ["TagTestAlarm"] }));
  });

  // --- Insight Rules ---

  test("PutInsightRule + DescribeInsightRules", async () => {
    await cw.send(new PutInsightRuleCommand({
      RuleName: "TestRule",
      RuleDefinition: JSON.stringify({ Schema: { Name: "CloudWatchLogRule", Version: 1 } }),
      RuleState: "ENABLED",
    }));

    const res = await cw.send(new DescribeInsightRulesCommand({}));
    expect(res.InsightRules!.some((r) => r.Name === "TestRule")).toBe(true);
    expect(res.InsightRules!.find((r) => r.Name === "TestRule")!.State).toBe("ENABLED");
  });

  test("DisableInsightRules", async () => {
    await cw.send(new DisableInsightRulesCommand({ RuleNames: ["TestRule"] }));
    const res = await cw.send(new DescribeInsightRulesCommand({}));
    expect(res.InsightRules!.find((r) => r.Name === "TestRule")!.State).toBe("DISABLED");
  });

  test("EnableInsightRules", async () => {
    await cw.send(new EnableInsightRulesCommand({ RuleNames: ["TestRule"] }));
    const res = await cw.send(new DescribeInsightRulesCommand({}));
    expect(res.InsightRules!.find((r) => r.Name === "TestRule")!.State).toBe("ENABLED");
  });

  test("DeleteInsightRules", async () => {
    await cw.send(new DeleteInsightRulesCommand({ RuleNames: ["TestRule"] }));
    const res = await cw.send(new DescribeInsightRulesCommand({}));
    expect(res.InsightRules!.some((r) => r.Name === "TestRule")).toBe(false);
  });
});
