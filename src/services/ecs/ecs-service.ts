import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface EcsCluster {
  clusterName: string;
  clusterArn: string;
  status: string;
  registeredContainerInstancesCount: number;
  runningTasksCount: number;
  pendingTasksCount: number;
  activeServicesCount: number;
  settings: { name: string; value: string }[];
  capacityProviders: string[];
  defaultCapacityProviderStrategy: any[];
  createdAt: number;
}

export interface ContainerDefinition {
  name: string;
  image: string;
  cpu?: number;
  memory?: number;
  memoryReservation?: number;
  essential?: boolean;
  portMappings?: { containerPort: number; hostPort?: number; protocol?: string }[];
  environment?: { name: string; value: string }[];
  command?: string[];
  entryPoint?: string[];
  logConfiguration?: any;
}

export interface EcsTaskDefinition {
  taskDefinitionArn: string;
  family: string;
  revision: number;
  containerDefinitions: ContainerDefinition[];
  cpu?: string;
  memory?: string;
  networkMode?: string;
  requiresCompatibilities?: string[];
  executionRoleArn?: string;
  taskRoleArn?: string;
  status: string;
  registeredAt: number;
}

export interface EcsService {
  serviceName: string;
  serviceArn: string;
  clusterArn: string;
  taskDefinition: string;
  desiredCount: number;
  runningCount: number;
  pendingCount: number;
  launchType?: string;
  networkConfiguration?: any;
  status: string;
  createdAt: number;
  deployments: any[];
}

export interface EcsTask {
  taskArn: string;
  taskDefinitionArn: string;
  clusterArn: string;
  lastStatus: string;
  desiredStatus: string;
  launchType?: string;
  cpu?: string;
  memory?: string;
  containers: { name: string; lastStatus: string; containerArn: string }[];
  startedAt?: number;
  stoppedAt?: number;
  stoppedReason?: string;
  createdAt: number;
}

export interface EcsContainerInstance {
  containerInstanceArn: string;
  ec2InstanceId: string;
  status: string;
  registeredResources: { name: string; type: string; integerValue?: number }[];
  remainingResources: { name: string; type: string; integerValue?: number }[];
  runningTasksCount: number;
  pendingTasksCount: number;
  agentConnected: boolean;
  registeredAt: number;
}

export interface EcsTaskSet {
  taskSetArn: string;
  id: string;
  clusterArn: string;
  serviceArn: string;
  taskDefinition: string;
  scale: { value: number; unit: string };
  launchType?: string;
  networkConfiguration?: any;
  status: string;
  stabilityStatus: string;
  createdAt: number;
  updatedAt: number;
}

export class EcsServiceImpl {
  private clusters: StorageBackend<string, EcsCluster>;
  private taskDefinitions: StorageBackend<string, EcsTaskDefinition>;
  private services: StorageBackend<string, EcsService>;
  private tasks: StorageBackend<string, EcsTask>;
  private containerInstances: StorageBackend<string, EcsContainerInstance>;
  private taskSets: StorageBackend<string, EcsTaskSet>;
  private resourceTags = new Map<string, { key: string; value: string }[]>();
  private familyRevisions = new Map<string, number>();

  constructor(private accountId: string) {
    this.clusters = new InMemoryStorage();
    this.taskDefinitions = new InMemoryStorage();
    this.services = new InMemoryStorage();
    this.tasks = new InMemoryStorage();
    this.containerInstances = new InMemoryStorage();
    this.taskSets = new InMemoryStorage();
  }

  private clusterKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  private resolveClusterName(clusterRef: string | undefined): string {
    if (!clusterRef) return "default";
    // If it's an ARN, extract the cluster name
    if (clusterRef.startsWith("arn:")) {
      const parts = clusterRef.split("/");
      return parts[parts.length - 1];
    }
    return clusterRef;
  }

  private getClusterArn(clusterName: string, region: string): string {
    return buildArn("ecs", region, this.accountId, "cluster/", clusterName);
  }

  // --- Clusters ---

  createCluster(
    clusterName: string | undefined,
    settings: { name: string; value: string }[] | undefined,
    capacityProviders: string[] | undefined,
    defaultCapacityProviderStrategy: any[] | undefined,
    region: string,
  ): EcsCluster {
    const name = clusterName ?? "default";
    const key = this.clusterKey(region, name);
    if (this.clusters.has(key)) {
      // AWS ECS returns the existing cluster on duplicate create
      return this.clusters.get(key)!;
    }
    const cluster: EcsCluster = {
      clusterName: name,
      clusterArn: this.getClusterArn(name, region),
      status: "ACTIVE",
      registeredContainerInstancesCount: 0,
      runningTasksCount: 0,
      pendingTasksCount: 0,
      activeServicesCount: 0,
      settings: settings ?? [{ name: "containerInsights", value: "disabled" }],
      capacityProviders: capacityProviders ?? [],
      defaultCapacityProviderStrategy: defaultCapacityProviderStrategy ?? [],
      createdAt: Date.now() / 1000,
    };
    this.clusters.set(key, cluster);
    return cluster;
  }

  describeClusters(clusters: string[] | undefined, region: string): { clusters: EcsCluster[]; failures: any[] } {
    const results: EcsCluster[] = [];
    const failures: any[] = [];

    if (!clusters || clusters.length === 0) {
      return { clusters: [], failures: [] };
    }

    for (const ref of clusters) {
      const name = this.resolveClusterName(ref);
      const key = this.clusterKey(region, name);
      const cluster = this.clusters.get(key);
      if (cluster) {
        results.push(cluster);
      } else {
        failures.push({
          arn: this.getClusterArn(name, region),
          reason: "MISSING",
        });
      }
    }

    return { clusters: results, failures };
  }

  listClusters(region: string): string[] {
    return this.clusters.values()
      .filter((c) => c.clusterArn.includes(`:${region}:`) && c.status === "ACTIVE")
      .map((c) => c.clusterArn);
  }

  deleteCluster(clusterRef: string, region: string): EcsCluster {
    const name = this.resolveClusterName(clusterRef);
    const key = this.clusterKey(region, name);
    const cluster = this.clusters.get(key);
    if (!cluster) {
      throw new AwsError("ClusterNotFoundException", `Cluster not found.`, 400);
    }
    cluster.status = "INACTIVE";
    this.clusters.delete(key);
    return cluster;
  }

  // --- Task Definitions ---

  registerTaskDefinition(
    family: string,
    containerDefinitions: ContainerDefinition[],
    cpu: string | undefined,
    memory: string | undefined,
    networkMode: string | undefined,
    requiresCompatibilities: string[] | undefined,
    executionRoleArn: string | undefined,
    taskRoleArn: string | undefined,
    region: string,
  ): EcsTaskDefinition {
    const currentRevision = this.familyRevisions.get(family) ?? 0;
    const revision = currentRevision + 1;
    this.familyRevisions.set(family, revision);

    const arn = buildArn("ecs", region, this.accountId, "task-definition/", `${family}:${revision}`);
    const taskDef: EcsTaskDefinition = {
      taskDefinitionArn: arn,
      family,
      revision,
      containerDefinitions,
      cpu,
      memory,
      networkMode: networkMode ?? "awsvpc",
      requiresCompatibilities: requiresCompatibilities ?? [],
      executionRoleArn,
      taskRoleArn,
      status: "ACTIVE",
      registeredAt: Date.now() / 1000,
    };

    this.taskDefinitions.set(arn, taskDef);
    return taskDef;
  }

  describeTaskDefinition(taskDefinitionRef: string, region: string): EcsTaskDefinition {
    // Could be an ARN or family:revision or just family (latest)
    if (taskDefinitionRef.startsWith("arn:")) {
      const td = this.taskDefinitions.get(taskDefinitionRef);
      if (!td || td.status === "INACTIVE") {
        throw new AwsError("ClientException", `Unable to describe task definition.`, 400);
      }
      return td;
    }

    // family:revision or family (latest)
    const parts = taskDefinitionRef.split(":");
    const family = parts[0];
    const revision = parts.length > 1 ? parseInt(parts[1], 10) : undefined;

    if (revision !== undefined) {
      const arn = buildArn("ecs", region, this.accountId, "task-definition/", `${family}:${revision}`);
      const td = this.taskDefinitions.get(arn);
      if (!td || td.status === "INACTIVE") {
        throw new AwsError("ClientException", `Unable to describe task definition.`, 400);
      }
      return td;
    }

    // Find latest active revision for the family
    const allForFamily = this.taskDefinitions.values()
      .filter((td) => td.family === family && td.status === "ACTIVE" && td.taskDefinitionArn.includes(`:${region}:`));
    if (allForFamily.length === 0) {
      throw new AwsError("ClientException", `Unable to describe task definition.`, 400);
    }
    allForFamily.sort((a, b) => b.revision - a.revision);
    return allForFamily[0];
  }

  listTaskDefinitions(familyPrefix: string | undefined, status: string | undefined, region: string): string[] {
    return this.taskDefinitions.values()
      .filter((td) => {
        if (!td.taskDefinitionArn.includes(`:${region}:`)) return false;
        if (status && td.status !== status) return false;
        if (familyPrefix && !td.family.startsWith(familyPrefix)) return false;
        if (!status && td.status !== "ACTIVE") return false;
        return true;
      })
      .map((td) => td.taskDefinitionArn);
  }

  deregisterTaskDefinition(taskDefinitionRef: string, region: string): EcsTaskDefinition {
    const td = this.describeTaskDefinition(taskDefinitionRef, region);
    td.status = "INACTIVE";
    return td;
  }

  // --- Services ---

  createService(
    clusterRef: string | undefined,
    serviceName: string,
    taskDefinition: string,
    desiredCount: number | undefined,
    launchType: string | undefined,
    networkConfiguration: any | undefined,
    region: string,
  ): EcsService {
    const clusterName = this.resolveClusterName(clusterRef);
    const clusterKey = this.clusterKey(region, clusterName);
    const cluster = this.clusters.get(clusterKey);
    if (!cluster) {
      throw new AwsError("ClusterNotFoundException", `Cluster not found.`, 400);
    }

    const clusterArn = cluster.clusterArn;
    const serviceArn = buildArn("ecs", region, this.accountId, `service/${clusterName}/`, serviceName);
    const svcKey = `${region}#${clusterName}#${serviceName}`;

    if (this.services.has(svcKey)) {
      throw new AwsError("InvalidParameterException", `Creation of service was not idempotent.`, 400);
    }

    const service: EcsService = {
      serviceName,
      serviceArn,
      clusterArn,
      taskDefinition,
      desiredCount: desiredCount ?? 1,
      runningCount: desiredCount ?? 1,
      pendingCount: 0,
      launchType: launchType ?? "FARGATE",
      networkConfiguration,
      status: "ACTIVE",
      createdAt: Date.now() / 1000,
      deployments: [
        {
          id: `ecs-svc/${crypto.randomUUID().replace(/-/g, "").substring(0, 13)}`,
          status: "PRIMARY",
          taskDefinition,
          desiredCount: desiredCount ?? 1,
          runningCount: desiredCount ?? 1,
          pendingCount: 0,
          launchType: launchType ?? "FARGATE",
          createdAt: Date.now() / 1000,
          updatedAt: Date.now() / 1000,
        },
      ],
    };

    this.services.set(svcKey, service);
    cluster.activeServicesCount++;
    return service;
  }

  describeServices(clusterRef: string | undefined, serviceNames: string[], region: string): { services: EcsService[]; failures: any[] } {
    const clusterName = this.resolveClusterName(clusterRef);
    const results: EcsService[] = [];
    const failures: any[] = [];

    for (const ref of serviceNames) {
      // Could be an ARN or a name
      let name = ref;
      if (ref.startsWith("arn:")) {
        const parts = ref.split("/");
        name = parts[parts.length - 1];
      }
      const svcKey = `${region}#${clusterName}#${name}`;
      const svc = this.services.get(svcKey);
      if (svc) {
        results.push(svc);
      } else {
        failures.push({
          arn: buildArn("ecs", region, this.accountId, `service/${clusterName}/`, name),
          reason: "MISSING",
        });
      }
    }

    return { services: results, failures };
  }

  updateService(
    clusterRef: string | undefined,
    serviceRef: string,
    taskDefinition: string | undefined,
    desiredCount: number | undefined,
    region: string,
  ): EcsService {
    const clusterName = this.resolveClusterName(clusterRef);
    let serviceName = serviceRef;
    if (serviceRef.startsWith("arn:")) {
      const parts = serviceRef.split("/");
      serviceName = parts[parts.length - 1];
    }
    const svcKey = `${region}#${clusterName}#${serviceName}`;
    const svc = this.services.get(svcKey);
    if (!svc) {
      throw new AwsError("ServiceNotFoundException", `Service not found.`, 400);
    }
    if (svc.status === "INACTIVE") {
      throw new AwsError("ServiceNotFoundException", `Service not found.`, 400);
    }
    if (taskDefinition !== undefined) svc.taskDefinition = taskDefinition;
    if (desiredCount !== undefined) {
      svc.desiredCount = desiredCount;
      svc.runningCount = desiredCount;
    }
    return svc;
  }

  deleteService(clusterRef: string | undefined, serviceRef: string, region: string): EcsService {
    const clusterName = this.resolveClusterName(clusterRef);
    let serviceName = serviceRef;
    if (serviceRef.startsWith("arn:")) {
      const parts = serviceRef.split("/");
      serviceName = parts[parts.length - 1];
    }
    const svcKey = `${region}#${clusterName}#${serviceName}`;
    const svc = this.services.get(svcKey);
    if (!svc) {
      throw new AwsError("ServiceNotFoundException", `Service not found.`, 400);
    }
    svc.status = "INACTIVE";
    svc.desiredCount = 0;
    svc.runningCount = 0;

    const clusterKey = this.clusterKey(region, clusterName);
    const cluster = this.clusters.get(clusterKey);
    if (cluster && cluster.activeServicesCount > 0) {
      cluster.activeServicesCount--;
    }

    return svc;
  }

  listServices(clusterRef: string | undefined, region: string): string[] {
    const clusterName = this.resolveClusterName(clusterRef);
    const prefix = `${region}#${clusterName}#`;
    return this.services.values()
      .filter((s) => s.serviceArn.includes(`:${region}:`) && s.clusterArn.endsWith(`/${clusterName}`) && s.status === "ACTIVE")
      .map((s) => s.serviceArn);
  }

  // --- Tasks ---

  runTask(
    clusterRef: string | undefined,
    taskDefinitionRef: string,
    count: number | undefined,
    launchType: string | undefined,
    networkConfiguration: any | undefined,
    region: string,
  ): { tasks: EcsTask[]; failures: any[] } {
    const clusterName = this.resolveClusterName(clusterRef);
    const clusterKey = this.clusterKey(region, clusterName);
    const cluster = this.clusters.get(clusterKey);
    if (!cluster) {
      throw new AwsError("ClusterNotFoundException", `Cluster not found.`, 400);
    }

    const taskDef = this.describeTaskDefinition(taskDefinitionRef, region);
    const taskCount = count ?? 1;
    const tasks: EcsTask[] = [];

    for (let i = 0; i < taskCount; i++) {
      const taskId = crypto.randomUUID();
      const taskArn = buildArn("ecs", region, this.accountId, `task/${clusterName}/`, taskId);
      const task: EcsTask = {
        taskArn,
        taskDefinitionArn: taskDef.taskDefinitionArn,
        clusterArn: cluster.clusterArn,
        lastStatus: "RUNNING",
        desiredStatus: "RUNNING",
        launchType: launchType ?? "FARGATE",
        cpu: taskDef.cpu,
        memory: taskDef.memory,
        containers: taskDef.containerDefinitions.map((cd) => ({
          name: cd.name,
          lastStatus: "RUNNING",
          containerArn: buildArn("ecs", region, this.accountId, `container/${clusterName}/`, crypto.randomUUID()),
        })),
        startedAt: Date.now() / 1000,
        createdAt: Date.now() / 1000,
      };
      this.tasks.set(taskArn, task);
      tasks.push(task);
    }

    cluster.runningTasksCount += taskCount;
    return { tasks, failures: [] };
  }

  describeTasks(clusterRef: string | undefined, taskArns: string[], region: string): { tasks: EcsTask[]; failures: any[] } {
    const results: EcsTask[] = [];
    const failures: any[] = [];

    for (const arn of taskArns) {
      const task = this.tasks.get(arn);
      if (task) {
        results.push(task);
      } else {
        failures.push({ arn, reason: "MISSING" });
      }
    }

    return { tasks: results, failures };
  }

  stopTask(clusterRef: string | undefined, taskArn: string, reason: string | undefined, region: string): EcsTask {
    const task = this.tasks.get(taskArn);
    if (!task) {
      throw new AwsError("InvalidParameterException", `Referenced task not found.`, 400);
    }
    task.lastStatus = "STOPPED";
    task.desiredStatus = "STOPPED";
    task.stoppedAt = Date.now() / 1000;
    task.stoppedReason = reason ?? "Task stopped by user";
    for (const container of task.containers) {
      container.lastStatus = "STOPPED";
    }

    // Update cluster running count
    const clusterName = this.resolveClusterName(clusterRef);
    const clusterKey = this.clusterKey(region, clusterName);
    const cluster = this.clusters.get(clusterKey);
    if (cluster && cluster.runningTasksCount > 0) {
      cluster.runningTasksCount--;
    }

    return task;
  }

  listTasks(clusterRef: string | undefined, serviceName: string | undefined, desiredStatus: string | undefined, region: string): string[] {
    const clusterName = this.resolveClusterName(clusterRef);
    const clusterArn = this.getClusterArn(clusterName, region);
    return this.tasks.values()
      .filter((t) => {
        if (t.clusterArn !== clusterArn) return false;
        if (desiredStatus && t.desiredStatus !== desiredStatus) return false;
        if (!desiredStatus && t.desiredStatus === "STOPPED") return false;
        return true;
      })
      .map((t) => t.taskArn);
  }

  // --- Container Instances ---

  private containerInstanceKey(region: string, clusterName: string, arn: string): string {
    return `${region}#${clusterName}#${arn}`;
  }

  registerContainerInstance(
    clusterRef: string | undefined,
    ec2InstanceId: string | undefined,
    totalCpu: number | undefined,
    totalMemory: number | undefined,
    region: string,
  ): EcsContainerInstance {
    const clusterName = this.resolveClusterName(clusterRef);
    const clusterKey = this.clusterKey(region, clusterName);
    const cluster = this.clusters.get(clusterKey);
    if (!cluster) {
      throw new AwsError("ClusterNotFoundException", `Cluster not found.`, 400);
    }

    const instanceId = ec2InstanceId ?? `i-${crypto.randomUUID().replace(/-/g, "").substring(0, 17)}`;
    const ciId = crypto.randomUUID();
    const containerInstanceArn = buildArn("ecs", region, this.accountId, `container-instance/${clusterName}/`, ciId);
    const cpu = totalCpu ?? 4096;
    const memory = totalMemory ?? 16384;

    const ci: EcsContainerInstance = {
      containerInstanceArn,
      ec2InstanceId: instanceId,
      status: "ACTIVE",
      registeredResources: [
        { name: "CPU", type: "INTEGER", integerValue: cpu },
        { name: "MEMORY", type: "INTEGER", integerValue: memory },
      ],
      remainingResources: [
        { name: "CPU", type: "INTEGER", integerValue: cpu },
        { name: "MEMORY", type: "INTEGER", integerValue: memory },
      ],
      runningTasksCount: 0,
      pendingTasksCount: 0,
      agentConnected: true,
      registeredAt: Date.now() / 1000,
    };

    const key = this.containerInstanceKey(region, clusterName, containerInstanceArn);
    this.containerInstances.set(key, ci);
    cluster.registeredContainerInstancesCount++;
    return ci;
  }

  describeContainerInstances(
    clusterRef: string | undefined,
    containerInstanceArns: string[],
    region: string,
  ): { containerInstances: EcsContainerInstance[]; failures: any[] } {
    const clusterName = this.resolveClusterName(clusterRef);
    const results: EcsContainerInstance[] = [];
    const failures: any[] = [];

    for (const arn of containerInstanceArns) {
      const key = this.containerInstanceKey(region, clusterName, arn);
      const ci = this.containerInstances.get(key);
      if (ci) {
        results.push(ci);
      } else {
        failures.push({ arn, reason: "MISSING" });
      }
    }

    return { containerInstances: results, failures };
  }

  listContainerInstances(clusterRef: string | undefined, status: string | undefined, region: string): string[] {
    const clusterName = this.resolveClusterName(clusterRef);
    const prefix = `${region}#${clusterName}#`;
    return this.containerInstances.values()
      .filter((ci) => {
        if (!ci.containerInstanceArn.includes(`:${region}:`)) return false;
        if (!ci.containerInstanceArn.includes(`/${clusterName}/`)) return false;
        if (status && ci.status !== status) return false;
        if (!status && ci.status === "INACTIVE") return false;
        return true;
      })
      .map((ci) => ci.containerInstanceArn);
  }

  deregisterContainerInstance(
    clusterRef: string | undefined,
    containerInstanceArn: string,
    region: string,
  ): EcsContainerInstance {
    const clusterName = this.resolveClusterName(clusterRef);
    const key = this.containerInstanceKey(region, clusterName, containerInstanceArn);
    const ci = this.containerInstances.get(key);
    if (!ci) {
      throw new AwsError("InvalidParameterException", `Container instance not found.`, 400);
    }
    ci.status = "INACTIVE";
    ci.agentConnected = false;
    this.containerInstances.delete(key);

    const clusterK = this.clusterKey(region, clusterName);
    const cluster = this.clusters.get(clusterK);
    if (cluster && cluster.registeredContainerInstancesCount > 0) {
      cluster.registeredContainerInstancesCount--;
    }

    return ci;
  }

  updateContainerInstancesState(
    clusterRef: string | undefined,
    containerInstanceArns: string[],
    status: string,
    region: string,
  ): { containerInstances: EcsContainerInstance[]; failures: any[] } {
    const clusterName = this.resolveClusterName(clusterRef);
    const results: EcsContainerInstance[] = [];
    const failures: any[] = [];

    for (const arn of containerInstanceArns) {
      const key = this.containerInstanceKey(region, clusterName, arn);
      const ci = this.containerInstances.get(key);
      if (ci) {
        ci.status = status;
        results.push(ci);
      } else {
        failures.push({ arn, reason: "MISSING" });
      }
    }

    return { containerInstances: results, failures };
  }

  // --- Task Sets ---

  createTaskSet(
    clusterRef: string,
    serviceRef: string,
    taskDefinition: string,
    scale: { value: number; unit: string } | undefined,
    launchType: string | undefined,
    networkConfiguration: any | undefined,
    region: string,
  ): EcsTaskSet {
    const clusterName = this.resolveClusterName(clusterRef);
    const clusterKey = this.clusterKey(region, clusterName);
    const cluster = this.clusters.get(clusterKey);
    if (!cluster) throw new AwsError("ClusterNotFoundException", `Cluster not found.`, 400);

    let serviceName = serviceRef;
    if (serviceRef.startsWith("arn:")) {
      const parts = serviceRef.split("/");
      serviceName = parts[parts.length - 1];
    }
    const svcKey = `${region}#${clusterName}#${serviceName}`;
    const svc = this.services.get(svcKey);
    if (!svc) throw new AwsError("ServiceNotFoundException", `Service not found.`, 400);

    const id = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
    const taskSetArn = buildArn("ecs", region, this.accountId, `task-set/${clusterName}/${serviceName}/`, id);
    const now = Date.now() / 1000;

    const taskSet: EcsTaskSet = {
      taskSetArn,
      id,
      clusterArn: cluster.clusterArn,
      serviceArn: svc.serviceArn,
      taskDefinition,
      scale: scale ?? { value: 100, unit: "PERCENT" },
      launchType: launchType ?? "FARGATE",
      networkConfiguration,
      status: "ACTIVE",
      stabilityStatus: "STEADY_STATE",
      createdAt: now,
      updatedAt: now,
    };

    this.taskSets.set(taskSetArn, taskSet);
    return taskSet;
  }

  describeTaskSets(
    clusterRef: string,
    serviceRef: string,
    taskSetArns: string[] | undefined,
    region: string,
  ): { taskSets: EcsTaskSet[]; failures: any[] } {
    const clusterName = this.resolveClusterName(clusterRef);
    let serviceName = serviceRef;
    if (serviceRef.startsWith("arn:")) {
      const parts = serviceRef.split("/");
      serviceName = parts[parts.length - 1];
    }
    const clusterArn = this.getClusterArn(clusterName, region);
    const svcKey = `${region}#${clusterName}#${serviceName}`;
    const svc = this.services.get(svcKey);
    if (!svc) throw new AwsError("ServiceNotFoundException", `Service not found.`, 400);

    let taskSets: EcsTaskSet[];
    if (taskSetArns && taskSetArns.length > 0) {
      taskSets = taskSetArns
        .map((arn) => this.taskSets.get(arn))
        .filter((ts): ts is EcsTaskSet => ts !== undefined && ts.serviceArn === svc.serviceArn);
    } else {
      taskSets = this.taskSets.values().filter(
        (ts) => ts.serviceArn === svc.serviceArn && ts.clusterArn === clusterArn && ts.status === "ACTIVE",
      );
    }

    return { taskSets, failures: [] };
  }

  deleteTaskSet(clusterRef: string, serviceRef: string, taskSetArn: string, region: string): EcsTaskSet {
    const ts = this.taskSets.get(taskSetArn);
    if (!ts) throw new AwsError("TaskSetNotFoundException", `Task set not found.`, 400);
    ts.status = "DRAINING";
    this.taskSets.delete(taskSetArn);
    return ts;
  }

  updateTaskSet(
    clusterRef: string,
    serviceRef: string,
    taskSetArn: string,
    scale: { value: number; unit: string },
    region: string,
  ): EcsTaskSet {
    const ts = this.taskSets.get(taskSetArn);
    if (!ts) throw new AwsError("TaskSetNotFoundException", `Task set not found.`, 400);
    ts.scale = scale;
    ts.updatedAt = Date.now() / 1000;
    return ts;
  }

  // --- Capacity Providers ---

  putClusterCapacityProviders(
    clusterRef: string,
    capacityProviders: string[],
    defaultCapacityProviderStrategy: any[],
    region: string,
  ): EcsCluster {
    const clusterName = this.resolveClusterName(clusterRef);
    const key = this.clusterKey(region, clusterName);
    const cluster = this.clusters.get(key);
    if (!cluster) throw new AwsError("ClusterNotFoundException", `Cluster not found.`, 400);

    cluster.capacityProviders = capacityProviders;
    cluster.defaultCapacityProviderStrategy = defaultCapacityProviderStrategy;
    return cluster;
  }

  // --- Tagging ---

  tagResource(resourceArn: string, tags: { key: string; value: string }[]): void {
    const existing = this.resourceTags.get(resourceArn) ?? [];
    for (const tag of tags) {
      const idx = existing.findIndex((t) => t.key === tag.key);
      if (idx >= 0) {
        existing[idx] = tag;
      } else {
        existing.push(tag);
      }
    }
    this.resourceTags.set(resourceArn, existing);
  }

  untagResource(resourceArn: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(resourceArn) ?? [];
    this.resourceTags.set(resourceArn, existing.filter((t) => !tagKeys.includes(t.key)));
  }

  listTagsForResource(resourceArn: string): { key: string; value: string }[] {
    return this.resourceTags.get(resourceArn) ?? [];
  }
}
