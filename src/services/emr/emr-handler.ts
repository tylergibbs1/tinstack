import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { EmrService } from "./emr-service";

export class EmrHandler {
  constructor(private service: EmrService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "RunJobFlow": return this.runJobFlow(body, ctx);
        case "DescribeCluster": return this.describeCluster(body, ctx);
        case "ListClusters": return this.listClusters(body, ctx);
        case "TerminateJobFlows": return this.terminateJobFlows(body, ctx);
        case "AddJobFlowSteps": return this.addJobFlowSteps(body, ctx);
        case "ListSteps": return this.listSteps(body, ctx);
        case "DescribeStep": return this.describeStep(body, ctx);
        case "SetTerminationProtection": return this.setTerminationProtection(body, ctx);
        case "AddTags": return this.addTags(body, ctx);
        case "RemoveTags": return this.removeTags(body, ctx);
        case "ListInstanceGroups": return this.listInstanceGroups(body, ctx);
        case "PutAutoScalingPolicy": return this.putAutoScalingPolicy(body, ctx);
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

  private runJobFlow(body: any, ctx: RequestContext): Response {
    const cluster = this.service.runJobFlow(
      body.Name, body.LogUri, body.ReleaseLabel, body.Applications,
      body.Instances, body.Steps, body.ServiceRole, body.JobFlowRole,
      body.VisibleToAllUsers, body.Tags, ctx.region,
    );
    return this.json({ JobFlowId: cluster.id }, ctx);
  }

  private describeCluster(body: any, ctx: RequestContext): Response {
    const cluster = this.service.describeCluster(body.ClusterId);
    return this.json({
      Cluster: {
        Id: cluster.id,
        Name: cluster.name,
        Arn: cluster.arn,
        Status: {
          State: cluster.status.state,
          StateChangeReason: cluster.status.stateChangeReason,
          Timeline: {
            CreationDateTime: cluster.status.timeline.creationDateTime / 1000,
            ReadyDateTime: cluster.status.timeline.readyDateTime ? cluster.status.timeline.readyDateTime / 1000 : undefined,
            EndDateTime: cluster.status.timeline.endDateTime ? cluster.status.timeline.endDateTime / 1000 : undefined,
          },
        },
        LogUri: cluster.logUri,
        ReleaseLabel: cluster.releaseLabel,
        Applications: cluster.applications.map((a) => ({ Name: a.name, Version: a.version })),
        ServiceRole: cluster.serviceRole,
        VisibleToAllUsers: cluster.visibleToAllUsers,
        AutoTerminate: cluster.autoTerminate,
        TerminationProtected: cluster.terminationProtected,
        Tags: cluster.tags,
        NormalizedInstanceHours: cluster.normalizedInstanceHours,
      },
    }, ctx);
  }

  private listClusters(body: any, ctx: RequestContext): Response {
    const clusters = this.service.listClusters(body.ClusterStates);
    return this.json({
      Clusters: clusters.map((c) => ({
        Id: c.id,
        Name: c.name,
        Status: {
          State: c.status.state,
          StateChangeReason: c.status.stateChangeReason,
          Timeline: {
            CreationDateTime: c.status.timeline.creationDateTime / 1000,
          },
        },
        NormalizedInstanceHours: c.normalizedInstanceHours,
      })),
    }, ctx);
  }

  private terminateJobFlows(body: any, ctx: RequestContext): Response {
    this.service.terminateJobFlows(body.JobFlowIds ?? []);
    return this.json({}, ctx);
  }

  private addJobFlowSteps(body: any, ctx: RequestContext): Response {
    const ids = this.service.addJobFlowSteps(body.JobFlowId, body.Steps ?? []);
    return this.json({ StepIds: ids }, ctx);
  }

  private listSteps(body: any, ctx: RequestContext): Response {
    const steps = this.service.listSteps(body.ClusterId, body.StepStates);
    return this.json({
      Steps: steps.map((s) => ({
        Id: s.id,
        Name: s.name,
        Status: { State: s.status.state },
        ActionOnFailure: s.actionOnFailure,
        Config: { Jar: s.config.jar, Args: s.config.args },
      })),
    }, ctx);
  }

  private describeStep(body: any, ctx: RequestContext): Response {
    const step = this.service.describeStep(body.ClusterId, body.StepId);
    return this.json({
      Step: {
        Id: step.id,
        Name: step.name,
        Status: { State: step.status.state },
        ActionOnFailure: step.actionOnFailure,
        Config: { Jar: step.config.jar, Args: step.config.args },
      },
    }, ctx);
  }

  private setTerminationProtection(body: any, ctx: RequestContext): Response {
    this.service.setTerminationProtection(body.JobFlowIds ?? [], body.TerminationProtected ?? false);
    return this.json({}, ctx);
  }

  private addTags(body: any, ctx: RequestContext): Response {
    this.service.addTags(body.ResourceId, body.Tags ?? []);
    return this.json({}, ctx);
  }

  private removeTags(body: any, ctx: RequestContext): Response {
    this.service.removeTags(body.ResourceId, body.TagKeys ?? []);
    return this.json({}, ctx);
  }

  private listInstanceGroups(body: any, ctx: RequestContext): Response {
    const groups = this.service.listInstanceGroups(body.ClusterId);
    return this.json({
      InstanceGroups: groups.map((g) => ({
        Id: g.id,
        Name: g.name,
        InstanceGroupType: g.instanceGroupType,
        InstanceType: g.instanceType,
        RequestedInstanceCount: g.requestedInstanceCount,
        RunningInstanceCount: g.runningInstanceCount,
        Status: g.status,
        Market: g.market,
      })),
    }, ctx);
  }

  private putAutoScalingPolicy(body: any, ctx: RequestContext): Response {
    const ig = this.service.putAutoScalingPolicy(body.ClusterId, body.InstanceGroupId, body.AutoScalingPolicy);
    return this.json({
      ClusterId: body.ClusterId,
      InstanceGroupId: ig.id,
      AutoScalingPolicy: ig.autoScalingPolicy,
    }, ctx);
  }
}
