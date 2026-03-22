import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  DataSyncClient,
  CreateAgentCommand,
  ListAgentsCommand,
  DeleteAgentCommand,
  CreateLocationS3Command,
  CreateLocationNfsCommand,
  CreateLocationEfsCommand,
  ListLocationsCommand,
  DeleteLocationCommand,
  CreateTaskCommand,
  DescribeTaskCommand,
  ListTasksCommand,
  DeleteTaskCommand,
  StartTaskExecutionCommand,
  DescribeTaskExecutionCommand,
  ListTaskExecutionsCommand,
  CancelTaskExecutionCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-datasync";
import { startServer, stopServer, clientConfig } from "./helpers";

const datasync = new DataSyncClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("DataSync", () => {
  let agentArn: string;
  let s3LocationArn: string;
  let nfsLocationArn: string;
  let taskArn: string;
  let taskExecutionArn: string;

  test("CreateAgent", async () => {
    const res = await datasync.send(new CreateAgentCommand({
      ActivationKey: "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE",
      AgentName: "test-agent",
      Tags: [{ Key: "env", Value: "test" }],
    }));
    agentArn = res.AgentArn!;
    expect(agentArn).toBeDefined();
    expect(agentArn).toContain("datasync");
  });

  test("ListAgents", async () => {
    const res = await datasync.send(new ListAgentsCommand({}));
    expect(res.Agents).toBeDefined();
    expect(res.Agents!.length).toBeGreaterThanOrEqual(1);
    const found = res.Agents!.find((a) => a.AgentArn === agentArn);
    expect(found).toBeDefined();
    expect(found!.Name).toBe("test-agent");
  });

  test("CreateLocationS3", async () => {
    const res = await datasync.send(new CreateLocationS3Command({
      S3BucketArn: "arn:aws:s3:::my-bucket",
      S3Config: { BucketAccessRoleArn: "arn:aws:iam::000000000000:role/DataSyncRole" },
      Subdirectory: "/data",
    }));
    s3LocationArn = res.LocationArn!;
    expect(s3LocationArn).toBeDefined();
  });

  test("CreateLocationNfs", async () => {
    const res = await datasync.send(new CreateLocationNfsCommand({
      ServerHostname: "nfs.example.com",
      Subdirectory: "/exports/data",
      OnPremConfig: { AgentArns: [agentArn] },
    }));
    nfsLocationArn = res.LocationArn!;
    expect(nfsLocationArn).toBeDefined();
  });

  test("ListLocations", async () => {
    const res = await datasync.send(new ListLocationsCommand({}));
    expect(res.Locations).toBeDefined();
    expect(res.Locations!.length).toBeGreaterThanOrEqual(2);
  });

  test("CreateTask", async () => {
    const res = await datasync.send(new CreateTaskCommand({
      SourceLocationArn: nfsLocationArn,
      DestinationLocationArn: s3LocationArn,
      Name: "test-task",
    }));
    taskArn = res.TaskArn!;
    expect(taskArn).toBeDefined();
  });

  test("DescribeTask", async () => {
    const res = await datasync.send(new DescribeTaskCommand({
      TaskArn: taskArn,
    }));
    expect(res.TaskArn).toBe(taskArn);
    expect(res.Name).toBe("test-task");
    expect(res.Status).toBe("AVAILABLE");
    expect(res.SourceLocationArn).toBe(nfsLocationArn);
    expect(res.DestinationLocationArn).toBe(s3LocationArn);
  });

  test("ListTasks", async () => {
    const res = await datasync.send(new ListTasksCommand({}));
    expect(res.Tasks).toBeDefined();
    expect(res.Tasks!.length).toBeGreaterThanOrEqual(1);
  });

  test("StartTaskExecution", async () => {
    const res = await datasync.send(new StartTaskExecutionCommand({
      TaskArn: taskArn,
    }));
    taskExecutionArn = res.TaskExecutionArn!;
    expect(taskExecutionArn).toBeDefined();
    expect(taskExecutionArn).toContain("execution");
  });

  test("DescribeTaskExecution", async () => {
    const res = await datasync.send(new DescribeTaskExecutionCommand({
      TaskExecutionArn: taskExecutionArn,
    }));
    expect(res.TaskExecutionArn).toBe(taskExecutionArn);
    expect(res.Status).toBeDefined();
  });

  test("ListTaskExecutions", async () => {
    const res = await datasync.send(new ListTaskExecutionsCommand({
      TaskArn: taskArn,
    }));
    expect(res.TaskExecutions).toBeDefined();
    expect(res.TaskExecutions!.length).toBeGreaterThanOrEqual(1);
  });

  test("CancelTaskExecution", async () => {
    await datasync.send(new CancelTaskExecutionCommand({
      TaskExecutionArn: taskExecutionArn,
    }));
    const res = await datasync.send(new DescribeTaskExecutionCommand({
      TaskExecutionArn: taskExecutionArn,
    }));
    expect(res.Status).toBe("ERROR");
  });

  // --- Tags ---

  test("TagResource", async () => {
    await datasync.send(new TagResourceCommand({
      ResourceArn: taskArn,
      Tags: [{ Key: "project", Value: "migration" }],
    }));
  });

  test("ListTagsForResource", async () => {
    const res = await datasync.send(new ListTagsForResourceCommand({
      ResourceArn: taskArn,
    }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.find((t) => t.Key === "project")?.Value).toBe("migration");
  });

  test("UntagResource", async () => {
    await datasync.send(new UntagResourceCommand({
      ResourceArn: taskArn,
      Keys: ["project"],
    }));
    const res = await datasync.send(new ListTagsForResourceCommand({
      ResourceArn: taskArn,
    }));
    expect(res.Tags!.find((t) => t.Key === "project")).toBeUndefined();
  });

  // --- Cleanup ---

  test("DeleteTask", async () => {
    await datasync.send(new DeleteTaskCommand({ TaskArn: taskArn }));
    await expect(
      datasync.send(new DescribeTaskCommand({ TaskArn: taskArn })),
    ).rejects.toThrow();
  });

  test("DeleteLocation - S3", async () => {
    await datasync.send(new DeleteLocationCommand({ LocationArn: s3LocationArn }));
  });

  test("DeleteLocation - NFS", async () => {
    await datasync.send(new DeleteLocationCommand({ LocationArn: nfsLocationArn }));
  });

  test("DeleteAgent", async () => {
    await datasync.send(new DeleteAgentCommand({ AgentArn: agentArn }));
    const res = await datasync.send(new ListAgentsCommand({}));
    expect(res.Agents!.find((a) => a.AgentArn === agentArn)).toBeUndefined();
  });

  test("DeleteAgent - not found", async () => {
    await expect(
      datasync.send(new DeleteAgentCommand({ AgentArn: "arn:aws:datasync:us-east-1:000000000000:agent/nonexistent" })),
    ).rejects.toThrow();
  });
});
