import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  EMRContainersClient,
  CreateVirtualClusterCommand,
  DescribeVirtualClusterCommand,
  ListVirtualClustersCommand,
  DeleteVirtualClusterCommand,
  StartJobRunCommand,
  DescribeJobRunCommand,
  ListJobRunsCommand,
  CancelJobRunCommand,
} from "@aws-sdk/client-emr-containers";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new EMRContainersClient({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("EMR Containers", () => {
  let virtualClusterId: string;
  let jobRunId: string;

  test("CreateVirtualCluster", async () => {
    const result = await client.send(new CreateVirtualClusterCommand({
      name: "test-vc",
      containerProvider: { type: "EKS", id: "my-eks-cluster", info: { eksInfo: { namespace: "default" } } },
    }));
    expect(result.id).toBeDefined();
    expect(result.name).toBe("test-vc");
    virtualClusterId = result.id!;
  });

  test("DescribeVirtualCluster", async () => {
    const result = await client.send(new DescribeVirtualClusterCommand({ id: virtualClusterId }));
    expect(result.virtualCluster?.name).toBe("test-vc");
    expect(result.virtualCluster?.state).toBe("RUNNING");
  });

  test("ListVirtualClusters", async () => {
    const result = await client.send(new ListVirtualClustersCommand({}));
    expect(result.virtualClusters?.some((v) => v.id === virtualClusterId)).toBe(true);
  });

  test("StartJobRun", async () => {
    const result = await client.send(new StartJobRunCommand({
      virtualClusterId,
      name: "test-job",
      executionRoleArn: "arn:aws:iam::000000000000:role/emr-role",
      releaseLabel: "emr-6.9.0-latest",
      jobDriver: { sparkSubmitJobDriver: { entryPoint: "s3://bucket/script.py" } },
    }));
    expect(result.id).toBeDefined();
    expect(result.virtualClusterId).toBe(virtualClusterId);
    jobRunId = result.id!;
  });

  test("DescribeJobRun", async () => {
    const result = await client.send(new DescribeJobRunCommand({ virtualClusterId, id: jobRunId }));
    expect(result.jobRun?.id).toBe(jobRunId);
    expect(result.jobRun?.state).toBe("COMPLETED");
  });

  test("ListJobRuns", async () => {
    const result = await client.send(new ListJobRunsCommand({ virtualClusterId }));
    expect(result.jobRuns?.some((r) => r.id === jobRunId)).toBe(true);
  });

  test("CancelJobRun", async () => {
    const newRun = await client.send(new StartJobRunCommand({
      virtualClusterId,
      executionRoleArn: "arn:aws:iam::000000000000:role/emr-role",
      releaseLabel: "emr-6.9.0-latest",
      jobDriver: { sparkSubmitJobDriver: { entryPoint: "s3://bucket/script2.py" } },
    }));
    const result = await client.send(new CancelJobRunCommand({ virtualClusterId, id: newRun.id! }));
    expect(result.id).toBe(newRun.id);
  });

  test("DeleteVirtualCluster", async () => {
    const result = await client.send(new DeleteVirtualClusterCommand({ id: virtualClusterId }));
    expect(result.id).toBe(virtualClusterId);
  });
});
