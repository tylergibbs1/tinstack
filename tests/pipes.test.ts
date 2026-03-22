import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  PipesClient,
  CreatePipeCommand,
  DescribePipeCommand,
  ListPipesCommand,
  UpdatePipeCommand,
  DeletePipeCommand,
  StartPipeCommand,
  StopPipeCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-pipes";
import { startServer, stopServer, clientConfig } from "./helpers";

const pipes = new PipesClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("EventBridge Pipes", () => {
  let pipeArn: string;

  test("CreatePipe", async () => {
    const res = await pipes.send(
      new CreatePipeCommand({
        Name: "test-pipe",
        Source: "arn:aws:sqs:us-east-1:000000000000:source-queue",
        Target: "arn:aws:sqs:us-east-1:000000000000:target-queue",
        RoleArn: "arn:aws:iam::000000000000:role/pipe-role",
        Description: "Test pipe",
        DesiredState: "RUNNING",
      }),
    );
    expect(res.Arn).toContain("pipe/test-pipe");
    expect(res.Name).toBe("test-pipe");
    expect(res.DesiredState).toBe("RUNNING");
    expect(res.CurrentState).toBe("RUNNING");
    pipeArn = res.Arn!;
  });

  test("DescribePipe", async () => {
    const res = await pipes.send(
      new DescribePipeCommand({ Name: "test-pipe" }),
    );
    expect(res.Name).toBe("test-pipe");
    expect(res.Source).toContain("source-queue");
    expect(res.Target).toContain("target-queue");
    expect(res.Description).toBe("Test pipe");
  });

  test("ListPipes", async () => {
    const res = await pipes.send(new ListPipesCommand({}));
    expect(res.Pipes!.length).toBeGreaterThanOrEqual(1);
    expect(res.Pipes!.some((p) => p.Name === "test-pipe")).toBe(true);
  });

  test("UpdatePipe", async () => {
    const res = await pipes.send(
      new UpdatePipeCommand({
        Name: "test-pipe",
        RoleArn: "arn:aws:iam::000000000000:role/pipe-role",
        Description: "Updated pipe",
      }),
    );
    expect(res.Name).toBe("test-pipe");
    const desc = await pipes.send(
      new DescribePipeCommand({ Name: "test-pipe" }),
    );
    expect(desc.Description).toBe("Updated pipe");
  });

  test("StopPipe", async () => {
    const res = await pipes.send(new StopPipeCommand({ Name: "test-pipe" }));
    expect(res.DesiredState).toBe("STOPPED");
    expect(res.CurrentState).toBe("STOPPING");
  });

  test("StartPipe", async () => {
    // After stop, pipe is in STOPPING state. Start should set desired to RUNNING.
    const res = await pipes.send(new StartPipeCommand({ Name: "test-pipe" }));
    expect(res.DesiredState).toBe("RUNNING");
  });

  // --- Tags ---

  test("TagResource", async () => {
    await pipes.send(
      new TagResourceCommand({
        resourceArn: pipeArn,
        tags: { env: "test" },
      }),
    );
  });

  test("ListTagsForResource", async () => {
    const res = await pipes.send(
      new ListTagsForResourceCommand({ resourceArn: pipeArn }),
    );
    expect(res.tags?.env).toBe("test");
  });

  test("UntagResource", async () => {
    await pipes.send(
      new UntagResourceCommand({
        resourceArn: pipeArn,
        tagKeys: ["env"],
      }),
    );
    const res = await pipes.send(
      new ListTagsForResourceCommand({ resourceArn: pipeArn }),
    );
    expect(res.tags?.env).toBeUndefined();
  });

  // --- Cleanup ---

  test("DeletePipe", async () => {
    const res = await pipes.send(new DeletePipeCommand({ Name: "test-pipe" }));
    expect(res.CurrentState).toBe("DELETING");
    const list = await pipes.send(new ListPipesCommand({}));
    expect(list.Pipes!.some((p) => p.Name === "test-pipe")).toBe(false);
  });
});
