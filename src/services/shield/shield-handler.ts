import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ShieldService } from "./shield-service";

export class ShieldHandler {
  constructor(private service: ShieldService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateProtection": return this.createProtection(body, ctx);
        case "DescribeProtection": return this.describeProtection(body, ctx);
        case "ListProtections": return this.listProtections(body, ctx);
        case "DeleteProtection": return this.deleteProtection(body, ctx);
        case "CreateSubscription": return this.createSubscription(body, ctx);
        case "DescribeSubscription": return this.describeSubscription(body, ctx);
        case "DescribeAttack": return this.describeAttack(body, ctx);
        case "ListAttacks": return this.listAttacks(body, ctx);
        case "AssociateHealthCheck": return this.associateHealthCheck(body, ctx);
        case "DisassociateHealthCheck": return this.disassociateHealthCheck(body, ctx);
        case "TagResource": return this.tagResourceHandler(body, ctx);
        case "UntagResource": return this.untagResourceHandler(body, ctx);
        case "ListTagsForResource": return this.listTagsForResourceHandler(body, ctx);
        default:
          return jsonErrorResponse(new AwsError("InvalidOperationException", `Operation ${action} is not supported.`, 400), ctx.requestId);
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

  private createProtection(body: any, ctx: RequestContext): Response {
    const protectionId = this.service.createProtection(body.Name, body.ResourceArn, body.Tags);
    return this.json({ ProtectionId: protectionId }, ctx);
  }

  private describeProtection(body: any, ctx: RequestContext): Response {
    const protection = this.service.describeProtection(body.ProtectionId, body.ResourceArn);
    return this.json({
      Protection: {
        Id: protection.protectionId,
        Name: protection.name,
        ResourceArn: protection.resourceArn,
        ProtectionArn: protection.protectionArn,
        HealthCheckIds: protection.healthCheckIds,
      },
    }, ctx);
  }

  private listProtections(_body: any, ctx: RequestContext): Response {
    const protections = this.service.listProtections();
    return this.json({
      Protections: protections.map((p) => ({
        Id: p.protectionId,
        Name: p.name,
        ResourceArn: p.resourceArn,
        ProtectionArn: p.protectionArn,
        HealthCheckIds: p.healthCheckIds,
      })),
    }, ctx);
  }

  private deleteProtection(body: any, ctx: RequestContext): Response {
    this.service.deleteProtection(body.ProtectionId);
    return this.json({}, ctx);
  }

  private createSubscription(_body: any, ctx: RequestContext): Response {
    this.service.createSubscription();
    return this.json({}, ctx);
  }

  private describeSubscription(_body: any, ctx: RequestContext): Response {
    const sub = this.service.describeSubscription();
    return this.json({
      Subscription: {
        StartTime: sub.startTime,
        EndTime: sub.endTime,
        TimeCommitmentInSeconds: sub.timeCommitmentInSeconds,
        AutoRenew: sub.autoRenew,
        Limits: sub.limits,
        ProactiveEngagementStatus: sub.proactiveEngagementStatus,
        SubscriptionArn: sub.subscriptionArn,
        SubscriptionLimits: {
          ProtectionLimits: {
            ProtectedResourceTypeLimits: [
              { Type: "ELASTIC_IP_ADDRESS", Max: 100 },
              { Type: "APPLICATION_LOAD_BALANCER", Max: 50 },
            ],
          },
          ProtectionGroupLimits: {
            MaxProtectionGroups: 20,
            PatternTypeLimits: {
              ArbitraryPatternLimits: { MaxMembers: 100 },
            },
          },
        },
      },
    }, ctx);
  }

  private describeAttack(body: any, ctx: RequestContext): Response {
    const attack = this.service.describeAttack(body.AttackId);
    return this.json({
      Attack: {
        AttackId: attack.attackId,
        ResourceArn: attack.resourceArn,
        StartTime: attack.startTime,
        EndTime: attack.endTime,
        AttackVectors: attack.attackVectors,
      },
    }, ctx);
  }

  private listAttacks(_body: any, ctx: RequestContext): Response {
    const attacks = this.service.listAttacks();
    return this.json({
      AttackSummaries: attacks.map((a) => ({
        AttackId: a.attackId,
        ResourceArn: a.resourceArn,
        StartTime: a.startTime,
        EndTime: a.endTime,
        AttackVectors: a.attackVectors,
      })),
    }, ctx);
  }

  private associateHealthCheck(body: any, ctx: RequestContext): Response {
    this.service.associateHealthCheck(body.ProtectionId, body.HealthCheckArn);
    return this.json({}, ctx);
  }

  private disassociateHealthCheck(body: any, ctx: RequestContext): Response {
    this.service.disassociateHealthCheck(body.ProtectionId, body.HealthCheckArn);
    return this.json({}, ctx);
  }

  private tagResourceHandler(body: any, ctx: RequestContext): Response {
    this.service.tagResource(body.ResourceARN, body.Tags);
    return this.json({}, ctx);
  }

  private untagResourceHandler(body: any, ctx: RequestContext): Response {
    this.service.untagResource(body.ResourceARN, body.TagKeys);
    return this.json({}, ctx);
  }

  private listTagsForResourceHandler(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTagsForResource(body.ResourceARN);
    return this.json({ Tags: tags }, ctx);
  }
}
