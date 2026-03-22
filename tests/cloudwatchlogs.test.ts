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
