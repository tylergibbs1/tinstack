import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CloudWatchClient,
  PutMetricDataCommand,
  GetMetricDataCommand,
  ListMetricsCommand,
  PutMetricAlarmCommand,
  DescribeAlarmsCommand,
  DeleteAlarmsCommand,
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
});
