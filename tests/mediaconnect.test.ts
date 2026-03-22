import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  MediaConnectClient,
  CreateFlowCommand,
  DescribeFlowCommand,
  ListFlowsCommand,
  DeleteFlowCommand,
  StartFlowCommand,
  StopFlowCommand,
} from "@aws-sdk/client-mediaconnect";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new MediaConnectClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("MediaConnect", () => {
  let flowArn: string;

  test("CreateFlow", async () => {
    const res = await client.send(new CreateFlowCommand({
      Name: "test-flow",
      Source: { Name: "test-source", Protocol: "zixi-push" },
    }));
    expect(res.Flow).toBeDefined();
    expect(res.Flow!.Name).toBe("test-flow");
    expect(res.Flow!.Status).toBe("STANDBY");
    flowArn = res.Flow!.FlowArn!;
  });

  test("DescribeFlow", async () => {
    const res = await client.send(new DescribeFlowCommand({ FlowArn: flowArn }));
    expect(res.Flow).toBeDefined();
    expect(res.Flow!.Name).toBe("test-flow");
  });

  test("ListFlows", async () => {
    const res = await client.send(new ListFlowsCommand({}));
    expect(res.Flows).toBeDefined();
    expect(res.Flows!.length).toBeGreaterThanOrEqual(1);
  });

  test("StartFlow + StopFlow", async () => {
    const startRes = await client.send(new StartFlowCommand({ FlowArn: flowArn }));
    expect(startRes.Status).toBe("ACTIVE");

    const stopRes = await client.send(new StopFlowCommand({ FlowArn: flowArn }));
    expect(stopRes.Status).toBe("STANDBY");
  });

  test("DeleteFlow", async () => {
    await client.send(new DeleteFlowCommand({ FlowArn: flowArn }));
    const res = await client.send(new ListFlowsCommand({}));
    expect(res.Flows!.some(f => f.FlowArn === flowArn)).toBe(false);
  });
});
