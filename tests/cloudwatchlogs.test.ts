import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  DescribeLogGroupsCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  GetLogEventsCommand,
  DescribeLogStreamsCommand,
  DeleteLogStreamCommand,
  DeleteLogGroupCommand,
  PutMetricFilterCommand,
  DescribeMetricFiltersCommand,
  DeleteMetricFilterCommand,
  PutSubscriptionFilterCommand,
  DescribeSubscriptionFiltersCommand,
  DeleteSubscriptionFilterCommand,
  CreateExportTaskCommand,
  DescribeExportTasksCommand,
  CancelExportTaskCommand,
  PutResourcePolicyCommand,
  DescribeResourcePoliciesCommand,
  DeleteResourcePolicyCommand,
  PutDestinationCommand,
  DescribeDestinationsCommand,
  DeleteDestinationCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { startServer, stopServer, clientConfig } from "./helpers";

const logs = new CloudWatchLogsClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("CloudWatch Logs", () => {
  const logGroupName = "/test/app-" + Date.now();
  const logStreamName = "stream-1";

  test("CreateLogGroup", async () => {
    await logs.send(new CreateLogGroupCommand({ logGroupName }));
    const res = await logs.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName }));
    expect(res.logGroups?.some((g) => g.logGroupName === logGroupName)).toBe(true);
  });

  test("CreateLogStream", async () => {
    await logs.send(new CreateLogStreamCommand({ logGroupName, logStreamName }));
    const res = await logs.send(new DescribeLogStreamsCommand({ logGroupName }));
    expect(res.logStreams?.some((s) => s.logStreamName === logStreamName)).toBe(true);
  });

  test("PutLogEvents + GetLogEvents", async () => {
    const now = Date.now();
    await logs.send(new PutLogEventsCommand({
      logGroupName,
      logStreamName,
      logEvents: [
        { timestamp: now, message: "Log message 1" },
        { timestamp: now + 1, message: "Log message 2" },
        { timestamp: now + 2, message: "Error: something failed" },
      ],
    }));

    const res = await logs.send(new GetLogEventsCommand({ logGroupName, logStreamName }));
    expect(res.events?.length).toBe(3);
    expect(res.events![0].message).toBe("Log message 1");
  });

  test("DeleteLogStream + DeleteLogGroup", async () => {
    await logs.send(new DeleteLogStreamCommand({ logGroupName, logStreamName }));
    await logs.send(new DeleteLogGroupCommand({ logGroupName }));
    const res = await logs.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName }));
    expect(res.logGroups?.length ?? 0).toBe(0);
  });
});

describe("CloudWatch Logs - Metric Filters", () => {
  const logGroupName = "/test/metric-filter-" + Date.now();

  test("setup log group", async () => {
    await logs.send(new CreateLogGroupCommand({ logGroupName }));
  });

  test("PutMetricFilter + DescribeMetricFilters", async () => {
    await logs.send(new PutMetricFilterCommand({
      logGroupName,
      filterName: "error-filter",
      filterPattern: "ERROR",
      metricTransformations: [
        { metricName: "ErrorCount", metricNamespace: "TestApp", metricValue: "1" },
      ],
    }));

    const res = await logs.send(new DescribeMetricFiltersCommand({ logGroupName }));
    expect(res.metricFilters?.length).toBe(1);
    expect(res.metricFilters![0].filterName).toBe("error-filter");
    expect(res.metricFilters![0].filterPattern).toBe("ERROR");
    expect(res.metricFilters![0].metricTransformations?.[0].metricName).toBe("ErrorCount");
  });

  test("PutMetricFilter updates existing filter", async () => {
    await logs.send(new PutMetricFilterCommand({
      logGroupName,
      filterName: "error-filter",
      filterPattern: "WARN",
      metricTransformations: [
        { metricName: "WarnCount", metricNamespace: "TestApp", metricValue: "1" },
      ],
    }));

    const res = await logs.send(new DescribeMetricFiltersCommand({ logGroupName }));
    expect(res.metricFilters?.length).toBe(1);
    expect(res.metricFilters![0].filterPattern).toBe("WARN");
  });

  test("DeleteMetricFilter", async () => {
    await logs.send(new DeleteMetricFilterCommand({ logGroupName, filterName: "error-filter" }));
    const res = await logs.send(new DescribeMetricFiltersCommand({ logGroupName }));
    expect(res.metricFilters?.length ?? 0).toBe(0);
  });

  test("DeleteMetricFilter for nonexistent filter throws", async () => {
    try {
      await logs.send(new DeleteMetricFilterCommand({ logGroupName, filterName: "nope" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("cleanup", async () => {
    await logs.send(new DeleteLogGroupCommand({ logGroupName }));
  });
});

describe("CloudWatch Logs - Subscription Filters", () => {
  const logGroupName = "/test/sub-filter-" + Date.now();

  test("setup log group", async () => {
    await logs.send(new CreateLogGroupCommand({ logGroupName }));
  });

  test("PutSubscriptionFilter + DescribeSubscriptionFilters", async () => {
    await logs.send(new PutSubscriptionFilterCommand({
      logGroupName,
      filterName: "my-sub",
      filterPattern: "",
      destinationArn: "arn:aws:lambda:us-east-1:000000000000:function:processor",
      roleArn: "arn:aws:iam::000000000000:role/logs-role",
    }));

    const res = await logs.send(new DescribeSubscriptionFiltersCommand({ logGroupName }));
    expect(res.subscriptionFilters?.length).toBe(1);
    expect(res.subscriptionFilters![0].filterName).toBe("my-sub");
    expect(res.subscriptionFilters![0].destinationArn).toBe("arn:aws:lambda:us-east-1:000000000000:function:processor");
  });

  test("DeleteSubscriptionFilter", async () => {
    await logs.send(new DeleteSubscriptionFilterCommand({ logGroupName, filterName: "my-sub" }));
    const res = await logs.send(new DescribeSubscriptionFiltersCommand({ logGroupName }));
    expect(res.subscriptionFilters?.length ?? 0).toBe(0);
  });

  test("DeleteSubscriptionFilter for nonexistent filter throws", async () => {
    try {
      await logs.send(new DeleteSubscriptionFilterCommand({ logGroupName, filterName: "nope" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("cleanup", async () => {
    await logs.send(new DeleteLogGroupCommand({ logGroupName }));
  });
});

describe("CloudWatch Logs - Export Tasks", () => {
  const logGroupName = "/test/export-" + Date.now();

  test("setup log group", async () => {
    await logs.send(new CreateLogGroupCommand({ logGroupName }));
  });

  test("CreateExportTask + DescribeExportTasks", async () => {
    const now = Date.now();
    const res = await logs.send(new CreateExportTaskCommand({
      logGroupName,
      from: now - 3600000,
      to: now,
      destination: "my-export-bucket",
      destinationPrefix: "exports/",
    }));
    expect(res.taskId).toBeDefined();

    const desc = await logs.send(new DescribeExportTasksCommand({ taskId: res.taskId }));
    expect(desc.exportTasks?.length).toBe(1);
    expect(desc.exportTasks![0].status?.code).toBe("COMPLETED");
    expect(desc.exportTasks![0].logGroupName).toBe(logGroupName);
  });

  test("CancelExportTask", async () => {
    const res = await logs.send(new CreateExportTaskCommand({
      logGroupName,
      from: Date.now() - 3600000,
      to: Date.now(),
      destination: "my-bucket",
    }));

    await logs.send(new CancelExportTaskCommand({ taskId: res.taskId! }));
    const desc = await logs.send(new DescribeExportTasksCommand({ taskId: res.taskId }));
    expect(desc.exportTasks![0].status?.code).toBe("CANCELLED");
  });

  test("cleanup", async () => {
    await logs.send(new DeleteLogGroupCommand({ logGroupName }));
  });
});

describe("CloudWatch Logs - Resource Policies", () => {
  test("PutResourcePolicy + DescribeResourcePolicies", async () => {
    const policyDoc = JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "es.amazonaws.com" }, Action: ["logs:PutLogEvents"], Resource: "*" }] });

    const res = await logs.send(new PutResourcePolicyCommand({
      policyName: "test-policy",
      policyDocument: policyDoc,
    }));
    expect(res.resourcePolicy?.policyName).toBe("test-policy");

    const desc = await logs.send(new DescribeResourcePoliciesCommand({}));
    expect(desc.resourcePolicies?.some((p) => p.policyName === "test-policy")).toBe(true);
  });

  test("DeleteResourcePolicy", async () => {
    await logs.send(new DeleteResourcePolicyCommand({ policyName: "test-policy" }));
    const desc = await logs.send(new DescribeResourcePoliciesCommand({}));
    expect(desc.resourcePolicies?.some((p) => p.policyName === "test-policy")).toBe(false);
  });

  test("DeleteResourcePolicy nonexistent throws", async () => {
    try {
      await logs.send(new DeleteResourcePolicyCommand({ policyName: "nope" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });
});

describe("CloudWatch Logs - Destinations", () => {
  test("PutDestination + DescribeDestinations", async () => {
    const res = await logs.send(new PutDestinationCommand({
      destinationName: "test-dest",
      targetArn: "arn:aws:kinesis:us-east-1:000000000000:stream/my-stream",
      roleArn: "arn:aws:iam::000000000000:role/logs-role",
    }));
    expect(res.destination?.destinationName).toBe("test-dest");
    expect(res.destination?.arn).toContain("destination:");

    const desc = await logs.send(new DescribeDestinationsCommand({}));
    expect(desc.destinations?.some((d) => d.destinationName === "test-dest")).toBe(true);
  });

  test("DeleteDestination", async () => {
    await logs.send(new DeleteDestinationCommand({ destinationName: "test-dest" }));
    const desc = await logs.send(new DescribeDestinationsCommand({}));
    expect(desc.destinations?.some((d) => d.destinationName === "test-dest")).toBe(false);
  });

  test("DeleteDestination nonexistent throws", async () => {
    try {
      await logs.send(new DeleteDestinationCommand({ destinationName: "nope" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });
});
