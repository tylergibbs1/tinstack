import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { NetworkFirewallService } from "./networkfirewall-service";

export class NetworkFirewallHandler {
  constructor(private service: NetworkFirewallService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateFirewall": return this.createFirewall(body, ctx);
        case "DescribeFirewall": return this.describeFirewall(body, ctx);
        case "ListFirewalls": return this.listFirewalls(ctx);
        case "DeleteFirewall": return this.deleteFirewall(body, ctx);
        case "UpdateFirewallDescription": return this.updateFirewallDescription(body, ctx);
        case "CreateFirewallPolicy": return this.createFirewallPolicy(body, ctx);
        case "DescribeFirewallPolicy": return this.describeFirewallPolicy(body, ctx);
        case "ListFirewallPolicies": return this.listFirewallPolicies(ctx);
        case "DeleteFirewallPolicy": return this.deleteFirewallPolicy(body, ctx);
        case "CreateRuleGroup": return this.createRuleGroup(body, ctx);
        case "DescribeRuleGroup": return this.describeRuleGroup(body, ctx);
        case "ListRuleGroups": return this.listRuleGroups(ctx);
        case "DeleteRuleGroup": return this.deleteRuleGroup(body, ctx);
        case "AssociateFirewallPolicy": return this.associateFirewallPolicy(body, ctx);
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
      headers: { "Content-Type": "application/x-amz-json-1.0", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private createFirewall(body: any, ctx: RequestContext): Response {
    const fw = this.service.createFirewall(
      body.FirewallName,
      body.FirewallPolicyArn,
      body.VpcId,
      body.SubnetMappings,
      body.DeleteProtection,
      body.Description,
      ctx.region,
      body.Tags ?? [],
    );
    return this.json({
      Firewall: firewallToJson(fw),
      FirewallStatus: { Status: fw.status, ConfigurationSyncStateSummary: "IN_SYNC" },
    }, ctx);
  }

  private describeFirewall(body: any, ctx: RequestContext): Response {
    const fw = this.service.describeFirewall(body.FirewallName, body.FirewallArn);
    return this.json({
      Firewall: firewallToJson(fw),
      FirewallStatus: { Status: fw.status, ConfigurationSyncStateSummary: "IN_SYNC" },
      UpdateToken: fw.updateToken,
    }, ctx);
  }

  private listFirewalls(ctx: RequestContext): Response {
    const firewalls = this.service.listFirewalls();
    return this.json({ Firewalls: firewalls }, ctx);
  }

  private deleteFirewall(body: any, ctx: RequestContext): Response {
    const fw = this.service.deleteFirewall(body.FirewallName, body.FirewallArn);
    return this.json({
      Firewall: firewallToJson(fw),
      FirewallStatus: { Status: "DELETING" },
    }, ctx);
  }

  private updateFirewallDescription(body: any, ctx: RequestContext): Response {
    const fw = this.service.updateFirewallDescription(body.FirewallName, body.FirewallArn, body.Description ?? "");
    return this.json({
      FirewallName: fw.firewallName,
      FirewallArn: fw.firewallArn,
      Description: fw.description,
      UpdateToken: fw.updateToken,
    }, ctx);
  }

  private createFirewallPolicy(body: any, ctx: RequestContext): Response {
    const policy = this.service.createFirewallPolicy(
      body.FirewallPolicyName,
      body.Description,
      body.FirewallPolicy,
      ctx.region,
      body.Tags ?? [],
    );
    return this.json({
      FirewallPolicyResponse: policyResponseToJson(policy),
      UpdateToken: policy.updateToken,
    }, ctx);
  }

  private describeFirewallPolicy(body: any, ctx: RequestContext): Response {
    const policy = this.service.describeFirewallPolicy(body.FirewallPolicyName, body.FirewallPolicyArn);
    return this.json({
      FirewallPolicyResponse: policyResponseToJson(policy),
      FirewallPolicy: {
        StatelessDefaultActions: policy.statelessDefaultActions,
        StatelessFragmentDefaultActions: policy.statelessFragmentDefaultActions,
        StatefulRuleGroupReferences: policy.statefulRuleGroupReferences,
        StatelessRuleGroupReferences: policy.statelessRuleGroupReferences,
      },
      UpdateToken: policy.updateToken,
    }, ctx);
  }

  private listFirewallPolicies(ctx: RequestContext): Response {
    const policies = this.service.listFirewallPolicies();
    return this.json({ FirewallPolicies: policies }, ctx);
  }

  private deleteFirewallPolicy(body: any, ctx: RequestContext): Response {
    const policy = this.service.deleteFirewallPolicy(body.FirewallPolicyName, body.FirewallPolicyArn);
    return this.json({ FirewallPolicyResponse: policyResponseToJson(policy) }, ctx);
  }

  private createRuleGroup(body: any, ctx: RequestContext): Response {
    const rg = this.service.createRuleGroup(
      body.RuleGroupName,
      body.Type ?? "STATEFUL",
      body.Capacity ?? 100,
      body.Description,
      body.RuleGroup?.RulesSource ?? {},
      ctx.region,
      body.Tags ?? [],
    );
    return this.json({
      RuleGroupResponse: ruleGroupResponseToJson(rg),
      UpdateToken: rg.updateToken,
    }, ctx);
  }

  private describeRuleGroup(body: any, ctx: RequestContext): Response {
    const rg = this.service.describeRuleGroup(body.RuleGroupName, body.RuleGroupArn);
    return this.json({
      RuleGroupResponse: ruleGroupResponseToJson(rg),
      RuleGroup: { RulesSource: rg.rulesSource },
      UpdateToken: rg.updateToken,
    }, ctx);
  }

  private listRuleGroups(ctx: RequestContext): Response {
    const ruleGroups = this.service.listRuleGroups();
    return this.json({ RuleGroups: ruleGroups }, ctx);
  }

  private deleteRuleGroup(body: any, ctx: RequestContext): Response {
    const rg = this.service.deleteRuleGroup(body.RuleGroupName, body.RuleGroupArn);
    return this.json({ RuleGroupResponse: ruleGroupResponseToJson(rg) }, ctx);
  }

  private associateFirewallPolicy(body: any, ctx: RequestContext): Response {
    const fw = this.service.associateFirewallPolicy(body.FirewallName, body.FirewallArn, body.FirewallPolicyArn);
    return this.json({
      FirewallName: fw.firewallName,
      FirewallArn: fw.firewallArn,
      FirewallPolicyArn: fw.firewallPolicyArn,
      UpdateToken: fw.updateToken,
    }, ctx);
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

function firewallToJson(fw: any) {
  return {
    FirewallName: fw.firewallName,
    FirewallArn: fw.firewallArn,
    FirewallPolicyArn: fw.firewallPolicyArn,
    VpcId: fw.vpcId,
    SubnetMappings: fw.subnetMappings,
    DeleteProtection: fw.deleteProtection,
    Description: fw.description,
  };
}

function policyResponseToJson(p: any) {
  return {
    FirewallPolicyName: p.firewallPolicyName,
    FirewallPolicyArn: p.firewallPolicyArn,
    FirewallPolicyId: p.firewallPolicyId,
    Description: p.description,
    FirewallPolicyStatus: "ACTIVE",
  };
}

function ruleGroupResponseToJson(rg: any) {
  return {
    RuleGroupName: rg.ruleGroupName,
    RuleGroupArn: rg.ruleGroupArn,
    RuleGroupId: rg.ruleGroupId,
    Type: rg.type,
    Capacity: rg.capacity,
    Description: rg.description,
    RuleGroupStatus: "ACTIVE",
  };
}
