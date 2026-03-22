import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CodePipelineClient,
  CreatePipelineCommand,
  GetPipelineCommand,
  ListPipelinesCommand,
  UpdatePipelineCommand,
  DeletePipelineCommand,
  GetPipelineStateCommand,
  StartPipelineExecutionCommand,
  ListPipelineExecutionsCommand,
  GetPipelineExecutionCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-codepipeline";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new CodePipelineClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("CodePipeline", () => {
  const pipelineName = "test-pipeline";
  let pipelineArn: string;
  let executionId: string;

  const pipelineDef = {
    name: pipelineName,
    roleArn: "arn:aws:iam::000000000000:role/pipeline-role",
    stages: [
      {
        name: "Source",
        actions: [{
          name: "SourceAction",
          actionTypeId: { category: "Source", owner: "AWS", provider: "S3", version: "1" },
          outputArtifacts: [{ name: "SourceOutput" }],
          configuration: { S3Bucket: "source-bucket", S3ObjectKey: "source.zip" },
        }],
      },
      {
        name: "Deploy",
        actions: [{
          name: "DeployAction",
          actionTypeId: { category: "Deploy", owner: "AWS", provider: "S3", version: "1" },
          inputArtifacts: [{ name: "SourceOutput" }],
          configuration: { BucketName: "deploy-bucket", Extract: "true" },
        }],
      },
    ],
    artifactStore: { type: "S3", location: "artifact-bucket" },
  };

  test("CreatePipeline", async () => {
    const res = await client.send(new CreatePipelineCommand({
      pipeline: pipelineDef,
      tags: [{ key: "env", value: "test" }],
    }));
    expect(res.pipeline!.name).toBe(pipelineName);
    expect(res.pipeline!.version).toBe(1);
  });

  test("GetPipeline", async () => {
    const res = await client.send(new GetPipelineCommand({ name: pipelineName }));
    expect(res.pipeline!.name).toBe(pipelineName);
    expect(res.pipeline!.stages!.length).toBe(2);
    pipelineArn = res.metadata!.pipelineArn!;
    expect(pipelineArn).toContain("codepipeline");
  });

  test("ListPipelines", async () => {
    const res = await client.send(new ListPipelinesCommand({}));
    expect(res.pipelines!.some((p) => p.name === pipelineName)).toBe(true);
  });

  test("UpdatePipeline", async () => {
    const res = await client.send(new UpdatePipelineCommand({
      pipeline: { ...pipelineDef, version: 1 },
    }));
    expect(res.pipeline!.version).toBe(2);
  });

  test("GetPipelineState", async () => {
    const res = await client.send(new GetPipelineStateCommand({ name: pipelineName }));
    expect(res.pipelineName).toBe(pipelineName);
    expect(res.stageStates!.length).toBe(2);
  });

  test("StartPipelineExecution", async () => {
    const res = await client.send(new StartPipelineExecutionCommand({ name: pipelineName }));
    executionId = res.pipelineExecutionId!;
    expect(executionId).toBeDefined();
  });

  test("ListPipelineExecutions", async () => {
    const res = await client.send(new ListPipelineExecutionsCommand({ pipelineName }));
    expect(res.pipelineExecutionSummaries!.some((e) => e.pipelineExecutionId === executionId)).toBe(true);
  });

  test("GetPipelineExecution", async () => {
    const res = await client.send(new GetPipelineExecutionCommand({
      pipelineName,
      pipelineExecutionId: executionId,
    }));
    expect(res.pipelineExecution!.pipelineExecutionId).toBe(executionId);
    expect(res.pipelineExecution!.status).toBe("InProgress");
  });

  test("TagResource and ListTagsForResource", async () => {
    await client.send(new TagResourceCommand({
      resourceArn: pipelineArn,
      tags: [{ key: "team", value: "platform" }],
    }));
    const res = await client.send(new ListTagsForResourceCommand({ resourceArn: pipelineArn }));
    expect(res.tags!.some((t) => t.key === "team" && t.value === "platform")).toBe(true);
  });

  test("UntagResource", async () => {
    await client.send(new UntagResourceCommand({
      resourceArn: pipelineArn,
      tagKeys: ["team"],
    }));
    const res = await client.send(new ListTagsForResourceCommand({ resourceArn: pipelineArn }));
    expect(res.tags!.some((t) => t.key === "team")).toBe(false);
  });

  test("DeletePipeline", async () => {
    await client.send(new DeletePipelineCommand({ name: pipelineName }));
    const res = await client.send(new ListPipelinesCommand({}));
    expect(res.pipelines!.some((p) => p.name === pipelineName)).toBe(false);
  });
});
