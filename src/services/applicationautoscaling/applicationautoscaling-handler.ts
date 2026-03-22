import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ApplicationAutoScalingService } from "./applicationautoscaling-service";

export class ApplicationAutoScalingHandler {
  constructor(private service: ApplicationAutoScalingService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "RegisterScalableTarget": return this.registerScalableTarget(body, ctx);
        case "DescribeScalableTargets": return this.describeScalableTargets(body, ctx);
        case "DeregisterScalableTarget": return this.deregisterScalableTarget(body, ctx);
        case "PutScalingPolicy": return this.putScalingPolicy(body, ctx);
        case "DescribeScalingPolicies": return this.describeScalingPolicies(body, ctx);
        case "DeleteScalingPolicy": return this.deleteScalingPolicy(body, ctx);
        case "DescribeScalingActivities": return this.describeScalingActivities(body, ctx);
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

  private registerScalableTarget(body: any, ctx: RequestContext): Response {
    this.service.registerScalableTarget(
      body.ServiceNamespace,
      body.ResourceId,
      body.ScalableDimension,
      body.MinCapacity,
      body.MaxCapacity,
      body.RoleARN,
      body.SuspendedState,
      ctx.region,
    );
    return this.json({ScalableTargetARN: `arn:aws:application-autoscaling:${ctx.region}:${ctx.accountId}:scalable-target/${body.ServiceNamespace}/${body.ResourceId}`}, ctx);
  }

  private describeScalableTargets(body: any, ctx: RequestContext): Response {
    const targets = this.service.describeScalableTargets(
      body.ServiceNamespace,
      body.ResourceIds,
      body.ScalableDimension,
    );
    return this.json({
      ScalableTargets: targets.map((t) => ({
        ServiceNamespace: t.serviceNamespace,
        ResourceId: t.resourceId,
        ScalableDimension: t.scalableDimension,
        MinCapacity: t.minCapacity,
        MaxCapacity: t.maxCapacity,
        RoleARN: t.roleARN,
        CreationTime: t.creationTime,
        SuspendedState: t.suspendedState,
      })),
    }, ctx);
  }

  private deregisterScalableTarget(body: any, ctx: RequestContext): Response {
    this.service.deregisterScalableTarget(
      body.ServiceNamespace,
      body.ResourceId,
      body.ScalableDimension,
    );
    return this.json({}, ctx);
  }

  private putScalingPolicy(body: any, ctx: RequestContext): Response {
    const policy = this.service.putScalingPolicy(
      body.PolicyName,
      body.ServiceNamespace,
      body.ResourceId,
      body.ScalableDimension,
      body.PolicyType,
      body.TargetTrackingScalingPolicyConfiguration,
      body.StepScalingPolicyConfiguration,
      ctx.region,
    );
    return this.json({
      PolicyARN: policy.policyARN,
      Alarms: policy.alarms.map((a) => ({ AlarmName: a.alarmName, AlarmARN: a.alarmARN })),
    }, ctx);
  }

  private describeScalingPolicies(body: any, ctx: RequestContext): Response {
    const policies = this.service.describeScalingPolicies(
      body.ServiceNamespace,
      body.ResourceId,
      body.PolicyNames,
      body.ScalableDimension,
    );
    return this.json({
      ScalingPolicies: policies.map((p) => ({
        PolicyARN: p.policyARN,
        PolicyName: p.policyName,
        ServiceNamespace: p.serviceNamespace,
        ResourceId: p.resourceId,
        ScalableDimension: p.scalableDimension,
        PolicyType: p.policyType,
        TargetTrackingScalingPolicyConfiguration: p.targetTrackingScalingPolicyConfiguration,
        StepScalingPolicyConfiguration: p.stepScalingPolicyConfiguration,
        Alarms: p.alarms.map((a) => ({ AlarmName: a.alarmName, AlarmARN: a.alarmARN })),
        CreationTime: p.creationTime,
      })),
    }, ctx);
  }

  private deleteScalingPolicy(body: any, ctx: RequestContext): Response {
    this.service.deleteScalingPolicy(
      body.PolicyName,
      body.ServiceNamespace,
      body.ResourceId,
      body.ScalableDimension,
    );
    return this.json({}, ctx);
  }

  private describeScalingActivities(body: any, ctx: RequestContext): Response {
    const activities = this.service.describeScalingActivities(
      body.ServiceNamespace,
      body.ResourceId,
      body.ScalableDimension,
    );
    return this.json({
      ScalingActivities: activities.map((a) => ({
        ActivityId: a.activityId,
        ServiceNamespace: a.serviceNamespace,
        ResourceId: a.resourceId,
        ScalableDimension: a.scalableDimension,
        Description: a.description,
        Cause: a.cause,
        StartTime: a.startTime,
        EndTime: a.endTime,
        StatusCode: a.statusCode,
      })),
    }, ctx);
  }
}
