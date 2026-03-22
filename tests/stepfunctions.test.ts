import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SFNClient,
  CreateStateMachineCommand,
  DescribeStateMachineCommand,
  ListStateMachinesCommand,
  StartExecutionCommand,
  DescribeExecutionCommand,
  ListExecutionsCommand,
  StopExecutionCommand,
  GetExecutionHistoryCommand,
  DeleteStateMachineCommand,
  StartSyncExecutionCommand,
  CreateActivityCommand,
  DescribeActivityCommand,
  ListActivitiesCommand,
  DeleteActivityCommand,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
  SendTaskHeartbeatCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-sfn";
import { startServer, stopServer, clientConfig } from "./helpers";

const sfn = new SFNClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Step Functions", () => {
  let smArn: string;

  const passDefinition = JSON.stringify({
    StartAt: "Hello",
    States: {
      Hello: {
        Type: "Pass",
        Result: { greeting: "Hello World!" },
        Next: "Goodbye",
      },
      Goodbye: {
        Type: "Pass",
        Result: { farewell: "Goodbye!" },
        End: true,
      },
    },
  });

  test("CreateStateMachine", async () => {
    const res = await sfn.send(new CreateStateMachineCommand({
      name: "test-state-machine",
      definition: passDefinition,
      roleArn: "arn:aws:iam::000000000000:role/step-functions-role",
    }));
    smArn = res.stateMachineArn!;
    expect(smArn).toContain("test-state-machine");
    expect(res.creationDate).toBeDefined();
  });

  test("DescribeStateMachine", async () => {
    const res = await sfn.send(new DescribeStateMachineCommand({ stateMachineArn: smArn }));
    expect(res.name).toBe("test-state-machine");
    expect(res.status).toBe("ACTIVE");
    expect(res.definition).toBe(passDefinition);
  });

  test("ListStateMachines", async () => {
    const res = await sfn.send(new ListStateMachinesCommand({}));
    expect(res.stateMachines?.some((sm) => sm.stateMachineArn === smArn)).toBe(true);
  });

  test("StartExecution + DescribeExecution", async () => {
    const start = await sfn.send(new StartExecutionCommand({
      stateMachineArn: smArn,
      input: JSON.stringify({ value: 42 }),
    }));
    expect(start.executionArn).toBeDefined();

    // Wait for execution to complete
    await new Promise((r) => setTimeout(r, 100));

    const desc = await sfn.send(new DescribeExecutionCommand({ executionArn: start.executionArn! }));
    expect(desc.status).toBe("SUCCEEDED");
    const output = JSON.parse(desc.output!);
    expect(output.farewell).toBe("Goodbye!");
  });

  test("ListExecutions", async () => {
    const res = await sfn.send(new ListExecutionsCommand({ stateMachineArn: smArn }));
    expect(res.executions!.length).toBeGreaterThan(0);
  });

  test("GetExecutionHistory", async () => {
    const execs = await sfn.send(new ListExecutionsCommand({ stateMachineArn: smArn }));
    const execArn = execs.executions![0].executionArn!;
    const history = await sfn.send(new GetExecutionHistoryCommand({ executionArn: execArn }));
    expect(history.events!.length).toBeGreaterThan(0);
  });

  test("Choice state machine", async () => {
    const choiceDef = JSON.stringify({
      StartAt: "CheckValue",
      States: {
        CheckValue: {
          Type: "Choice",
          Choices: [
            { Variable: "$.value", NumericGreaterThan: 100, Next: "HighValue" },
            { Variable: "$.value", NumericLessThanEquals: 100, Next: "LowValue" },
          ],
          Default: "LowValue",
        },
        HighValue: { Type: "Pass", Result: "high", End: true },
        LowValue: { Type: "Pass", Result: "low", End: true },
      },
    });

    const createRes = await sfn.send(new CreateStateMachineCommand({
      name: "choice-machine",
      definition: choiceDef,
      roleArn: "arn:aws:iam::000000000000:role/role",
    }));

    const highExec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: createRes.stateMachineArn!,
      input: JSON.stringify({ value: 150 }),
    }));
    await new Promise((r) => setTimeout(r, 100));
    const highDesc = await sfn.send(new DescribeExecutionCommand({ executionArn: highExec.executionArn! }));
    expect(highDesc.status).toBe("SUCCEEDED");
    expect(JSON.parse(highDesc.output!)).toBe("high");

    const lowExec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: createRes.stateMachineArn!,
      input: JSON.stringify({ value: 50 }),
    }));
    await new Promise((r) => setTimeout(r, 100));
    const lowDesc = await sfn.send(new DescribeExecutionCommand({ executionArn: lowExec.executionArn! }));
    expect(lowDesc.status).toBe("SUCCEEDED");
    expect(JSON.parse(lowDesc.output!)).toBe("low");

    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: createRes.stateMachineArn! }));
  });

  test("Parallel state machine", async () => {
    const parallelDef = JSON.stringify({
      StartAt: "ParallelWork",
      States: {
        ParallelWork: {
          Type: "Parallel",
          Branches: [
            { StartAt: "Branch1", States: { Branch1: { Type: "Pass", Result: "result-a", End: true } } },
            { StartAt: "Branch2", States: { Branch2: { Type: "Pass", Result: "result-b", End: true } } },
          ],
          End: true,
        },
      },
    });

    const createRes = await sfn.send(new CreateStateMachineCommand({
      name: "parallel-machine",
      definition: parallelDef,
      roleArn: "arn:aws:iam::000000000000:role/role",
    }));

    const exec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: createRes.stateMachineArn!,
      input: "{}",
    }));
    await new Promise((r) => setTimeout(r, 100));
    const desc = await sfn.send(new DescribeExecutionCommand({ executionArn: exec.executionArn! }));
    expect(desc.status).toBe("SUCCEEDED");
    const output = JSON.parse(desc.output!);
    expect(output).toEqual(["result-a", "result-b"]);

    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: createRes.stateMachineArn! }));
  });

  test("Map state machine", async () => {
    const mapDef = JSON.stringify({
      StartAt: "MapItems",
      States: {
        MapItems: {
          Type: "Map",
          ItemsPath: "$.items",
          Iterator: {
            StartAt: "Process",
            States: {
              Process: {
                Type: "Pass",
                ResultPath: "$.processed",
                Result: true,
                End: true,
              },
            },
          },
          End: true,
        },
      },
    });

    const createRes = await sfn.send(new CreateStateMachineCommand({
      name: "map-machine",
      definition: mapDef,
      roleArn: "arn:aws:iam::000000000000:role/role",
    }));

    const exec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: createRes.stateMachineArn!,
      input: JSON.stringify({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] }),
    }));
    await new Promise((r) => setTimeout(r, 100));
    const desc = await sfn.send(new DescribeExecutionCommand({ executionArn: exec.executionArn! }));
    expect(desc.status).toBe("SUCCEEDED");
    const output = JSON.parse(desc.output!);
    expect(output.length).toBe(3);
    expect(output[0].processed).toBe(true);

    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: createRes.stateMachineArn! }));
  });

  test("Fail state machine", async () => {
    const failDef = JSON.stringify({
      StartAt: "FailNow",
      States: {
        FailNow: { Type: "Fail", Error: "CustomError", Cause: "Something went wrong" },
      },
    });

    const createRes = await sfn.send(new CreateStateMachineCommand({
      name: "fail-machine",
      definition: failDef,
      roleArn: "arn:aws:iam::000000000000:role/role",
    }));

    const exec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: createRes.stateMachineArn!,
      input: "{}",
    }));
    await new Promise((r) => setTimeout(r, 100));
    const desc = await sfn.send(new DescribeExecutionCommand({ executionArn: exec.executionArn! }));
    expect(desc.status).toBe("FAILED");
    expect(desc.error).toBe("CustomError");
    expect(desc.cause).toBe("Something went wrong");

    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: createRes.stateMachineArn! }));
  });

  test("StopExecution", async () => {
    // Create a Wait state machine
    const waitDef = JSON.stringify({
      StartAt: "WaitForever",
      States: {
        WaitForever: { Type: "Wait", Seconds: 9999, End: true },
      },
    });

    const createRes = await sfn.send(new CreateStateMachineCommand({
      name: "wait-machine",
      definition: waitDef,
      roleArn: "arn:aws:iam::000000000000:role/role",
    }));

    const exec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: createRes.stateMachineArn!,
      input: "{}",
    }));

    // Wait a tiny bit, then stop
    await new Promise((r) => setTimeout(r, 50));
    await sfn.send(new StopExecutionCommand({
      executionArn: exec.executionArn!,
      error: "UserAborted",
      cause: "Stopped by test",
    }));

    const desc = await sfn.send(new DescribeExecutionCommand({ executionArn: exec.executionArn! }));
    expect(desc.status).toBe("ABORTED");

    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: createRes.stateMachineArn! }));
  });

  test("DeleteStateMachine", async () => {
    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: smArn }));
    const res = await sfn.send(new ListStateMachinesCommand({}));
    expect(res.stateMachines?.some((sm) => sm.stateMachineArn === smArn)).toBeFalsy();
  });
});

describe("Step Functions Activities", () => {
  let activityArn: string;

  test("CreateActivity", async () => {
    const res = await sfn.send(new CreateActivityCommand({ name: "test-activity" }));
    activityArn = res.activityArn!;
    expect(activityArn).toContain("test-activity");
    expect(res.creationDate).toBeDefined();
  });

  test("DescribeActivity", async () => {
    const res = await sfn.send(new DescribeActivityCommand({ activityArn }));
    expect(res.name).toBe("test-activity");
    expect(res.activityArn).toBe(activityArn);
    expect(res.creationDate).toBeDefined();
  });

  test("ListActivities", async () => {
    const res = await sfn.send(new ListActivitiesCommand({}));
    expect(res.activities?.some((a) => a.activityArn === activityArn)).toBe(true);
  });

  test("DeleteActivity", async () => {
    await sfn.send(new DeleteActivityCommand({ activityArn }));
    const res = await sfn.send(new ListActivitiesCommand({}));
    expect(res.activities?.some((a) => a.activityArn === activityArn)).toBeFalsy();
  });
});

describe("Step Functions Task Callbacks", () => {
  test("SendTaskSuccess", async () => {
    const res = await sfn.send(new SendTaskSuccessCommand({
      taskToken: "test-token-success",
      output: JSON.stringify({ result: "done" }),
    }));
    expect(res).toBeDefined();
  });

  test("SendTaskFailure", async () => {
    const res = await sfn.send(new SendTaskFailureCommand({
      taskToken: "test-token-failure",
      error: "TaskFailed",
      cause: "Something went wrong",
    }));
    expect(res).toBeDefined();
  });

  test("SendTaskHeartbeat", async () => {
    const res = await sfn.send(new SendTaskHeartbeatCommand({
      taskToken: "test-token-heartbeat",
    }));
    expect(res).toBeDefined();
  });
});

describe("Step Functions UntagResource", () => {
  test("TagResource then UntagResource", async () => {
    const sm = await sfn.send(new CreateStateMachineCommand({
      name: "tag-untag-machine",
      definition: JSON.stringify({ StartAt: "Pass", States: { Pass: { Type: "Pass", End: true } } }),
      roleArn: "arn:aws:iam::000000000000:role/role",
      tags: [{ key: "env", value: "test" }, { key: "team", value: "alpha" }],
    }));
    const arn = sm.stateMachineArn!;

    // Verify tags exist
    let tags = await sfn.send(new ListTagsForResourceCommand({ resourceArn: arn }));
    expect(tags.tags?.some((t) => t.key === "env")).toBe(true);
    expect(tags.tags?.some((t) => t.key === "team")).toBe(true);

    // Untag one key
    await sfn.send(new UntagResourceCommand({ resourceArn: arn, tagKeys: ["env"] }));

    // Verify only "team" remains
    tags = await sfn.send(new ListTagsForResourceCommand({ resourceArn: arn }));
    expect(tags.tags?.some((t) => t.key === "env")).toBeFalsy();
    expect(tags.tags?.some((t) => t.key === "team")).toBe(true);

    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: arn }));
  });
});
