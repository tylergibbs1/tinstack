import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  EMRClient,
  RunJobFlowCommand,
  DescribeClusterCommand,
  ListClustersCommand,
  TerminateJobFlowsCommand,
  AddJobFlowStepsCommand,
  ListStepsCommand,
  DescribeStepCommand,
  SetTerminationProtectionCommand,
  AddTagsCommand,
  RemoveTagsCommand,
  ListInstanceGroupsCommand,
  PutAutoScalingPolicyCommand,
} from "@aws-sdk/client-emr";
import { startServer, stopServer, clientConfig } from "./helpers";

const emr = new EMRClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("EMR", () => {
  let clusterId: string;

  test("RunJobFlow", async () => {
    const res = await emr.send(new RunJobFlowCommand({
      Name: "test-cluster",
      ReleaseLabel: "emr-6.10.0",
      Instances: {
        MasterInstanceType: "m5.xlarge",
        SlaveInstanceType: "m5.xlarge",
        InstanceCount: 3,
        KeepJobFlowAliveWhenNoSteps: true,
      },
      Applications: [{ Name: "Spark" }, { Name: "Hive" }],
      ServiceRole: "EMR_DefaultRole",
      JobFlowRole: "EMR_EC2_DefaultRole",
      VisibleToAllUsers: true,
      Tags: [{ Key: "env", Value: "test" }],
    }));
    expect(res.JobFlowId).toBeDefined();
    expect(res.JobFlowId).toMatch(/^j-/);
    clusterId = res.JobFlowId!;
  });

  test("DescribeCluster", async () => {
    const res = await emr.send(new DescribeClusterCommand({
      ClusterId: clusterId,
    }));
    expect(res.Cluster).toBeDefined();
    expect(res.Cluster!.Name).toBe("test-cluster");
    expect(res.Cluster!.Status!.State).toBe("RUNNING");
    expect(res.Cluster!.ReleaseLabel).toBe("emr-6.10.0");
    expect(res.Cluster!.Applications!.length).toBe(2);
    expect(res.Cluster!.Tags!.length).toBe(1);
    expect(res.Cluster!.Tags![0].Key).toBe("env");
  });

  test("ListClusters", async () => {
    const res = await emr.send(new ListClustersCommand({
      ClusterStates: ["RUNNING"],
    }));
    expect(res.Clusters!.length).toBeGreaterThanOrEqual(1);
    const found = res.Clusters!.find((c) => c.Id === clusterId);
    expect(found).toBeDefined();
    expect(found!.Name).toBe("test-cluster");
  });

  test("AddJobFlowSteps", async () => {
    const res = await emr.send(new AddJobFlowStepsCommand({
      JobFlowId: clusterId,
      Steps: [
        {
          Name: "test-step",
          ActionOnFailure: "CONTINUE",
          HadoopJarStep: {
            Jar: "command-runner.jar",
            Args: ["spark-submit", "--class", "org.example.Main", "s3://bucket/app.jar"],
          },
        },
      ],
    }));
    expect(res.StepIds).toBeDefined();
    expect(res.StepIds!.length).toBe(1);
  });

  test("ListSteps", async () => {
    const res = await emr.send(new ListStepsCommand({
      ClusterId: clusterId,
    }));
    expect(res.Steps!.length).toBeGreaterThanOrEqual(1);
    expect(res.Steps![res.Steps!.length - 1].Name).toBe("test-step");
  });

  test("DescribeStep", async () => {
    const steps = await emr.send(new ListStepsCommand({ ClusterId: clusterId }));
    const stepId = steps.Steps![steps.Steps!.length - 1].Id!;
    const res = await emr.send(new DescribeStepCommand({
      ClusterId: clusterId,
      StepId: stepId,
    }));
    expect(res.Step).toBeDefined();
    expect(res.Step!.Name).toBe("test-step");
    expect(res.Step!.Status!.State).toBe("COMPLETED");
  });

  test("ListInstanceGroups", async () => {
    const res = await emr.send(new ListInstanceGroupsCommand({
      ClusterId: clusterId,
    }));
    expect(res.InstanceGroups).toBeDefined();
    expect(res.InstanceGroups!.length).toBeGreaterThanOrEqual(2);
    const master = res.InstanceGroups!.find((g) => g.InstanceGroupType === "MASTER");
    expect(master).toBeDefined();
    expect(master!.InstanceType).toBe("m5.xlarge");
  });

  test("SetTerminationProtection", async () => {
    await emr.send(new SetTerminationProtectionCommand({
      JobFlowIds: [clusterId],
      TerminationProtected: true,
    }));
    const res = await emr.send(new DescribeClusterCommand({
      ClusterId: clusterId,
    }));
    expect(res.Cluster!.TerminationProtected).toBe(true);
  });

  test("AddTags and RemoveTags", async () => {
    await emr.send(new AddTagsCommand({
      ResourceId: clusterId,
      Tags: [{ Key: "project", Value: "analytics" }],
    }));
    let desc = await emr.send(new DescribeClusterCommand({ ClusterId: clusterId }));
    const projectTag = desc.Cluster!.Tags!.find((t) => t.Key === "project");
    expect(projectTag).toBeDefined();
    expect(projectTag!.Value).toBe("analytics");

    await emr.send(new RemoveTagsCommand({
      ResourceId: clusterId,
      TagKeys: ["project"],
    }));
    desc = await emr.send(new DescribeClusterCommand({ ClusterId: clusterId }));
    const removed = desc.Cluster!.Tags!.find((t) => t.Key === "project");
    expect(removed).toBeUndefined();
  });

  test("TerminateJobFlows", async () => {
    await emr.send(new SetTerminationProtectionCommand({
      JobFlowIds: [clusterId],
      TerminationProtected: false,
    }));
    await emr.send(new TerminateJobFlowsCommand({
      JobFlowIds: [clusterId],
    }));
    const res = await emr.send(new DescribeClusterCommand({
      ClusterId: clusterId,
    }));
    expect(res.Cluster!.Status!.State).toBe("TERMINATED");
  });
});
