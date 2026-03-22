import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ECSClient,
  CreateClusterCommand,
  DescribeClustersCommand,
  ListClustersCommand,
  DeleteClusterCommand,
  RegisterTaskDefinitionCommand,
  DescribeTaskDefinitionCommand,
  ListTaskDefinitionsCommand,
  DeregisterTaskDefinitionCommand,
  CreateServiceCommand,
  DescribeServicesCommand,
  UpdateServiceCommand,
  DeleteServiceCommand,
  ListServicesCommand,
  RunTaskCommand,
  DescribeTasksCommand,
  StopTaskCommand,
  ListTasksCommand,
  RegisterContainerInstanceCommand,
  DescribeContainerInstancesCommand,
  ListContainerInstancesCommand,
  DeregisterContainerInstanceCommand,
  UpdateContainerInstancesStateCommand,
  CreateTaskSetCommand,
  DescribeTaskSetsCommand,
  UpdateTaskSetCommand,
  DeleteTaskSetCommand,
  PutClusterCapacityProvidersCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-ecs";
import { startServer, stopServer, clientConfig } from "./helpers";

const ecs = new ECSClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("ECS", () => {
  let clusterArn: string;
  let taskDefinitionArn: string;
  let serviceArn: string;
  let taskArn: string;

  // --- Clusters ---

  test("CreateCluster", async () => {
    const res = await ecs.send(new CreateClusterCommand({
      clusterName: "test-cluster",
    }));
    expect(res.cluster).toBeDefined();
    expect(res.cluster!.clusterName).toBe("test-cluster");
    expect(res.cluster!.status).toBe("ACTIVE");
    expect(res.cluster!.clusterArn).toContain("cluster/test-cluster");
    clusterArn = res.cluster!.clusterArn!;
  });

  test("CreateCluster - duplicate returns existing", async () => {
    const res = await ecs.send(new CreateClusterCommand({
      clusterName: "test-cluster",
    }));
    expect(res.cluster!.clusterArn).toBe(clusterArn);
  });

  test("DescribeClusters", async () => {
    const res = await ecs.send(new DescribeClustersCommand({
      clusters: ["test-cluster"],
    }));
    expect(res.clusters!.length).toBe(1);
    expect(res.clusters![0].clusterName).toBe("test-cluster");
    expect(res.clusters![0].status).toBe("ACTIVE");
  });

  test("DescribeClusters - by ARN", async () => {
    const res = await ecs.send(new DescribeClustersCommand({
      clusters: [clusterArn],
    }));
    expect(res.clusters!.length).toBe(1);
    expect(res.clusters![0].clusterName).toBe("test-cluster");
  });

  test("DescribeClusters - missing cluster returns failure", async () => {
    const res = await ecs.send(new DescribeClustersCommand({
      clusters: ["nonexistent"],
    }));
    expect(res.clusters!.length).toBe(0);
    expect(res.failures!.length).toBe(1);
    expect(res.failures![0].reason).toBe("MISSING");
  });

  test("ListClusters", async () => {
    const res = await ecs.send(new ListClustersCommand({}));
    expect(res.clusterArns!.length).toBeGreaterThanOrEqual(1);
    expect(res.clusterArns!.some((a) => a.includes("test-cluster"))).toBe(true);
  });

  // --- Task Definitions ---

  test("RegisterTaskDefinition", async () => {
    const res = await ecs.send(new RegisterTaskDefinitionCommand({
      family: "my-task",
      containerDefinitions: [
        {
          name: "web",
          image: "nginx:latest",
          cpu: 256,
          memory: 512,
          essential: true,
          portMappings: [{ containerPort: 80 }],
        },
      ],
      cpu: "256",
      memory: "512",
      requiresCompatibilities: ["FARGATE"],
      networkMode: "awsvpc",
    }));
    expect(res.taskDefinition).toBeDefined();
    expect(res.taskDefinition!.family).toBe("my-task");
    expect(res.taskDefinition!.revision).toBe(1);
    expect(res.taskDefinition!.status).toBe("ACTIVE");
    expect(res.taskDefinition!.containerDefinitions!.length).toBe(1);
    expect(res.taskDefinition!.containerDefinitions![0].name).toBe("web");
    taskDefinitionArn = res.taskDefinition!.taskDefinitionArn!;
  });

  test("RegisterTaskDefinition - second revision", async () => {
    const res = await ecs.send(new RegisterTaskDefinitionCommand({
      family: "my-task",
      containerDefinitions: [
        { name: "web", image: "nginx:1.25", cpu: 256, memory: 512, essential: true },
      ],
      cpu: "256",
      memory: "512",
    }));
    expect(res.taskDefinition!.revision).toBe(2);
    expect(res.taskDefinition!.family).toBe("my-task");
  });

  test("DescribeTaskDefinition - by ARN", async () => {
    const res = await ecs.send(new DescribeTaskDefinitionCommand({
      taskDefinition: taskDefinitionArn,
    }));
    expect(res.taskDefinition!.family).toBe("my-task");
    expect(res.taskDefinition!.revision).toBe(1);
  });

  test("DescribeTaskDefinition - by family:revision", async () => {
    const res = await ecs.send(new DescribeTaskDefinitionCommand({
      taskDefinition: "my-task:2",
    }));
    expect(res.taskDefinition!.revision).toBe(2);
  });

  test("DescribeTaskDefinition - by family (latest)", async () => {
    const res = await ecs.send(new DescribeTaskDefinitionCommand({
      taskDefinition: "my-task",
    }));
    expect(res.taskDefinition!.revision).toBe(2);
  });

  test("DescribeTaskDefinition - not found", async () => {
    try {
      await ecs.send(new DescribeTaskDefinitionCommand({
        taskDefinition: "nonexistent",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ClientException");
    }
  });

  test("ListTaskDefinitions", async () => {
    const res = await ecs.send(new ListTaskDefinitionsCommand({}));
    expect(res.taskDefinitionArns!.length).toBeGreaterThanOrEqual(2);
  });

  test("ListTaskDefinitions - by family prefix", async () => {
    const res = await ecs.send(new ListTaskDefinitionsCommand({
      familyPrefix: "my-task",
    }));
    expect(res.taskDefinitionArns!.length).toBe(2);
  });

  test("DeregisterTaskDefinition", async () => {
    // Register a throwaway task def to deregister
    const reg = await ecs.send(new RegisterTaskDefinitionCommand({
      family: "disposable",
      containerDefinitions: [{ name: "app", image: "alpine", essential: true }],
    }));
    const arn = reg.taskDefinition!.taskDefinitionArn!;

    const res = await ecs.send(new DeregisterTaskDefinitionCommand({
      taskDefinition: arn,
    }));
    expect(res.taskDefinition!.status).toBe("INACTIVE");

    // Should no longer appear in active list
    const list = await ecs.send(new ListTaskDefinitionsCommand({}));
    expect(list.taskDefinitionArns!.includes(arn)).toBe(false);
  });

  // --- Services ---

  test("CreateService", async () => {
    const res = await ecs.send(new CreateServiceCommand({
      cluster: "test-cluster",
      serviceName: "my-service",
      taskDefinition: taskDefinitionArn,
      desiredCount: 2,
      launchType: "FARGATE",
    }));
    expect(res.service).toBeDefined();
    expect(res.service!.serviceName).toBe("my-service");
    expect(res.service!.status).toBe("ACTIVE");
    expect(res.service!.desiredCount).toBe(2);
    expect(res.service!.launchType).toBe("FARGATE");
    serviceArn = res.service!.serviceArn!;
  });

  test("CreateService - duplicate fails", async () => {
    try {
      await ecs.send(new CreateServiceCommand({
        cluster: "test-cluster",
        serviceName: "my-service",
        taskDefinition: taskDefinitionArn,
        desiredCount: 1,
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("InvalidParameterException");
    }
  });

  test("DescribeServices", async () => {
    const res = await ecs.send(new DescribeServicesCommand({
      cluster: "test-cluster",
      services: ["my-service"],
    }));
    expect(res.services!.length).toBe(1);
    expect(res.services![0].serviceName).toBe("my-service");
    expect(res.services![0].desiredCount).toBe(2);
  });

  test("DescribeServices - missing returns failure", async () => {
    const res = await ecs.send(new DescribeServicesCommand({
      cluster: "test-cluster",
      services: ["nonexistent"],
    }));
    expect(res.services!.length).toBe(0);
    expect(res.failures!.length).toBe(1);
    expect(res.failures![0].reason).toBe("MISSING");
  });

  test("UpdateService - desiredCount", async () => {
    const res = await ecs.send(new UpdateServiceCommand({
      cluster: "test-cluster",
      service: "my-service",
      desiredCount: 5,
    }));
    expect(res.service!.desiredCount).toBe(5);
  });

  test("UpdateService - taskDefinition", async () => {
    const res = await ecs.send(new UpdateServiceCommand({
      cluster: "test-cluster",
      service: "my-service",
      taskDefinition: "my-task:2",
    }));
    expect(res.service!.taskDefinition).toBe("my-task:2");
  });

  test("ListServices", async () => {
    const res = await ecs.send(new ListServicesCommand({
      cluster: "test-cluster",
    }));
    expect(res.serviceArns!.length).toBeGreaterThanOrEqual(1);
    expect(res.serviceArns!.some((a) => a.includes("my-service"))).toBe(true);
  });

  // --- Tasks ---

  test("RunTask", async () => {
    const res = await ecs.send(new RunTaskCommand({
      cluster: "test-cluster",
      taskDefinition: taskDefinitionArn,
      count: 1,
      launchType: "FARGATE",
    }));
    expect(res.tasks!.length).toBe(1);
    expect(res.tasks![0].lastStatus).toBe("RUNNING");
    expect(res.tasks![0].taskDefinitionArn).toBe(taskDefinitionArn);
    expect(res.tasks![0].containers!.length).toBe(1);
    expect(res.tasks![0].containers![0].name).toBe("web");
    taskArn = res.tasks![0].taskArn!;
  });

  test("RunTask - multiple tasks", async () => {
    const res = await ecs.send(new RunTaskCommand({
      cluster: "test-cluster",
      taskDefinition: taskDefinitionArn,
      count: 3,
    }));
    expect(res.tasks!.length).toBe(3);
    for (const task of res.tasks!) {
      expect(task.lastStatus).toBe("RUNNING");
    }
  });

  test("RunTask - cluster not found", async () => {
    try {
      await ecs.send(new RunTaskCommand({
        cluster: "nonexistent",
        taskDefinition: taskDefinitionArn,
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ClusterNotFoundException");
    }
  });

  test("DescribeTasks", async () => {
    const res = await ecs.send(new DescribeTasksCommand({
      cluster: "test-cluster",
      tasks: [taskArn],
    }));
    expect(res.tasks!.length).toBe(1);
    expect(res.tasks![0].taskArn).toBe(taskArn);
    expect(res.tasks![0].lastStatus).toBe("RUNNING");
  });

  test("DescribeTasks - missing returns failure", async () => {
    const res = await ecs.send(new DescribeTasksCommand({
      cluster: "test-cluster",
      tasks: ["arn:aws:ecs:us-east-1:000000000000:task/test-cluster/nonexistent"],
    }));
    expect(res.tasks!.length).toBe(0);
    expect(res.failures!.length).toBe(1);
  });

  test("ListTasks", async () => {
    const res = await ecs.send(new ListTasksCommand({
      cluster: "test-cluster",
    }));
    expect(res.taskArns!.length).toBeGreaterThanOrEqual(1);
  });

  test("StopTask", async () => {
    const res = await ecs.send(new StopTaskCommand({
      cluster: "test-cluster",
      task: taskArn,
      reason: "Testing stop",
    }));
    expect(res.task!.lastStatus).toBe("STOPPED");
    expect(res.task!.desiredStatus).toBe("STOPPED");
    expect(res.task!.stoppedReason).toBe("Testing stop");
  });

  test("ListTasks - excludes stopped by default", async () => {
    // The stopped task should not appear in default listing
    const res = await ecs.send(new ListTasksCommand({
      cluster: "test-cluster",
    }));
    expect(res.taskArns!.includes(taskArn)).toBe(false);
  });

  test("ListTasks - desiredStatus STOPPED", async () => {
    const res = await ecs.send(new ListTasksCommand({
      cluster: "test-cluster",
      desiredStatus: "STOPPED",
    }));
    expect(res.taskArns!.some((a) => a === taskArn)).toBe(true);
  });

  // --- Container Instances ---

  test("RegisterContainerInstance", async () => {
    const res = await ecs.send(new RegisterContainerInstanceCommand({
      cluster: "test-cluster",
    }));
    expect(res.containerInstance).toBeDefined();
    expect(res.containerInstance!.status).toBe("ACTIVE");
    expect(res.containerInstance!.containerInstanceArn).toContain("container-instance/test-cluster/");
    expect(res.containerInstance!.agentConnected).toBe(true);
  });

  let containerInstanceArn: string;

  test("RegisterContainerInstance — with resources", async () => {
    const res = await ecs.send(new RegisterContainerInstanceCommand({
      cluster: "test-cluster",
      totalResources: [
        { name: "CPU", type: "INTEGER", integerValue: 2048 },
        { name: "MEMORY", type: "INTEGER", integerValue: 8192 },
      ],
    }));
    expect(res.containerInstance).toBeDefined();
    expect(res.containerInstance!.registeredResources).toBeDefined();
    containerInstanceArn = res.containerInstance!.containerInstanceArn!;
  });

  test("ListContainerInstances", async () => {
    const res = await ecs.send(new ListContainerInstancesCommand({
      cluster: "test-cluster",
    }));
    expect(res.containerInstanceArns!.length).toBeGreaterThanOrEqual(2);
  });

  test("DescribeContainerInstances", async () => {
    const res = await ecs.send(new DescribeContainerInstancesCommand({
      cluster: "test-cluster",
      containerInstances: [containerInstanceArn],
    }));
    expect(res.containerInstances!.length).toBe(1);
    expect(res.containerInstances![0].containerInstanceArn).toBe(containerInstanceArn);
    expect(res.containerInstances![0].status).toBe("ACTIVE");
  });

  test("DescribeContainerInstances — missing returns failure", async () => {
    const res = await ecs.send(new DescribeContainerInstancesCommand({
      cluster: "test-cluster",
      containerInstances: ["arn:aws:ecs:us-east-1:000000000000:container-instance/test-cluster/nonexistent"],
    }));
    expect(res.containerInstances!.length).toBe(0);
    expect(res.failures!.length).toBe(1);
    expect(res.failures![0].reason).toBe("MISSING");
  });

  test("UpdateContainerInstancesState — DRAINING", async () => {
    const res = await ecs.send(new UpdateContainerInstancesStateCommand({
      cluster: "test-cluster",
      containerInstances: [containerInstanceArn],
      status: "DRAINING",
    }));
    expect(res.containerInstances!.length).toBe(1);
    expect(res.containerInstances![0].status).toBe("DRAINING");
  });

  test("UpdateContainerInstancesState — back to ACTIVE", async () => {
    const res = await ecs.send(new UpdateContainerInstancesStateCommand({
      cluster: "test-cluster",
      containerInstances: [containerInstanceArn],
      status: "ACTIVE",
    }));
    expect(res.containerInstances![0].status).toBe("ACTIVE");
  });

  test("DeregisterContainerInstance", async () => {
    const res = await ecs.send(new DeregisterContainerInstanceCommand({
      cluster: "test-cluster",
      containerInstance: containerInstanceArn,
    }));
    expect(res.containerInstance).toBeDefined();
    expect(res.containerInstance!.status).toBe("INACTIVE");

    // Should not appear in active list
    const list = await ecs.send(new ListContainerInstancesCommand({
      cluster: "test-cluster",
    }));
    expect(list.containerInstanceArns!.includes(containerInstanceArn)).toBe(false);
  });

  // --- Cleanup ---

  test("DeleteService", async () => {
    // Must set desired count to 0 first (real AWS requires this, we're lenient)
    await ecs.send(new UpdateServiceCommand({
      cluster: "test-cluster",
      service: "my-service",
      desiredCount: 0,
    }));
    const res = await ecs.send(new DeleteServiceCommand({
      cluster: "test-cluster",
      service: "my-service",
    }));
    expect(res.service!.status).toBe("INACTIVE");

    // Should not appear in active list
    const list = await ecs.send(new ListServicesCommand({
      cluster: "test-cluster",
    }));
    expect(list.serviceArns!.some((a) => a.includes("my-service"))).toBe(false);
  });

  test("DeleteCluster", async () => {
    const res = await ecs.send(new DeleteClusterCommand({
      cluster: "test-cluster",
    }));
    expect(res.cluster!.status).toBe("INACTIVE");

    // Should not appear in list
    const list = await ecs.send(new ListClustersCommand({}));
    expect(list.clusterArns!.some((a) => a.includes("test-cluster"))).toBe(false);
  });

  test("DeleteCluster - not found", async () => {
    try {
      await ecs.send(new DeleteClusterCommand({
        cluster: "nonexistent",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ClusterNotFoundException");
    }
  });

  // --- Task Sets ---

  test("TaskSet lifecycle", async () => {
    // Setup: create cluster, task def, service
    const clusterRes = await ecs.send(new CreateClusterCommand({ clusterName: "ts-cluster" }));
    const tsClusterArn = clusterRes.cluster!.clusterArn!;

    await ecs.send(new RegisterTaskDefinitionCommand({
      family: "ts-task",
      containerDefinitions: [{ name: "app", image: "nginx", essential: true }],
    }));

    const svcRes = await ecs.send(new CreateServiceCommand({
      cluster: "ts-cluster",
      serviceName: "ts-service",
      taskDefinition: "ts-task",
      desiredCount: 1,
    }));
    const tsServiceArn = svcRes.service!.serviceArn!;

    // CreateTaskSet
    const createRes = await ecs.send(new CreateTaskSetCommand({
      cluster: "ts-cluster",
      service: "ts-service",
      taskDefinition: "ts-task",
      scale: { value: 50, unit: "PERCENT" },
    }));
    expect(createRes.taskSet).toBeDefined();
    expect(createRes.taskSet!.scale!.value).toBe(50);
    expect(createRes.taskSet!.status).toBe("ACTIVE");
    const taskSetArn = createRes.taskSet!.taskSetArn!;

    // DescribeTaskSets
    const descRes = await ecs.send(new DescribeTaskSetsCommand({
      cluster: "ts-cluster",
      service: "ts-service",
    }));
    expect(descRes.taskSets!.length).toBe(1);
    expect(descRes.taskSets![0].taskSetArn).toBe(taskSetArn);

    // UpdateTaskSet
    const updateRes = await ecs.send(new UpdateTaskSetCommand({
      cluster: "ts-cluster",
      service: "ts-service",
      taskSet: taskSetArn,
      scale: { value: 75, unit: "PERCENT" },
    }));
    expect(updateRes.taskSet!.scale!.value).toBe(75);

    // DeleteTaskSet
    const deleteRes = await ecs.send(new DeleteTaskSetCommand({
      cluster: "ts-cluster",
      service: "ts-service",
      taskSet: taskSetArn,
    }));
    expect(deleteRes.taskSet).toBeDefined();

    // After delete, describe should return empty
    const afterDelete = await ecs.send(new DescribeTaskSetsCommand({
      cluster: "ts-cluster",
      service: "ts-service",
    }));
    expect(afterDelete.taskSets!.length).toBe(0);

    // Cleanup
    await ecs.send(new DeleteServiceCommand({ cluster: "ts-cluster", service: "ts-service" }));
    await ecs.send(new DeleteClusterCommand({ cluster: "ts-cluster" }));
  });

  // --- Capacity Providers ---

  test("PutClusterCapacityProviders", async () => {
    await ecs.send(new CreateClusterCommand({ clusterName: "cp-cluster" }));

    const res = await ecs.send(new PutClusterCapacityProvidersCommand({
      cluster: "cp-cluster",
      capacityProviders: ["FARGATE", "FARGATE_SPOT"],
      defaultCapacityProviderStrategy: [
        { capacityProvider: "FARGATE", weight: 1, base: 1 },
        { capacityProvider: "FARGATE_SPOT", weight: 2 },
      ],
    }));
    expect(res.cluster).toBeDefined();
    expect(res.cluster!.capacityProviders).toEqual(["FARGATE", "FARGATE_SPOT"]);
    expect(res.cluster!.defaultCapacityProviderStrategy!.length).toBe(2);

    // Cleanup
    await ecs.send(new DeleteClusterCommand({ cluster: "cp-cluster" }));
  });

  // --- Tagging ---

  test("TagResource / UntagResource / ListTagsForResource", async () => {
    const clRes = await ecs.send(new CreateClusterCommand({ clusterName: "tag-cluster" }));
    const resourceArn = clRes.cluster!.clusterArn!;

    // Tag
    await ecs.send(new TagResourceCommand({
      resourceArn,
      tags: [
        { key: "env", value: "test" },
        { key: "team", value: "platform" },
      ],
    }));

    // List
    const listRes = await ecs.send(new ListTagsForResourceCommand({ resourceArn }));
    expect(listRes.tags!.length).toBe(2);
    expect(listRes.tags!.find((t) => t.key === "env")!.value).toBe("test");

    // Untag
    await ecs.send(new UntagResourceCommand({
      resourceArn,
      tagKeys: ["team"],
    }));

    const listRes2 = await ecs.send(new ListTagsForResourceCommand({ resourceArn }));
    expect(listRes2.tags!.length).toBe(1);
    expect(listRes2.tags![0].key).toBe("env");

    // Cleanup
    await ecs.send(new DeleteClusterCommand({ cluster: "tag-cluster" }));
  });
});
