import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  OSISClient,
  CreatePipelineCommand,
  GetPipelineCommand,
  ListPipelinesCommand,
  DeletePipelineCommand,
  StopPipelineCommand,
  StartPipelineCommand,
} from "@aws-sdk/client-osis";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new OSISClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("OSIS", () => {
  test("CreatePipeline", async () => {
    const res = await client.send(new CreatePipelineCommand({
      PipelineName: "test-pipeline",
      MinUnits: 1,
      MaxUnits: 2,
      PipelineConfigurationBody: "version: 2\nlog-pipeline:\n  source: {}\n  sink: [{}]",
    }));
    expect(res.Pipeline).toBeDefined();
    expect(res.Pipeline!.PipelineName).toBe("test-pipeline");
    expect(res.Pipeline!.Status).toBe("ACTIVE");
  });

  test("GetPipeline", async () => {
    const res = await client.send(new GetPipelineCommand({ PipelineName: "test-pipeline" }));
    expect(res.Pipeline).toBeDefined();
    expect(res.Pipeline!.PipelineName).toBe("test-pipeline");
    expect(res.Pipeline!.MinUnits).toBe(1);
  });

  test("ListPipelines", async () => {
    const res = await client.send(new ListPipelinesCommand({}));
    expect(res.Pipelines).toBeDefined();
    expect(res.Pipelines!.length).toBeGreaterThanOrEqual(1);
  });

  test("StopPipeline + StartPipeline", async () => {
    const stopRes = await client.send(new StopPipelineCommand({ PipelineName: "test-pipeline" }));
    expect(stopRes.Pipeline!.Status).toBe("STOPPED");

    const startRes = await client.send(new StartPipelineCommand({ PipelineName: "test-pipeline" }));
    expect(startRes.Pipeline!.Status).toBe("ACTIVE");
  });

  test("DeletePipeline", async () => {
    await client.send(new DeletePipelineCommand({ PipelineName: "test-pipeline" }));
    const res = await client.send(new ListPipelinesCommand({}));
    expect(res.Pipelines!.some(p => p.PipelineName === "test-pipeline")).toBe(false);
  });
});
