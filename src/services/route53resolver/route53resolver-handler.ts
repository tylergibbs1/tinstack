import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { Route53ResolverService } from "./route53resolver-service";

export class Route53ResolverHandler {
  constructor(private service: Route53ResolverService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateResolverEndpoint": return this.createResolverEndpoint(body, ctx);
        case "GetResolverEndpoint": return this.getResolverEndpoint(body, ctx);
        case "ListResolverEndpoints": return this.listResolverEndpoints(ctx);
        case "DeleteResolverEndpoint": return this.deleteResolverEndpoint(body, ctx);
        case "UpdateResolverEndpoint": return this.updateResolverEndpoint(body, ctx);
        case "CreateResolverRule": return this.createResolverRule(body, ctx);
        case "GetResolverRule": return this.getResolverRule(body, ctx);
        case "ListResolverRules": return this.listResolverRules(ctx);
        case "DeleteResolverRule": return this.deleteResolverRule(body, ctx);
        case "AssociateResolverRule": return this.associateResolverRule(body, ctx);
        case "DisassociateResolverRule": return this.disassociateResolverRule(body, ctx);
        case "ListResolverRuleAssociations": return this.listResolverRuleAssociations(ctx);
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

  private createResolverEndpoint(body: any, ctx: RequestContext): Response {
    const ep = this.service.createResolverEndpoint(
      body.Name,
      body.Direction,
      body.IpAddresses ?? [],
      body.SecurityGroupIds ?? [],
      ctx.region,
    );
    return this.json({ ResolverEndpoint: endpointToJson(ep) }, ctx);
  }

  private getResolverEndpoint(body: any, ctx: RequestContext): Response {
    const ep = this.service.getResolverEndpoint(body.ResolverEndpointId);
    return this.json({ ResolverEndpoint: endpointToJson(ep) }, ctx);
  }

  private listResolverEndpoints(ctx: RequestContext): Response {
    const endpoints = this.service.listResolverEndpoints();
    return this.json({
      ResolverEndpoints: endpoints.map(endpointToJson),
      MaxResults: 100,
    }, ctx);
  }

  private deleteResolverEndpoint(body: any, ctx: RequestContext): Response {
    const ep = this.service.deleteResolverEndpoint(body.ResolverEndpointId);
    return this.json({ ResolverEndpoint: endpointToJson(ep) }, ctx);
  }

  private updateResolverEndpoint(body: any, ctx: RequestContext): Response {
    const ep = this.service.updateResolverEndpoint(body.ResolverEndpointId, body.Name);
    return this.json({ ResolverEndpoint: endpointToJson(ep) }, ctx);
  }

  private createResolverRule(body: any, ctx: RequestContext): Response {
    const rule = this.service.createResolverRule(
      body.Name,
      body.RuleType,
      body.DomainName,
      body.TargetIps ?? [],
      body.ResolverEndpointId,
      ctx.region,
    );
    return this.json({ ResolverRule: ruleToJson(rule) }, ctx);
  }

  private getResolverRule(body: any, ctx: RequestContext): Response {
    const rule = this.service.getResolverRule(body.ResolverRuleId);
    return this.json({ ResolverRule: ruleToJson(rule) }, ctx);
  }

  private listResolverRules(ctx: RequestContext): Response {
    const rules = this.service.listResolverRules();
    return this.json({ ResolverRules: rules.map(ruleToJson), MaxResults: 100 }, ctx);
  }

  private deleteResolverRule(body: any, ctx: RequestContext): Response {
    const rule = this.service.deleteResolverRule(body.ResolverRuleId);
    return this.json({ ResolverRule: ruleToJson(rule) }, ctx);
  }

  private associateResolverRule(body: any, ctx: RequestContext): Response {
    const assoc = this.service.associateResolverRule(body.ResolverRuleId, body.VPCId, body.Name);
    return this.json({ ResolverRuleAssociation: assocToJson(assoc) }, ctx);
  }

  private disassociateResolverRule(body: any, ctx: RequestContext): Response {
    const assoc = this.service.disassociateResolverRule(body.ResolverRuleId, body.VPCId);
    return this.json({ ResolverRuleAssociation: assocToJson(assoc) }, ctx);
  }

  private listResolverRuleAssociations(ctx: RequestContext): Response {
    const assocs = this.service.listResolverRuleAssociations();
    return this.json({ ResolverRuleAssociations: assocs.map(assocToJson), MaxResults: 100 }, ctx);
  }

  private tagResource(body: any, ctx: RequestContext): Response {
    this.service.tagResource(body.ResourceArn, body.Tags ?? []);
    return this.json({}, ctx);
  }

  private untagResource(body: any, ctx: RequestContext): Response {
    this.service.untagResource(body.ResourceArn, body.TagKeys ?? []);
    return this.json({}, ctx);
  }

  private listTagsForResource(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTagsForResource(body.ResourceArn);
    return this.json({ Tags: tags }, ctx);
  }
}

function endpointToJson(ep: any) {
  return {
    Id: ep.id,
    Arn: ep.arn,
    Name: ep.name,
    Direction: ep.direction,
    IpAddressCount: ep.ipAddresses.length,
    SecurityGroupIds: ep.securityGroupIds,
    Status: ep.status,
    StatusMessage: ep.statusMessage,
    HostVPCId: ep.hostVpcId,
    CreationTime: ep.creationTime,
    ModificationTime: ep.modificationTime,
  };
}

function ruleToJson(rule: any) {
  return {
    Id: rule.id,
    Arn: rule.arn,
    Name: rule.name,
    RuleType: rule.ruleType,
    DomainName: rule.domainName,
    TargetIps: rule.targetIps,
    ResolverEndpointId: rule.resolverEndpointId,
    Status: rule.status,
    StatusMessage: rule.statusMessage,
    CreationTime: rule.creationTime,
    ModificationTime: rule.modificationTime,
  };
}

function assocToJson(assoc: any) {
  return {
    Id: assoc.id,
    ResolverRuleId: assoc.resolverRuleId,
    VPCId: assoc.vpcId,
    Name: assoc.name,
    Status: assoc.status,
    StatusMessage: assoc.statusMessage,
  };
}
