import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  XRayClient,
  PutTraceSegmentsCommand,
  GetTraceSummariesCommand,
  BatchGetTracesCommand,
  GetServiceGraphCommand,
  CreateGroupCommand,
  GetGroupCommand,
  DeleteGroupCommand,
  CreateSamplingRuleCommand,
  GetSamplingRulesCommand,
  UpdateSamplingRuleCommand,
  DeleteSamplingRuleCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-xray";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new XRayClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("X-Ray", () => {
  let traceId: string;
  let groupArn: string;
  let samplingRuleArn: string;

  test("PutTraceSegments", async () => {
    traceId = `1-${Math.floor(Date.now() / 1000).toString(16)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const segment = JSON.stringify({
      trace_id: traceId,
      id: "abcdef1234567890",
      name: "test-service",
      start_time: Date.now() / 1000,
      end_time: Date.now() / 1000 + 0.5,
    });

    const res = await client.send(new PutTraceSegmentsCommand({
      TraceSegmentDocuments: [segment],
    }));
    expect(res.UnprocessedTraceSegments).toBeDefined();
    expect(res.UnprocessedTraceSegments!.length).toBe(0);
  });

  test("GetTraceSummaries", async () => {
    const now = Date.now() / 1000;
    const res = await client.send(new GetTraceSummariesCommand({
      StartTime: new Date((now - 3600) * 1000),
      EndTime: new Date(now * 1000),
    }));
    expect(res.TraceSummaries).toBeDefined();
    expect(res.TraceSummaries!.length).toBeGreaterThanOrEqual(1);
  });

  test("BatchGetTraces", async () => {
    const res = await client.send(new BatchGetTracesCommand({
      TraceIds: [traceId],
    }));
    expect(res.Traces).toBeDefined();
    expect(res.Traces!.length).toBe(1);
    expect(res.Traces![0].Id).toBe(traceId);
    expect(res.Traces![0].Segments!.length).toBe(1);
  });

  test("GetServiceGraph", async () => {
    const now = Date.now() / 1000;
    const res = await client.send(new GetServiceGraphCommand({
      StartTime: new Date((now - 3600) * 1000),
      EndTime: new Date(now * 1000),
    }));
    expect(res.Services).toBeDefined();
  });

  test("CreateGroup", async () => {
    const res = await client.send(new CreateGroupCommand({
      GroupName: "test-group",
      FilterExpression: 'service("test-service")',
    }));
    expect(res.Group).toBeDefined();
    expect(res.Group!.GroupName).toBe("test-group");
    groupArn = res.Group!.GroupARN!;
  });

  test("GetGroup", async () => {
    const res = await client.send(new GetGroupCommand({
      GroupName: "test-group",
    }));
    expect(res.Group).toBeDefined();
    expect(res.Group!.GroupName).toBe("test-group");
    expect(res.Group!.FilterExpression).toBe('service("test-service")');
  });

  test("CreateSamplingRule", async () => {
    const res = await client.send(new CreateSamplingRuleCommand({
      SamplingRule: {
        RuleName: "test-rule",
        ResourceARN: "*",
        Priority: 100,
        FixedRate: 0.1,
        ReservoirSize: 5,
        ServiceName: "*",
        ServiceType: "*",
        Host: "*",
        HTTPMethod: "*",
        URLPath: "*",
        Version: 1,
      },
    }));
    expect(res.SamplingRuleRecord).toBeDefined();
    expect(res.SamplingRuleRecord!.SamplingRule!.RuleName).toBe("test-rule");
    samplingRuleArn = res.SamplingRuleRecord!.SamplingRule!.RuleARN!;
  });

  test("GetSamplingRules", async () => {
    const res = await client.send(new GetSamplingRulesCommand({}));
    expect(res.SamplingRuleRecords).toBeDefined();
    const found = res.SamplingRuleRecords!.find((r) => r.SamplingRule?.RuleName === "test-rule");
    expect(found).toBeDefined();
  });

  test("UpdateSamplingRule", async () => {
    const res = await client.send(new UpdateSamplingRuleCommand({
      SamplingRuleUpdate: {
        RuleName: "test-rule",
        FixedRate: 0.2,
      },
    }));
    expect(res.SamplingRuleRecord).toBeDefined();
    expect(res.SamplingRuleRecord!.SamplingRule!.FixedRate).toBe(0.2);
  });

  test("TagResource / ListTagsForResource", async () => {
    await client.send(new TagResourceCommand({
      ResourceARN: samplingRuleArn,
      Tags: [
        { Key: "env", Value: "test" },
        { Key: "team", Value: "platform" },
      ],
    }));

    const res = await client.send(new ListTagsForResourceCommand({
      ResourceARN: samplingRuleArn,
    }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.find((t) => t.Key === "env")?.Value).toBe("test");
  });

  test("UntagResource", async () => {
    await client.send(new UntagResourceCommand({
      ResourceARN: samplingRuleArn,
      TagKeys: ["team"],
    }));

    const res = await client.send(new ListTagsForResourceCommand({
      ResourceARN: samplingRuleArn,
    }));
    expect(res.Tags!.find((t) => t.Key === "team")).toBeUndefined();
    expect(res.Tags!.find((t) => t.Key === "env")).toBeDefined();
  });

  test("DeleteSamplingRule", async () => {
    await client.send(new DeleteSamplingRuleCommand({
      RuleName: "test-rule",
    }));

    const res = await client.send(new GetSamplingRulesCommand({}));
    expect(res.SamplingRuleRecords!.find((r) => r.SamplingRule?.RuleName === "test-rule")).toBeUndefined();
  });

  test("DeleteGroup", async () => {
    await client.send(new DeleteGroupCommand({
      GroupName: "test-group",
    }));

    await expect(
      client.send(new GetGroupCommand({ GroupName: "test-group" })),
    ).rejects.toThrow();
  });
});
