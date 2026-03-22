import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface EmrCluster {
  id: string;
  name: string;
  arn: string;
  status: { state: string; stateChangeReason: { code?: string; message?: string }; timeline: { creationDateTime: number; readyDateTime?: number; endDateTime?: number } };
  logUri?: string;
  releaseLabel?: string;
  applications: { name: string; version?: string }[];
  serviceRole?: string;
  jobFlowRole?: string;
  visibleToAllUsers: boolean;
  autoTerminate: boolean;
  terminationProtected: boolean;
  tags: { Key: string; Value: string }[];
  instanceGroups: EmrInstanceGroup[];
  steps: EmrStep[];
  normalizedInstanceHours: number;
}

export interface EmrInstanceGroup {
  id: string;
  name: string;
  instanceGroupType: string;
  instanceType: string;
  requestedInstanceCount: number;
  runningInstanceCount: number;
  status: { state: string };
  market: string;
  autoScalingPolicy?: Record<string, any>;
}

export interface EmrStep {
  id: string;
  name: string;
  status: { state: string; stateChangeReason?: { code?: string; message?: string }; timeline: { creationDateTime: number; startDateTime?: number; endDateTime?: number } };
  actionOnFailure: string;
  config: { jar: string; args?: string[]; mainClass?: string; properties?: Record<string, string> };
}

export class EmrService {
  private clusters: StorageBackend<string, EmrCluster>;
  private clusterCounter = 0;
  private stepCounter = 0;
  private igCounter = 0;

  constructor(private accountId: string) {
    this.clusters = new InMemoryStorage();
  }

  runJobFlow(
    name: string,
    logUri: string | undefined,
    releaseLabel: string | undefined,
    applications: { Name: string; Version?: string }[] | undefined,
    instances: Record<string, any> | undefined,
    steps: any[] | undefined,
    serviceRole: string | undefined,
    jobFlowRole: string | undefined,
    visibleToAllUsers: boolean | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): EmrCluster {
    const id = `j-${(++this.clusterCounter).toString().padStart(13, "0").toUpperCase()}`;
    const arn = buildArn("elasticmapreduce", region, this.accountId, "cluster/", id);
    const now = Date.now();

    const instanceGroups: EmrInstanceGroup[] = [];
    if (instances?.InstanceGroups) {
      for (const ig of instances.InstanceGroups) {
        instanceGroups.push(this.createInstanceGroup(ig));
      }
    } else if (instances?.MasterInstanceType) {
      instanceGroups.push(this.createInstanceGroup({
        InstanceRole: "MASTER", InstanceType: instances.MasterInstanceType, InstanceCount: 1, Name: "master",
      }));
      if (instances.SlaveInstanceType) {
        instanceGroups.push(this.createInstanceGroup({
          InstanceRole: "CORE", InstanceType: instances.SlaveInstanceType, InstanceCount: instances.InstanceCount ?? 1, Name: "core",
        }));
      }
    }

    const emrSteps: EmrStep[] = [];
    if (steps) {
      for (const s of steps) emrSteps.push(this.createStep(s));
    }

    const cluster: EmrCluster = {
      id,
      name,
      arn,
      status: {
        state: "RUNNING",
        stateChangeReason: {},
        timeline: { creationDateTime: now, readyDateTime: now },
      },
      logUri,
      releaseLabel: releaseLabel ?? "emr-6.10.0",
      applications: (applications ?? []).map((a) => ({ name: a.Name, version: a.Version })),
      serviceRole,
      jobFlowRole,
      visibleToAllUsers: visibleToAllUsers ?? true,
      autoTerminate: false,
      terminationProtected: false,
      tags: tags ?? [],
      instanceGroups,
      steps: emrSteps,
      normalizedInstanceHours: 0,
    };
    this.clusters.set(id, cluster);
    return cluster;
  }

  describeCluster(clusterId: string): EmrCluster {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) throw new AwsError("InvalidRequestException", `Cluster ${clusterId} not found.`, 400);
    return cluster;
  }

  listClusters(states?: string[]): { id: string; name: string; status: EmrCluster["status"]; normalizedInstanceHours: number }[] {
    let clusters = this.clusters.values();
    if (states && states.length > 0) {
      clusters = clusters.filter((c) => states.includes(c.status.state));
    }
    return clusters.map((c) => ({
      id: c.id, name: c.name, status: c.status, normalizedInstanceHours: c.normalizedInstanceHours,
    }));
  }

  terminateJobFlows(jobFlowIds: string[]): void {
    for (const id of jobFlowIds) {
      const cluster = this.clusters.get(id);
      if (cluster) {
        cluster.status.state = "TERMINATED";
        cluster.status.stateChangeReason = { code: "USER_REQUEST", message: "Terminated by user request" };
        cluster.status.timeline.endDateTime = Date.now();
        this.clusters.set(id, cluster);
      }
    }
  }

  addJobFlowSteps(clusterId: string, steps: any[]): string[] {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) throw new AwsError("InvalidRequestException", `Cluster ${clusterId} not found.`, 400);
    const ids: string[] = [];
    for (const s of steps) {
      const step = this.createStep(s);
      cluster.steps.push(step);
      ids.push(step.id);
    }
    this.clusters.set(clusterId, cluster);
    return ids;
  }

  listSteps(clusterId: string, states?: string[]): EmrStep[] {
    const cluster = this.describeCluster(clusterId);
    let steps = cluster.steps;
    if (states && states.length > 0) {
      steps = steps.filter((s) => states.includes(s.status.state));
    }
    return steps;
  }

  describeStep(clusterId: string, stepId: string): EmrStep {
    const cluster = this.describeCluster(clusterId);
    const step = cluster.steps.find((s) => s.id === stepId);
    if (!step) throw new AwsError("InvalidRequestException", `Step ${stepId} not found.`, 400);
    return step;
  }

  setTerminationProtection(jobFlowIds: string[], protect: boolean): void {
    for (const id of jobFlowIds) {
      const cluster = this.clusters.get(id);
      if (cluster) {
        cluster.terminationProtected = protect;
        this.clusters.set(id, cluster);
      }
    }
  }

  addTags(resourceId: string, tags: { Key: string; Value: string }[]): void {
    const cluster = this.clusters.get(resourceId);
    if (!cluster) throw new AwsError("InvalidRequestException", `Resource ${resourceId} not found.`, 400);
    const existing = new Map(cluster.tags.map((t) => [t.Key, t.Value]));
    for (const t of tags) existing.set(t.Key, t.Value);
    cluster.tags = Array.from(existing.entries()).map(([Key, Value]) => ({ Key, Value }));
    this.clusters.set(resourceId, cluster);
  }

  removeTags(resourceId: string, tagKeys: string[]): void {
    const cluster = this.clusters.get(resourceId);
    if (!cluster) throw new AwsError("InvalidRequestException", `Resource ${resourceId} not found.`, 400);
    cluster.tags = cluster.tags.filter((t) => !tagKeys.includes(t.Key));
    this.clusters.set(resourceId, cluster);
  }

  listInstanceGroups(clusterId: string): EmrInstanceGroup[] {
    const cluster = this.describeCluster(clusterId);
    return cluster.instanceGroups;
  }

  putAutoScalingPolicy(clusterId: string, instanceGroupId: string, policy: Record<string, any>): EmrInstanceGroup {
    const cluster = this.describeCluster(clusterId);
    const ig = cluster.instanceGroups.find((g) => g.id === instanceGroupId);
    if (!ig) throw new AwsError("InvalidRequestException", `Instance group ${instanceGroupId} not found.`, 400);
    ig.autoScalingPolicy = policy;
    this.clusters.set(clusterId, cluster);
    return ig;
  }

  private createStep(input: any): EmrStep {
    const id = `s-${(++this.stepCounter).toString().padStart(13, "0").toUpperCase()}`;
    const now = Date.now();
    return {
      id,
      name: input.Name ?? "step",
      status: {
        state: "COMPLETED",
        timeline: { creationDateTime: now, startDateTime: now, endDateTime: now },
      },
      actionOnFailure: input.ActionOnFailure ?? "CONTINUE",
      config: {
        jar: input.HadoopJarStep?.Jar ?? "command-runner.jar",
        args: input.HadoopJarStep?.Args,
        mainClass: input.HadoopJarStep?.MainClass,
        properties: input.HadoopJarStep?.Properties,
      },
    };
  }

  private createInstanceGroup(input: any): EmrInstanceGroup {
    const id = `ig-${(++this.igCounter).toString().padStart(13, "0").toUpperCase()}`;
    return {
      id,
      name: input.Name ?? input.InstanceRole?.toLowerCase() ?? "group",
      instanceGroupType: input.InstanceRole ?? "CORE",
      instanceType: input.InstanceType ?? "m5.xlarge",
      requestedInstanceCount: input.InstanceCount ?? 1,
      runningInstanceCount: input.InstanceCount ?? 1,
      status: { state: "RUNNING" },
      market: input.Market ?? "ON_DEMAND",
    };
  }
}
