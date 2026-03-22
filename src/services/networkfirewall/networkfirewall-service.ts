import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface NfFirewall {
  firewallName: string;
  firewallArn: string;
  firewallPolicyArn: string;
  vpcId: string;
  subnetMappings: { SubnetId: string }[];
  deleteProtection: boolean;
  description: string;
  status: string;
  updateToken: string;
}

export interface NfFirewallPolicy {
  firewallPolicyName: string;
  firewallPolicyArn: string;
  firewallPolicyId: string;
  description: string;
  statelessDefaultActions: string[];
  statelessFragmentDefaultActions: string[];
  statefulRuleGroupReferences: { ResourceArn: string }[];
  statelessRuleGroupReferences: { ResourceArn: string; Priority: number }[];
  updateToken: string;
}

export interface NfRuleGroup {
  ruleGroupName: string;
  ruleGroupArn: string;
  ruleGroupId: string;
  type: "STATELESS" | "STATEFUL";
  capacity: number;
  description: string;
  updateToken: string;
  rulesSource: Record<string, any>;
}

export class NetworkFirewallService {
  private firewalls: StorageBackend<string, NfFirewall>;
  private firewallPolicies: StorageBackend<string, NfFirewallPolicy>;
  private ruleGroups: StorageBackend<string, NfRuleGroup>;
  private resourceTags: StorageBackend<string, { Key: string; Value: string }[]>;

  constructor(private accountId: string) {
    this.firewalls = new InMemoryStorage();
    this.firewallPolicies = new InMemoryStorage();
    this.ruleGroups = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();
  }

  createFirewall(
    firewallName: string,
    firewallPolicyArn: string,
    vpcId: string,
    subnetMappings: { SubnetId: string }[],
    deleteProtection: boolean,
    description: string,
    region: string,
    tags: { Key: string; Value: string }[],
  ): NfFirewall {
    const arn = `arn:aws:network-firewall:${region}:${this.accountId}:firewall/${firewallName}`;
    if (this.firewalls.has(arn)) {
      throw new AwsError("InvalidRequestException", `Firewall ${firewallName} already exists.`, 400);
    }
    const fw: NfFirewall = {
      firewallName,
      firewallArn: arn,
      firewallPolicyArn: firewallPolicyArn ?? "",
      vpcId: vpcId ?? "",
      subnetMappings: subnetMappings ?? [],
      deleteProtection: deleteProtection ?? false,
      description: description ?? "",
      status: "READY",
      updateToken: crypto.randomUUID(),
    };
    this.firewalls.set(arn, fw);
    if (tags?.length) {
      this.resourceTags.set(arn, [...tags]);
    }
    return fw;
  }

  describeFirewall(firewallName?: string, firewallArn?: string): NfFirewall {
    if (firewallArn) {
      const fw = this.firewalls.get(firewallArn);
      if (fw) return fw;
    }
    if (firewallName) {
      for (const fw of this.firewalls.values()) {
        if (fw.firewallName === firewallName) return fw;
      }
    }
    throw new AwsError("ResourceNotFoundException", `Firewall ${firewallName ?? firewallArn} not found.`, 400);
  }

  listFirewalls(): { FirewallName: string; FirewallArn: string }[] {
    return this.firewalls.values().map((fw) => ({
      FirewallName: fw.firewallName,
      FirewallArn: fw.firewallArn,
    }));
  }

  deleteFirewall(firewallName?: string, firewallArn?: string): NfFirewall {
    const fw = this.describeFirewall(firewallName, firewallArn);
    this.firewalls.delete(fw.firewallArn);
    return fw;
  }

  updateFirewallDescription(firewallName: string | undefined, firewallArn: string | undefined, description: string): NfFirewall {
    const fw = this.describeFirewall(firewallName, firewallArn);
    fw.description = description;
    fw.updateToken = crypto.randomUUID();
    this.firewalls.set(fw.firewallArn, fw);
    return fw;
  }

  createFirewallPolicy(
    firewallPolicyName: string,
    description: string,
    firewallPolicy: any,
    region: string,
    tags: { Key: string; Value: string }[],
  ): NfFirewallPolicy {
    const id = crypto.randomUUID();
    const arn = `arn:aws:network-firewall:${region}:${this.accountId}:firewall-policy/${firewallPolicyName}`;
    if (this.firewallPolicies.has(arn)) {
      throw new AwsError("InvalidRequestException", `Firewall policy ${firewallPolicyName} already exists.`, 400);
    }
    const policy: NfFirewallPolicy = {
      firewallPolicyName,
      firewallPolicyArn: arn,
      firewallPolicyId: id,
      description: description ?? "",
      statelessDefaultActions: firewallPolicy?.StatelessDefaultActions ?? ["aws:pass"],
      statelessFragmentDefaultActions: firewallPolicy?.StatelessFragmentDefaultActions ?? ["aws:pass"],
      statefulRuleGroupReferences: firewallPolicy?.StatefulRuleGroupReferences ?? [],
      statelessRuleGroupReferences: firewallPolicy?.StatelessRuleGroupReferences ?? [],
      updateToken: crypto.randomUUID(),
    };
    this.firewallPolicies.set(arn, policy);
    if (tags?.length) {
      this.resourceTags.set(arn, [...tags]);
    }
    return policy;
  }

  describeFirewallPolicy(policyName?: string, policyArn?: string): NfFirewallPolicy {
    if (policyArn) {
      const p = this.firewallPolicies.get(policyArn);
      if (p) return p;
    }
    if (policyName) {
      for (const p of this.firewallPolicies.values()) {
        if (p.firewallPolicyName === policyName) return p;
      }
    }
    throw new AwsError("ResourceNotFoundException", `Firewall policy ${policyName ?? policyArn} not found.`, 400);
  }

  listFirewallPolicies(): { Name: string; Arn: string }[] {
    return this.firewallPolicies.values().map((p) => ({
      Name: p.firewallPolicyName,
      Arn: p.firewallPolicyArn,
    }));
  }

  deleteFirewallPolicy(policyName?: string, policyArn?: string): NfFirewallPolicy {
    const p = this.describeFirewallPolicy(policyName, policyArn);
    this.firewallPolicies.delete(p.firewallPolicyArn);
    return p;
  }

  createRuleGroup(
    ruleGroupName: string,
    type: "STATELESS" | "STATEFUL",
    capacity: number,
    description: string,
    rulesSource: Record<string, any>,
    region: string,
    tags: { Key: string; Value: string }[],
  ): NfRuleGroup {
    const id = crypto.randomUUID();
    const arn = `arn:aws:network-firewall:${region}:${this.accountId}:${type === "STATELESS" ? "stateless" : "stateful"}-rulegroup/${ruleGroupName}`;
    if (this.ruleGroups.has(arn)) {
      throw new AwsError("InvalidRequestException", `Rule group ${ruleGroupName} already exists.`, 400);
    }
    const rg: NfRuleGroup = {
      ruleGroupName,
      ruleGroupArn: arn,
      ruleGroupId: id,
      type,
      capacity: capacity ?? 100,
      description: description ?? "",
      updateToken: crypto.randomUUID(),
      rulesSource: rulesSource ?? {},
    };
    this.ruleGroups.set(arn, rg);
    if (tags?.length) {
      this.resourceTags.set(arn, [...tags]);
    }
    return rg;
  }

  describeRuleGroup(ruleGroupName?: string, ruleGroupArn?: string): NfRuleGroup {
    if (ruleGroupArn) {
      const rg = this.ruleGroups.get(ruleGroupArn);
      if (rg) return rg;
    }
    if (ruleGroupName) {
      for (const rg of this.ruleGroups.values()) {
        if (rg.ruleGroupName === ruleGroupName) return rg;
      }
    }
    throw new AwsError("ResourceNotFoundException", `Rule group ${ruleGroupName ?? ruleGroupArn} not found.`, 400);
  }

  listRuleGroups(): { Name: string; Arn: string }[] {
    return this.ruleGroups.values().map((rg) => ({
      Name: rg.ruleGroupName,
      Arn: rg.ruleGroupArn,
    }));
  }

  deleteRuleGroup(ruleGroupName?: string, ruleGroupArn?: string): NfRuleGroup {
    const rg = this.describeRuleGroup(ruleGroupName, ruleGroupArn);
    this.ruleGroups.delete(rg.ruleGroupArn);
    return rg;
  }

  associateFirewallPolicy(firewallName: string | undefined, firewallArn: string | undefined, firewallPolicyArn: string): NfFirewall {
    const fw = this.describeFirewall(firewallName, firewallArn);
    fw.firewallPolicyArn = firewallPolicyArn;
    fw.updateToken = crypto.randomUUID();
    this.firewalls.set(fw.firewallArn, fw);
    return fw;
  }

  tagResource(arn: string, tags: { Key: string; Value: string }[]): void {
    const existing = this.resourceTags.get(arn) ?? [];
    for (const tag of tags) {
      const idx = existing.findIndex((t) => t.Key === tag.Key);
      if (idx >= 0) existing[idx] = tag;
      else existing.push(tag);
    }
    this.resourceTags.set(arn, existing);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(arn) ?? [];
    this.resourceTags.set(arn, existing.filter((t) => !tagKeys.includes(t.Key)));
  }

  listTagsForResource(arn: string): { Key: string; Value: string }[] {
    return this.resourceTags.get(arn) ?? [];
  }
}
