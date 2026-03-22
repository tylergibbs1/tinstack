import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  BatchClient,
  CreateComputeEnvironmentCommand,
  DescribeComputeEnvironmentsCommand,
  UpdateComputeEnvironmentCommand,
  DeleteComputeEnvironmentCommand,
  CreateJobQueueCommand,
  DescribeJobQueuesCommand,
  UpdateJobQueueCommand,
  DeleteJobQueueCommand,
  RegisterJobDefinitionCommand,
  DescribeJobDefinitionsCommand,
  DeregisterJobDefinitionCommand,
  SubmitJobCommand,
  DescribeJobsCommand,
  ListJobsCommand,
  TerminateJobCommand,
  CancelJobCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-batch";
import { startServer, stopServer, clientConfig } from "./helpers";

const batch = new BatchClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Batch", () => {
  let ceArn: string;
  let jqArn: string;
  let jdArn: string;
  let jobId: string;

  // --- Compute Environments ---

  test("CreateComputeEnvironment", async () => {
    const res = await batch.send(new CreateComputeEnvironmentCommand({
      computeEnvironmentName: "test-ce",
      type: "MANAGED",
      state: "ENABLED",
      computeResources: {
        type: "EC2",
        minvCpus: 0,
        maxvCpus: 256,
        instanceTypes: ["optimal"],
        subnets: ["subnet-12345"],
        securityGroupIds: ["sg-12345"],
      },
    }));
    expect(res.computeEnvironmentName).toBe("test-ce");
    expect(res.computeEnvironmentArn).toContain("compute-environment/test-ce");
    ceArn = res.computeEnvironmentArn!;
  });

  test("DescribeComputeEnvironments", async () => {
    const res = await batch.send(new DescribeComputeEnvironmentsCommand({
      computeEnvironments: ["test-ce"],
    }));
    expect(res.computeEnvironments!.length).toBe(1);
    expect(res.computeEnvironments![0].computeEnvironmentName).toBe("test-ce");
    expect(res.computeEnvironments![0].state).toBe("ENABLED");
    expect(res.computeEnvironments![0].status).toBe("VALID");
  });

  test("UpdateComputeEnvironment", async () => {
    const res = await batch.send(new UpdateComputeEnvironmentCommand({
      computeEnvironment: "test-ce",
      state: "DISABLED",
    }));
    expect(res.computeEnvironmentName).toBe("test-ce");
  });

  test("DescribeComputeEnvironments - verify update", async () => {
    const res = await batch.send(new DescribeComputeEnvironmentsCommand({
      computeEnvironments: ["test-ce"],
    }));
    expect(res.computeEnvironments![0].state).toBe("DISABLED");
  });

  // --- Job Queues ---

  test("CreateJobQueue", async () => {
    const res = await batch.send(new CreateJobQueueCommand({
      jobQueueName: "test-queue",
      state: "ENABLED",
      priority: 1,
      computeEnvironmentOrder: [
        { order: 1, computeEnvironment: ceArn },
      ],
    }));
    expect(res.jobQueueName).toBe("test-queue");
    expect(res.jobQueueArn).toContain("job-queue/test-queue");
    jqArn = res.jobQueueArn!;
  });

  test("DescribeJobQueues", async () => {
    const res = await batch.send(new DescribeJobQueuesCommand({
      jobQueues: ["test-queue"],
    }));
    expect(res.jobQueues!.length).toBe(1);
    expect(res.jobQueues![0].jobQueueName).toBe("test-queue");
    expect(res.jobQueues![0].priority).toBe(1);
  });

  test("UpdateJobQueue", async () => {
    const res = await batch.send(new UpdateJobQueueCommand({
      jobQueue: "test-queue",
      priority: 5,
    }));
    expect(res.jobQueueName).toBe("test-queue");
  });

  // --- Job Definitions ---

  test("RegisterJobDefinition", async () => {
    const res = await batch.send(new RegisterJobDefinitionCommand({
      jobDefinitionName: "test-job-def",
      type: "container",
      containerProperties: {
        image: "busybox",
        vcpus: 1,
        memory: 512,
        command: ["echo", "hello"],
      },
    }));
    expect(res.jobDefinitionName).toBe("test-job-def");
    expect(res.revision).toBe(1);
    expect(res.jobDefinitionArn).toContain("job-definition/test-job-def:1");
    jdArn = res.jobDefinitionArn!;
  });

  test("RegisterJobDefinition - second revision", async () => {
    const res = await batch.send(new RegisterJobDefinitionCommand({
      jobDefinitionName: "test-job-def",
      type: "container",
      containerProperties: {
        image: "busybox:latest",
        vcpus: 2,
        memory: 1024,
        command: ["echo", "world"],
      },
    }));
    expect(res.revision).toBe(2);
  });

  test("DescribeJobDefinitions", async () => {
    const res = await batch.send(new DescribeJobDefinitionsCommand({
      jobDefinitions: ["test-job-def"],
    }));
    expect(res.jobDefinitions!.length).toBe(2);
  });

  test("DeregisterJobDefinition", async () => {
    await batch.send(new DeregisterJobDefinitionCommand({
      jobDefinition: jdArn,
    }));
    const res = await batch.send(new DescribeJobDefinitionsCommand({
      jobDefinitions: ["test-job-def"],
      status: "ACTIVE",
    }));
    expect(res.jobDefinitions!.length).toBe(1);
    expect(res.jobDefinitions![0].revision).toBe(2);
  });

  // --- Jobs ---

  test("SubmitJob", async () => {
    const res = await batch.send(new SubmitJobCommand({
      jobName: "test-job",
      jobQueue: "test-queue",
      jobDefinition: "test-job-def",
    }));
    expect(res.jobId).toBeDefined();
    expect(res.jobName).toBe("test-job");
    jobId = res.jobId!;
  });

  test("DescribeJobs", async () => {
    const res = await batch.send(new DescribeJobsCommand({
      jobs: [jobId],
    }));
    expect(res.jobs!.length).toBe(1);
    expect(res.jobs![0].jobName).toBe("test-job");
    expect(res.jobs![0].jobId).toBe(jobId);
  });

  test("ListJobs", async () => {
    const res = await batch.send(new ListJobsCommand({
      jobQueue: "test-queue",
    }));
    expect(res.jobSummaryList!.length).toBeGreaterThanOrEqual(1);
  });

  test("TerminateJob", async () => {
    // Submit another job to terminate
    const submit = await batch.send(new SubmitJobCommand({
      jobName: "to-terminate",
      jobQueue: "test-queue",
      jobDefinition: "test-job-def",
    }));
    await batch.send(new TerminateJobCommand({
      jobId: submit.jobId!,
      reason: "Testing termination",
    }));
    const desc = await batch.send(new DescribeJobsCommand({
      jobs: [submit.jobId!],
    }));
    expect(desc.jobs![0].status).toBe("FAILED");
    expect(desc.jobs![0].statusReason).toBe("Testing termination");
  });

  // --- Tags ---

  test("TagResource and UntagResource", async () => {
    await batch.send(new TagResourceCommand({
      resourceArn: ceArn,
      tags: { env: "test", team: "platform" },
    }));
    // Untag one key
    await batch.send(new UntagResourceCommand({
      resourceArn: ceArn,
      tagKeys: ["team"],
    }));
  });

  // --- Cleanup ---

  test("DeleteJobQueue", async () => {
    await batch.send(new DeleteJobQueueCommand({
      jobQueue: "test-queue",
    }));
    const res = await batch.send(new DescribeJobQueuesCommand({}));
    const found = res.jobQueues!.find((q) => q.jobQueueName === "test-queue");
    expect(found).toBeUndefined();
  });

  test("DeleteComputeEnvironment", async () => {
    await batch.send(new DeleteComputeEnvironmentCommand({
      computeEnvironment: "test-ce",
    }));
    const res = await batch.send(new DescribeComputeEnvironmentsCommand({}));
    const found = res.computeEnvironments!.find((c) => c.computeEnvironmentName === "test-ce");
    expect(found).toBeUndefined();
  });
});
