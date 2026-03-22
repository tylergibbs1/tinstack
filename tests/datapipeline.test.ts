import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  DataPipelineClient,
  CreatePipelineCommand,
  ListPipelinesCommand,
  DescribePipelinesCommand,
  DeletePipelineCommand,
  PutPipelineDefinitionCommand,
  GetPipelineDefinitionCommand,
} from "@aws-sdk/client-data-pipeline";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new DataPipelineClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("DataPipeline", () => {
  let pipelineId: string;

  test("CreatePipeline", async () => {
    const res = await client.send(new CreatePipelineCommand({
      name: "test-pipeline",
      uniqueId: "test-unique-id",
    }));
    expect(res.pipelineId).toBeDefined();
    pipelineId = res.pipelineId!;
  });

  test("ListPipelines", async () => {
    const res = await client.send(new ListPipelinesCommand({}));
    expect(res.pipelineIdList).toBeDefined();
    expect(res.pipelineIdList!.some(p => p.id === pipelineId)).toBe(true);
  });

  test("DescribePipelines", async () => {
    const res = await client.send(new DescribePipelinesCommand({
      pipelineIds: [pipelineId],
    }));
    expect(res.pipelineDescriptionList).toBeDefined();
    expect(res.pipelineDescriptionList![0].name).toBe("test-pipeline");
  });

  test("PutPipelineDefinition + GetPipelineDefinition", async () => {
    await client.send(new PutPipelineDefinitionCommand({
      pipelineId,
      pipelineObjects: [{ id: "Default", name: "Default", fields: [{ key: "type", stringValue: "Default" }] }],
    }));

    const res = await client.send(new GetPipelineDefinitionCommand({ pipelineId }));
    expect(res.pipelineObjects).toBeDefined();
  });

  test("DeletePipeline", async () => {
    await client.send(new DeletePipelineCommand({ pipelineId }));
    const res = await client.send(new ListPipelinesCommand({}));
    expect(res.pipelineIdList!.some(p => p.id === pipelineId)).toBe(false);
  });
});
