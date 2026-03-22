import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface ResolverEndpoint {
  id: string;
  arn: string;
  name: string;
  direction: "INBOUND" | "OUTBOUND";
  ipAddresses: { SubnetId: string; Ip?: string; IpId: string }[];
  securityGroupIds: string[];
  status: string;
  statusMessage: string;
  hostVpcId: string;
  creationTime: string;
  modificationTime: string;
}

export interface ResolverRule {
  id: string;
  arn: string;
  name: string;
  ruleType: "FORWARD" | "SYSTEM" | "RECURSIVE";
  domainName: string;
  targetIps: { Ip: string; Port: number }[];
  resolverEndpointId: string;
  status: string;
  statusMessage: string;
  creationTime: string;
  modificationTime: string;
}

export interface ResolverRuleAssociation {
  id: string;
  resolverRuleId: string;
  vpcId: string;
  name: string;
  status: string;
  statusMessage: string;
}

export class Route53ResolverService {
  private endpoints: StorageBackend<string, ResolverEndpoint>;
  private rules: StorageBackend<string, ResolverRule>;
  private ruleAssociations: StorageBackend<string, ResolverRuleAssociation>;
  private resourceTags: StorageBackend<string, { Key: string; Value: string }[]>;

  constructor(private accountId: string) {
    this.endpoints = new InMemoryStorage();
    this.rules = new InMemoryStorage();
    this.ruleAssociations = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();
  }

  createResolverEndpoint(
    name: string,
    direction: "INBOUND" | "OUTBOUND",
    ipAddresses: { SubnetId: string; Ip?: string }[],
    securityGroupIds: string[],
    region: string,
  ): ResolverEndpoint {
    const id = `rslvr-${direction === "INBOUND" ? "in" : "out"}-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`;
    const now = new Date().toISOString();
    const endpoint: ResolverEndpoint = {
      id,
      arn: `arn:aws:route53resolver:${region}:${this.accountId}:resolver-endpoint/${id}`,
      name: name ?? "",
      direction,
      ipAddresses: (ipAddresses ?? []).map((ip) => ({
        SubnetId: ip.SubnetId,
        Ip: ip.Ip ?? "10.0.0.1",
        IpId: `rslvr-eip-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`,
      })),
      securityGroupIds: securityGroupIds ?? [],
      status: "OPERATIONAL",
      statusMessage: "",
      hostVpcId: "vpc-mock",
      creationTime: now,
      modificationTime: now,
    };
    this.endpoints.set(id, endpoint);
    return endpoint;
  }

  getResolverEndpoint(id: string): ResolverEndpoint {
    const ep = this.endpoints.get(id);
    if (!ep) throw new AwsError("ResourceNotFoundException", `Resolver endpoint ${id} not found.`, 400);
    return ep;
  }

  listResolverEndpoints(): ResolverEndpoint[] {
    return this.endpoints.values();
  }

  deleteResolverEndpoint(id: string): ResolverEndpoint {
    const ep = this.endpoints.get(id);
    if (!ep) throw new AwsError("ResourceNotFoundException", `Resolver endpoint ${id} not found.`, 400);
    ep.status = "DELETING";
    this.endpoints.delete(id);
    return ep;
  }

  updateResolverEndpoint(id: string, name: string): ResolverEndpoint {
    const ep = this.endpoints.get(id);
    if (!ep) throw new AwsError("ResourceNotFoundException", `Resolver endpoint ${id} not found.`, 400);
    if (name !== undefined) ep.name = name;
    ep.modificationTime = new Date().toISOString();
    this.endpoints.set(id, ep);
    return ep;
  }

  createResolverRule(
    name: string,
    ruleType: "FORWARD" | "SYSTEM" | "RECURSIVE",
    domainName: string,
    targetIps: { Ip: string; Port: number }[],
    resolverEndpointId: string,
    region: string,
  ): ResolverRule {
    const id = `rslvr-rr-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`;
    const now = new Date().toISOString();
    const rule: ResolverRule = {
      id,
      arn: `arn:aws:route53resolver:${region}:${this.accountId}:resolver-rule/${id}`,
      name: name ?? "",
      ruleType: ruleType ?? "FORWARD",
      domainName,
      targetIps: targetIps ?? [],
      resolverEndpointId: resolverEndpointId ?? "",
      status: "COMPLETE",
      statusMessage: "",
      creationTime: now,
      modificationTime: now,
    };
    this.rules.set(id, rule);
    return rule;
  }

  getResolverRule(id: string): ResolverRule {
    const rule = this.rules.get(id);
    if (!rule) throw new AwsError("ResourceNotFoundException", `Resolver rule ${id} not found.`, 400);
    return rule;
  }

  listResolverRules(): ResolverRule[] {
    return this.rules.values();
  }

  deleteResolverRule(id: string): ResolverRule {
    const rule = this.rules.get(id);
    if (!rule) throw new AwsError("ResourceNotFoundException", `Resolver rule ${id} not found.`, 400);
    rule.status = "DELETING";
    this.rules.delete(id);
    return rule;
  }

  associateResolverRule(resolverRuleId: string, vpcId: string, name: string): ResolverRuleAssociation {
    const id = `rslvr-rrassoc-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`;
    const assoc: ResolverRuleAssociation = {
      id,
      resolverRuleId,
      vpcId,
      name: name ?? "",
      status: "COMPLETE",
      statusMessage: "",
    };
    this.ruleAssociations.set(id, assoc);
    return assoc;
  }

  disassociateResolverRule(resolverRuleId: string, vpcId: string): ResolverRuleAssociation {
    const assoc = this.ruleAssociations.values().find(
      (a) => a.resolverRuleId === resolverRuleId && a.vpcId === vpcId,
    );
    if (!assoc) throw new AwsError("ResourceNotFoundException", "Rule association not found.", 400);
    assoc.status = "DELETING";
    this.ruleAssociations.delete(assoc.id);
    return assoc;
  }

  listResolverRuleAssociations(): ResolverRuleAssociation[] {
    return this.ruleAssociations.values();
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
