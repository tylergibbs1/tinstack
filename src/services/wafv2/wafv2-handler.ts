import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { Wafv2Service } from "./wafv2-service";

export class Wafv2Handler {
  constructor(private service: Wafv2Service) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateWebACL": return this.createWebACL(body, ctx);
        case "GetWebACL": return this.getWebACL(body, ctx);
        case "ListWebACLs": return this.listWebACLs(body, ctx);
        case "UpdateWebACL": return this.updateWebACL(body, ctx);
        case "DeleteWebACL": return this.deleteWebACL(body, ctx);
        case "CreateIPSet": return this.createIPSet(body, ctx);
        case "GetIPSet": return this.getIPSet(body, ctx);
        case "ListIPSets": return this.listIPSets(body, ctx);
        case "UpdateIPSet": return this.updateIPSet(body, ctx);
        case "DeleteIPSet": return this.deleteIPSet(body, ctx);
        case "CreateRuleGroup": return this.createRuleGroup(body, ctx);
        case "GetRuleGroup": return this.getRuleGroup(body, ctx);
        case "ListRuleGroups": return this.listRuleGroups(body, ctx);
        case "AssociateWebACL": return this.associateWebACL(body, ctx);
        case "DisassociateWebACL": return this.disassociateWebACL(body, ctx);
        case "GetWebACLForResource": return this.getWebACLForResource(body, ctx);
        case "CreateRegexPatternSet": return this.createRegexPatternSet(body, ctx);
        case "GetRegexPatternSet": return this.getRegexPatternSet(body, ctx);
        case "ListRegexPatternSets": return this.listRegexPatternSets(body, ctx);
        case "UpdateRegexPatternSet": return this.updateRegexPatternSet(body, ctx);
        case "DeleteRegexPatternSet": return this.deleteRegexPatternSet(body, ctx);
        case "PutLoggingConfiguration": return this.putLoggingConfiguration(body, ctx);
        case "GetLoggingConfiguration": return this.getLoggingConfiguration(body, ctx);
        case "DeleteLoggingConfiguration": return this.deleteLoggingConfiguration(body, ctx);
        case "ListLoggingConfigurations": return this.listLoggingConfigurations(body, ctx);
        case "TagResource": return this.tagResourceHandler(body, ctx);
        case "UntagResource": return this.untagResourceHandler(body, ctx);
        case "ListTagsForResource": return this.listTagsForResourceHandler(body, ctx);
        default:
          return jsonErrorResponse(new AwsError("WAFInvalidOperationException", `Operation ${action} is not supported.`, 400), ctx.requestId);
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

  private createWebACL(body: any, ctx: RequestContext): Response {
    const acl = this.service.createWebACL(
      body.Name,
      body.Scope,
      body.DefaultAction,
      body.Rules,
      body.VisibilityConfig,
      ctx.region,
    );
    return this.json({
      Summary: {
        ARN: acl.arn,
        Id: acl.id,
        Name: acl.name,
        LockToken: acl.lockToken,
      },
    }, ctx);
  }

  private getWebACL(body: any, ctx: RequestContext): Response {
    const acl = this.service.getWebACL(body.Id ?? body.Name, body.Scope, ctx.region);
    return this.json({
      WebACL: webAclToJson(acl),
      LockToken: acl.lockToken,
    }, ctx);
  }

  private listWebACLs(body: any, ctx: RequestContext): Response {
    const acls = this.service.listWebACLs(body.Scope);
    return this.json({
      WebACLs: acls.map((acl) => ({
        ARN: acl.arn,
        Id: acl.id,
        Name: acl.name,
        LockToken: acl.lockToken,
      })),
    }, ctx);
  }

  private updateWebACL(body: any, ctx: RequestContext): Response {
    const acl = this.service.updateWebACL(
      body.Name,
      body.Scope,
      body.Id,
      body.LockToken,
      body.DefaultAction,
      body.Rules,
      body.VisibilityConfig,
      ctx.region,
    );
    return this.json({ NextLockToken: acl.lockToken }, ctx);
  }

  private deleteWebACL(body: any, ctx: RequestContext): Response {
    this.service.deleteWebACL(body.Name, body.Scope, body.Id, body.LockToken, ctx.region);
    return this.json({}, ctx);
  }

  private createIPSet(body: any, ctx: RequestContext): Response {
    const ipSet = this.service.createIPSet(
      body.Name,
      body.Scope,
      body.IPAddressVersion,
      body.Addresses,
      ctx.region,
    );
    return this.json({
      Summary: {
        ARN: ipSet.arn,
        Id: ipSet.id,
        Name: ipSet.name,
        LockToken: ipSet.lockToken,
      },
    }, ctx);
  }

  private getIPSet(body: any, ctx: RequestContext): Response {
    const ipSet = this.service.getIPSet(body.Id ?? body.Name, body.Scope, ctx.region);
    return this.json({
      IPSet: ipSetToJson(ipSet),
      LockToken: ipSet.lockToken,
    }, ctx);
  }

  private listIPSets(body: any, ctx: RequestContext): Response {
    const ipSets = this.service.listIPSets(body.Scope);
    return this.json({
      IPSets: ipSets.map((ipSet) => ({
        ARN: ipSet.arn,
        Id: ipSet.id,
        Name: ipSet.name,
        LockToken: ipSet.lockToken,
      })),
    }, ctx);
  }

  private updateIPSet(body: any, ctx: RequestContext): Response {
    const ipSet = this.service.updateIPSet(
      body.Name,
      body.Scope,
      body.Id,
      body.LockToken,
      body.Addresses,
      ctx.region,
    );
    return this.json({ NextLockToken: ipSet.lockToken }, ctx);
  }

  private deleteIPSet(body: any, ctx: RequestContext): Response {
    this.service.deleteIPSet(body.Name, body.Scope, body.Id, body.LockToken, ctx.region);
    return this.json({}, ctx);
  }

  private createRuleGroup(body: any, ctx: RequestContext): Response {
    const rg = this.service.createRuleGroup(
      body.Name,
      body.Scope,
      body.Capacity,
      body.Rules,
      body.VisibilityConfig,
      ctx.region,
    );
    return this.json({
      Summary: {
        ARN: rg.arn,
        Id: rg.id,
        Name: rg.name,
        LockToken: rg.lockToken,
      },
    }, ctx);
  }

  private getRuleGroup(body: any, ctx: RequestContext): Response {
    const rg = this.service.getRuleGroup(body.Id ?? body.Name, body.Scope, ctx.region);
    return this.json({
      RuleGroup: ruleGroupToJson(rg),
      LockToken: rg.lockToken,
    }, ctx);
  }

  private listRuleGroups(body: any, ctx: RequestContext): Response {
    const ruleGroups = this.service.listRuleGroups(body.Scope);
    return this.json({
      RuleGroups: ruleGroups.map((rg) => ({
        ARN: rg.arn,
        Id: rg.id,
        Name: rg.name,
        LockToken: rg.lockToken,
      })),
    }, ctx);
  }

  private associateWebACL(body: any, ctx: RequestContext): Response {
    this.service.associateWebACL(body.WebACLArn, body.ResourceArn);
    return this.json({}, ctx);
  }

  private disassociateWebACL(body: any, ctx: RequestContext): Response {
    this.service.disassociateWebACL(body.ResourceArn);
    return this.json({}, ctx);
  }

  private getWebACLForResource(body: any, ctx: RequestContext): Response {
    const acl = this.service.getWebACLForResource(body.ResourceArn);
    if (!acl) {
      return this.json({ WebACL: null }, ctx);
    }
    return this.json({ WebACL: webAclToJson(acl) }, ctx);
  }

  // --- RegexPatternSet ---

  private createRegexPatternSet(body: any, ctx: RequestContext): Response {
    const rps = this.service.createRegexPatternSet(body.Name, body.Scope, body.RegularExpressionList, body.Description, ctx.region);
    return this.json({
      Summary: { ARN: rps.arn, Id: rps.id, Name: rps.name, LockToken: rps.lockToken, Description: rps.description },
    }, ctx);
  }

  private getRegexPatternSet(body: any, ctx: RequestContext): Response {
    const rps = this.service.getRegexPatternSet(body.Id ?? body.Name, body.Scope, ctx.region);
    return this.json({
      RegexPatternSet: {
        ARN: rps.arn, Id: rps.id, Name: rps.name, Description: rps.description,
        RegularExpressionList: rps.regularExpressionList,
      },
      LockToken: rps.lockToken,
    }, ctx);
  }

  private listRegexPatternSets(body: any, ctx: RequestContext): Response {
    const sets = this.service.listRegexPatternSets(body.Scope);
    return this.json({
      RegexPatternSets: sets.map((rps) => ({ ARN: rps.arn, Id: rps.id, Name: rps.name, LockToken: rps.lockToken, Description: rps.description })),
    }, ctx);
  }

  private updateRegexPatternSet(body: any, ctx: RequestContext): Response {
    const rps = this.service.updateRegexPatternSet(body.Name, body.Scope, body.Id, body.LockToken, body.RegularExpressionList, body.Description, ctx.region);
    return this.json({ NextLockToken: rps.lockToken }, ctx);
  }

  private deleteRegexPatternSet(body: any, ctx: RequestContext): Response {
    this.service.deleteRegexPatternSet(body.Name, body.Scope, body.Id, body.LockToken, ctx.region);
    return this.json({}, ctx);
  }

  // --- Logging Configuration ---

  private putLoggingConfiguration(body: any, ctx: RequestContext): Response {
    const lc = body.LoggingConfiguration;
    const config = this.service.putLoggingConfiguration(lc.ResourceArn, lc.LogDestinationConfigs, lc.RedactedFields);
    return this.json({
      LoggingConfiguration: {
        ResourceArn: config.resourceArn,
        LogDestinationConfigs: config.logDestinationConfigs,
        RedactedFields: config.redactedFields,
      },
    }, ctx);
  }

  private getLoggingConfiguration(body: any, ctx: RequestContext): Response {
    const config = this.service.getLoggingConfiguration(body.ResourceArn);
    return this.json({
      LoggingConfiguration: {
        ResourceArn: config.resourceArn,
        LogDestinationConfigs: config.logDestinationConfigs,
        RedactedFields: config.redactedFields,
      },
    }, ctx);
  }

  private deleteLoggingConfiguration(body: any, ctx: RequestContext): Response {
    this.service.deleteLoggingConfiguration(body.ResourceArn);
    return this.json({}, ctx);
  }

  private listLoggingConfigurations(body: any, ctx: RequestContext): Response {
    const configs = this.service.listLoggingConfigurations(body.Scope);
    return this.json({
      LoggingConfigurations: configs.map((c) => ({
        ResourceArn: c.resourceArn,
        LogDestinationConfigs: c.logDestinationConfigs,
        RedactedFields: c.redactedFields,
      })),
    }, ctx);
  }

  // --- Tags ---

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
    return this.json({
      TagInfoForResource: {
        ResourceARN: body.ResourceARN,
        TagList: tags,
      },
    }, ctx);
  }
}

function webAclToJson(acl: any) {
  return {
    ARN: acl.arn,
    Id: acl.id,
    Name: acl.name,
    DefaultAction: acl.defaultAction,
    Rules: acl.rules,
    VisibilityConfig: acl.visibilityConfig,
    Capacity: acl.capacity,
  };
}

function ipSetToJson(ipSet: any) {
  return {
    ARN: ipSet.arn,
    Id: ipSet.id,
    Name: ipSet.name,
    IPAddressVersion: ipSet.ipAddressVersion,
    Addresses: ipSet.addresses,
  };
}

function ruleGroupToJson(rg: any) {
  return {
    ARN: rg.arn,
    Id: rg.id,
    Name: rg.name,
    Capacity: rg.capacity,
    Rules: rg.rules,
    VisibilityConfig: rg.visibilityConfig,
  };
}
