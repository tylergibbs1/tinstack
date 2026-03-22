import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { EcsServiceImpl } from "./ecs-service";

export class EcsHandler {
  constructor(private service: EcsServiceImpl) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateCluster": return this.createCluster(body, ctx);
        case "DescribeClusters": return this.describeClusters(body, ctx);
        case "ListClusters": return this.listClusters(body, ctx);
        case "DeleteCluster": return this.deleteCluster(body, ctx);
        case "RegisterTaskDefinition": return this.registerTaskDefinition(body, ctx);
        case "DescribeTaskDefinition": return this.describeTaskDefinition(body, ctx);
        case "ListTaskDefinitions": return this.listTaskDefinitions(body, ctx);
        case "DeregisterTaskDefinition": return this.deregisterTaskDefinition(body, ctx);
        case "CreateService": return this.createService(body, ctx);
        case "DescribeServices": return this.describeServices(body, ctx);
        case "UpdateService": return this.updateService(body, ctx);
        case "DeleteService": return this.deleteService(body, ctx);
        case "ListServices": return this.listServices(body, ctx);
        case "RunTask": return this.runTask(body, ctx);
        case "DescribeTasks": return this.describeTasks(body, ctx);
        case "StopTask": return this.stopTask(body, ctx);
        case "ListTasks": return this.listTasks(body, ctx);
        case "RegisterContainerInstance": return this.registerContainerInstance(body, ctx);
        case "DescribeContainerInstances": return this.describeContainerInstances(body, ctx);
        case "ListContainerInstances": return this.listContainerInstances(body, ctx);
        case "DeregisterContainerInstance": return this.deregisterContainerInstance(body, ctx);
        case "UpdateContainerInstancesState": return this.updateContainerInstancesState(body, ctx);
        case "CreateTaskSet": return this.createTaskSet(body, ctx);
        case "DescribeTaskSets": return this.describeTaskSets(body, ctx);
        case "DeleteTaskSet": return this.deleteTaskSet(body, ctx);
        case "UpdateTaskSet": return this.updateTaskSet(body, ctx);
        case "PutClusterCapacityProviders": return this.putClusterCapacityProviders(body, ctx);
        case "TagResource": return this.tagResource(body, ctx);
        case "UntagResource": return this.untagResource(body, ctx);
        case "ListTagsForResource": return this.listTagsForResource(body, ctx);
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private createCluster(body: any, ctx: RequestContext): Response {
    const cluster = this.service.createCluster(
      body.clusterName,
      body.settings,
      body.capacityProviders,
      body.defaultCapacityProviderStrategy,
      ctx.region,
    );
    return this.json({ cluster }, ctx);
  }

  private describeClusters(body: any, ctx: RequestContext): Response {
    const result = this.service.describeClusters(body.clusters, ctx.region);
    return this.json(result, ctx);
  }

  private listClusters(body: any, ctx: RequestContext): Response {
    const clusterArns = this.service.listClusters(ctx.region);
    return this.json({ clusterArns }, ctx);
  }

  private deleteCluster(body: any, ctx: RequestContext): Response {
    const cluster = this.service.deleteCluster(body.cluster, ctx.region);
    return this.json({ cluster }, ctx);
  }

  private registerTaskDefinition(body: any, ctx: RequestContext): Response {
    const taskDefinition = this.service.registerTaskDefinition(
      body.family,
      body.containerDefinitions,
      body.cpu,
      body.memory,
      body.networkMode,
      body.requiresCompatibilities,
      body.executionRoleArn,
      body.taskRoleArn,
      ctx.region,
    );
    return this.json({ taskDefinition }, ctx);
  }

  private describeTaskDefinition(body: any, ctx: RequestContext): Response {
    const taskDefinition = this.service.describeTaskDefinition(body.taskDefinition, ctx.region);
    return this.json({ taskDefinition }, ctx);
  }

  private listTaskDefinitions(body: any, ctx: RequestContext): Response {
    const taskDefinitionArns = this.service.listTaskDefinitions(
      body.familyPrefix,
      body.status,
      ctx.region,
    );
    return this.json({ taskDefinitionArns }, ctx);
  }

  private deregisterTaskDefinition(body: any, ctx: RequestContext): Response {
    const taskDefinition = this.service.deregisterTaskDefinition(body.taskDefinition, ctx.region);
    return this.json({ taskDefinition }, ctx);
  }

  private createService(body: any, ctx: RequestContext): Response {
    const service = this.service.createService(
      body.cluster,
      body.serviceName,
      body.taskDefinition,
      body.desiredCount,
      body.launchType,
      body.networkConfiguration,
      ctx.region,
    );
    return this.json({ service }, ctx);
  }

  private describeServices(body: any, ctx: RequestContext): Response {
    const result = this.service.describeServices(body.cluster, body.services ?? [], ctx.region);
    return this.json(result, ctx);
  }

  private updateService(body: any, ctx: RequestContext): Response {
    const service = this.service.updateService(
      body.cluster,
      body.service,
      body.taskDefinition,
      body.desiredCount,
      ctx.region,
    );
    return this.json({ service }, ctx);
  }

  private deleteService(body: any, ctx: RequestContext): Response {
    const service = this.service.deleteService(body.cluster, body.service, ctx.region);
    return this.json({ service }, ctx);
  }

  private listServices(body: any, ctx: RequestContext): Response {
    const serviceArns = this.service.listServices(body.cluster, ctx.region);
    return this.json({ serviceArns }, ctx);
  }

  private runTask(body: any, ctx: RequestContext): Response {
    const result = this.service.runTask(
      body.cluster,
      body.taskDefinition,
      body.count,
      body.launchType,
      body.networkConfiguration,
      ctx.region,
    );
    return this.json(result, ctx);
  }

  private describeTasks(body: any, ctx: RequestContext): Response {
    const result = this.service.describeTasks(body.cluster, body.tasks ?? [], ctx.region);
    return this.json(result, ctx);
  }

  private stopTask(body: any, ctx: RequestContext): Response {
    const task = this.service.stopTask(body.cluster, body.task, body.reason, ctx.region);
    return this.json({ task }, ctx);
  }

  private listTasks(body: any, ctx: RequestContext): Response {
    const taskArns = this.service.listTasks(body.cluster, body.serviceName, body.desiredStatus, ctx.region);
    return this.json({ taskArns }, ctx);
  }

  private registerContainerInstance(body: any, ctx: RequestContext): Response {
    const containerInstance = this.service.registerContainerInstance(
      body.cluster,
      body.instanceIdentityDocument?.instanceId,
      body.totalResources?.find((r: any) => r.name === "CPU")?.integerValue,
      body.totalResources?.find((r: any) => r.name === "MEMORY")?.integerValue,
      ctx.region,
    );
    return this.json({ containerInstance }, ctx);
  }

  private describeContainerInstances(body: any, ctx: RequestContext): Response {
    const result = this.service.describeContainerInstances(body.cluster, body.containerInstances ?? [], ctx.region);
    return this.json(result, ctx);
  }

  private listContainerInstances(body: any, ctx: RequestContext): Response {
    const containerInstanceArns = this.service.listContainerInstances(body.cluster, body.status, ctx.region);
    return this.json({ containerInstanceArns }, ctx);
  }

  private deregisterContainerInstance(body: any, ctx: RequestContext): Response {
    const containerInstance = this.service.deregisterContainerInstance(body.cluster, body.containerInstance, ctx.region);
    return this.json({ containerInstance }, ctx);
  }

  private updateContainerInstancesState(body: any, ctx: RequestContext): Response {
    const result = this.service.updateContainerInstancesState(
      body.cluster,
      body.containerInstances ?? [],
      body.status,
      ctx.region,
    );
    return this.json(result, ctx);
  }

  private createTaskSet(body: any, ctx: RequestContext): Response {
    const taskSet = this.service.createTaskSet(
      body.cluster,
      body.service,
      body.taskDefinition,
      body.scale,
      body.launchType,
      body.networkConfiguration,
      ctx.region,
    );
    return this.json({ taskSet }, ctx);
  }

  private describeTaskSets(body: any, ctx: RequestContext): Response {
    const result = this.service.describeTaskSets(
      body.cluster,
      body.service,
      body.taskSets,
      ctx.region,
    );
    return this.json(result, ctx);
  }

  private deleteTaskSet(body: any, ctx: RequestContext): Response {
    const taskSet = this.service.deleteTaskSet(body.cluster, body.service, body.taskSet, ctx.region);
    return this.json({ taskSet }, ctx);
  }

  private updateTaskSet(body: any, ctx: RequestContext): Response {
    const taskSet = this.service.updateTaskSet(
      body.cluster,
      body.service,
      body.taskSet,
      body.scale,
      ctx.region,
    );
    return this.json({ taskSet }, ctx);
  }

  private putClusterCapacityProviders(body: any, ctx: RequestContext): Response {
    const cluster = this.service.putClusterCapacityProviders(
      body.cluster,
      body.capacityProviders ?? [],
      body.defaultCapacityProviderStrategy ?? [],
      ctx.region,
    );
    return this.json({ cluster }, ctx);
  }

  private tagResource(body: any, ctx: RequestContext): Response {
    this.service.tagResource(body.resourceArn, body.tags ?? []);
    return this.json({}, ctx);
  }

  private untagResource(body: any, ctx: RequestContext): Response {
    this.service.untagResource(body.resourceArn, body.tagKeys ?? []);
    return this.json({}, ctx);
  }

  private listTagsForResource(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTagsForResource(body.resourceArn);
    return this.json({ tags }, ctx);
  }
}
