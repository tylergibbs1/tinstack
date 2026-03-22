import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface WebACL {
  id: string;
  name: string;
  arn: string;
  scope: "REGIONAL" | "CLOUDFRONT";
  defaultAction: { Allow?: Record<string, never>; Block?: Record<string, never> };
  rules: WebACLRule[];
  visibilityConfig: VisibilityConfig;
  lockToken: string;
  capacity: number;
  createdAt: number;
  updatedAt: number;
}

export interface WebACLRule {
  name: string;
  priority: number;
  statement: Record<string, any>;
  action?: { Allow?: Record<string, never>; Block?: Record<string, never>; Count?: Record<string, never> };
  overrideAction?: { None?: Record<string, never>; Count?: Record<string, never> };
  visibilityConfig: VisibilityConfig;
}

export interface VisibilityConfig {
  sampledRequestsEnabled: boolean;
  cloudWatchMetricsEnabled: boolean;
  metricName: string;
}

export interface IPSet {
  id: string;
  name: string;
  arn: string;
  scope: "REGIONAL" | "CLOUDFRONT";
  ipAddressVersion: "IPV4" | "IPV6";
  addresses: string[];
  lockToken: string;
  createdAt: number;
  updatedAt: number;
}

export interface RuleGroup {
  id: string;
  name: string;
  arn: string;
  scope: "REGIONAL" | "CLOUDFRONT";
  capacity: number;
  rules: WebACLRule[];
  visibilityConfig: VisibilityConfig;
  lockToken: string;
  createdAt: number;
  updatedAt: number;
}

export interface RegexPatternSet {
  id: string;
  name: string;
  arn: string;
  scope: "REGIONAL" | "CLOUDFRONT";
  description?: string;
  regularExpressionList: { RegexString: string }[];
  lockToken: string;
  createdAt: number;
  updatedAt: number;
}

export interface LoggingConfiguration {
  resourceArn: string;
  logDestinationConfigs: string[];
  redactedFields?: any[];
}

export class Wafv2Service {
  private webAcls: StorageBackend<string, WebACL>;
  private ipSets: StorageBackend<string, IPSet>;
  private ruleGroups: StorageBackend<string, RuleGroup>;
  private associations: StorageBackend<string, string>; // resourceArn -> webAclArn
  private regexPatternSets: StorageBackend<string, RegexPatternSet>;
  private loggingConfigs: StorageBackend<string, LoggingConfiguration>;
  private resourceTags: StorageBackend<string, { Key: string; Value: string }[]>;

  constructor(private accountId: string) {
    this.webAcls = new InMemoryStorage();
    this.ipSets = new InMemoryStorage();
    this.ruleGroups = new InMemoryStorage();
    this.associations = new InMemoryStorage();
    this.regexPatternSets = new InMemoryStorage();
    this.loggingConfigs = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();
  }

  private storageKey(scope: string, id: string): string {
    return `${scope}#${id}`;
  }

  private scopePrefix(scope: string, region: string): string {
    return scope === "CLOUDFRONT" ? "global" : region;
  }

  private webAclArn(scope: string, region: string, name: string, id: string): string {
    const scopeSegment = scope === "CLOUDFRONT" ? "global" : "regional";
    return `arn:aws:wafv2:${this.scopePrefix(scope, region)}:${this.accountId}:${scopeSegment}/webacl/${name}/${id}`;
  }

  private ipSetArn(scope: string, region: string, name: string, id: string): string {
    const scopeSegment = scope === "CLOUDFRONT" ? "global" : "regional";
    return `arn:aws:wafv2:${this.scopePrefix(scope, region)}:${this.accountId}:${scopeSegment}/ipset/${name}/${id}`;
  }

  private ruleGroupArn(scope: string, region: string, name: string, id: string): string {
    const scopeSegment = scope === "CLOUDFRONT" ? "global" : "regional";
    return `arn:aws:wafv2:${this.scopePrefix(scope, region)}:${this.accountId}:${scopeSegment}/rulegroup/${name}/${id}`;
  }

  // --- WebACL ---

  createWebACL(
    name: string,
    scope: "REGIONAL" | "CLOUDFRONT",
    defaultAction: WebACL["defaultAction"],
    rules: WebACLRule[],
    visibilityConfig: VisibilityConfig,
    region: string,
  ): WebACL {
    // Check for duplicate name+scope
    for (const acl of this.webAcls.values()) {
      if (acl.name === name && acl.scope === scope) {
        throw new AwsError("WAFDuplicateItemException", `A WebACL with name '${name}' already exists for scope '${scope}'.`, 400);
      }
    }

    const id = crypto.randomUUID();
    const now = Date.now() / 1000;
    const acl: WebACL = {
      id,
      name,
      arn: this.webAclArn(scope, region, name, id),
      scope,
      defaultAction: defaultAction ?? { Allow: {} },
      rules: rules ?? [],
      visibilityConfig: visibilityConfig ?? { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true, metricName: name },
      lockToken: crypto.randomUUID(),
      capacity: this.calculateCapacity(rules ?? []),
      createdAt: now,
      updatedAt: now,
    };

    this.webAcls.set(this.storageKey(scope, id), acl);
    return acl;
  }

  getWebACL(nameOrId: string, scope: string, region: string): WebACL {
    for (const acl of this.webAcls.values()) {
      if ((acl.name === nameOrId || acl.id === nameOrId) && acl.scope === scope) {
        return acl;
      }
    }
    throw new AwsError("WAFNonexistentItemException", `WebACL '${nameOrId}' not found.`, 400);
  }

  listWebACLs(scope: string): WebACL[] {
    return this.webAcls.values().filter((acl) => acl.scope === scope);
  }

  updateWebACL(
    name: string,
    scope: string,
    id: string,
    lockToken: string,
    defaultAction: WebACL["defaultAction"] | undefined,
    rules: WebACLRule[] | undefined,
    visibilityConfig: VisibilityConfig | undefined,
    region: string,
  ): WebACL {
    const acl = this.getWebACL(id || name, scope, region);
    if (acl.lockToken !== lockToken) {
      throw new AwsError("WAFOptimisticLockException", "The lock token does not match.", 400);
    }

    if (defaultAction !== undefined) acl.defaultAction = defaultAction;
    if (rules !== undefined) {
      acl.rules = rules;
      acl.capacity = this.calculateCapacity(rules);
    }
    if (visibilityConfig !== undefined) acl.visibilityConfig = visibilityConfig;
    acl.updatedAt = Date.now() / 1000;
    acl.lockToken = crypto.randomUUID();

    this.webAcls.set(this.storageKey(acl.scope, acl.id), acl);
    return acl;
  }

  deleteWebACL(name: string, scope: string, id: string, lockToken: string, region: string): void {
    const acl = this.getWebACL(id || name, scope, region);
    if (acl.lockToken !== lockToken) {
      throw new AwsError("WAFOptimisticLockException", "The lock token does not match.", 400);
    }
    this.webAcls.delete(this.storageKey(acl.scope, acl.id));
  }

  // --- IPSet ---

  createIPSet(
    name: string,
    scope: "REGIONAL" | "CLOUDFRONT",
    ipAddressVersion: "IPV4" | "IPV6",
    addresses: string[],
    region: string,
  ): IPSet {
    for (const ipSet of this.ipSets.values()) {
      if (ipSet.name === name && ipSet.scope === scope) {
        throw new AwsError("WAFDuplicateItemException", `An IPSet with name '${name}' already exists for scope '${scope}'.`, 400);
      }
    }

    const id = crypto.randomUUID();
    const now = Date.now() / 1000;
    const ipSet: IPSet = {
      id,
      name,
      arn: this.ipSetArn(scope, region, name, id),
      scope,
      ipAddressVersion: ipAddressVersion ?? "IPV4",
      addresses: addresses ?? [],
      lockToken: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.ipSets.set(this.storageKey(scope, id), ipSet);
    return ipSet;
  }

  getIPSet(nameOrId: string, scope: string, region: string): IPSet {
    for (const ipSet of this.ipSets.values()) {
      if ((ipSet.name === nameOrId || ipSet.id === nameOrId) && ipSet.scope === scope) {
        return ipSet;
      }
    }
    throw new AwsError("WAFNonexistentItemException", `IPSet '${nameOrId}' not found.`, 400);
  }

  listIPSets(scope: string): IPSet[] {
    return this.ipSets.values().filter((ipSet) => ipSet.scope === scope);
  }

  updateIPSet(
    name: string,
    scope: string,
    id: string,
    lockToken: string,
    addresses: string[],
    region: string,
  ): IPSet {
    const ipSet = this.getIPSet(id || name, scope, region);
    if (ipSet.lockToken !== lockToken) {
      throw new AwsError("WAFOptimisticLockException", "The lock token does not match.", 400);
    }

    ipSet.addresses = addresses;
    ipSet.updatedAt = Date.now() / 1000;
    ipSet.lockToken = crypto.randomUUID();

    this.ipSets.set(this.storageKey(ipSet.scope, ipSet.id), ipSet);
    return ipSet;
  }

  deleteIPSet(name: string, scope: string, id: string, lockToken: string, region: string): void {
    const ipSet = this.getIPSet(id || name, scope, region);
    if (ipSet.lockToken !== lockToken) {
      throw new AwsError("WAFOptimisticLockException", "The lock token does not match.", 400);
    }
    this.ipSets.delete(this.storageKey(ipSet.scope, ipSet.id));
  }

  // --- RuleGroup ---

  createRuleGroup(
    name: string,
    scope: "REGIONAL" | "CLOUDFRONT",
    capacity: number,
    rules: WebACLRule[],
    visibilityConfig: VisibilityConfig,
    region: string,
  ): RuleGroup {
    for (const rg of this.ruleGroups.values()) {
      if (rg.name === name && rg.scope === scope) {
        throw new AwsError("WAFDuplicateItemException", `A RuleGroup with name '${name}' already exists for scope '${scope}'.`, 400);
      }
    }

    const id = crypto.randomUUID();
    const now = Date.now() / 1000;
    const rg: RuleGroup = {
      id,
      name,
      arn: this.ruleGroupArn(scope, region, name, id),
      scope,
      capacity: capacity ?? 100,
      rules: rules ?? [],
      visibilityConfig: visibilityConfig ?? { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true, metricName: name },
      lockToken: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.ruleGroups.set(this.storageKey(scope, id), rg);
    return rg;
  }

  getRuleGroup(nameOrId: string, scope: string, region: string): RuleGroup {
    for (const rg of this.ruleGroups.values()) {
      if ((rg.name === nameOrId || rg.id === nameOrId) && rg.scope === scope) {
        return rg;
      }
    }
    throw new AwsError("WAFNonexistentItemException", `RuleGroup '${nameOrId}' not found.`, 400);
  }

  listRuleGroups(scope: string): RuleGroup[] {
    return this.ruleGroups.values().filter((rg) => rg.scope === scope);
  }

  // --- Associations ---

  associateWebACL(webACLArn: string, resourceArn: string): void {
    // Verify the WebACL exists by searching all
    const found = this.webAcls.values().some((acl) => acl.arn === webACLArn);
    if (!found) {
      throw new AwsError("WAFNonexistentItemException", `WebACL with ARN '${webACLArn}' not found.`, 400);
    }
    this.associations.set(resourceArn, webACLArn);
  }

  disassociateWebACL(resourceArn: string): void {
    if (!this.associations.has(resourceArn)) {
      throw new AwsError("WAFNonexistentItemException", `No WebACL associated with resource '${resourceArn}'.`, 400);
    }
    this.associations.delete(resourceArn);
  }

  getWebACLForResource(resourceArn: string): WebACL | undefined {
    const webACLArn = this.associations.get(resourceArn);
    if (!webACLArn) return undefined;
    return this.webAcls.values().find((acl) => acl.arn === webACLArn);
  }

  private calculateCapacity(rules: WebACLRule[]): number {
    // Simplified capacity calculation: 1 WCU per rule
    return rules.length;
  }

  // --- RegexPatternSet ---

  private regexPatternSetArn(scope: string, region: string, name: string, id: string): string {
    const scopeSegment = scope === "CLOUDFRONT" ? "global" : "regional";
    return `arn:aws:wafv2:${this.scopePrefix(scope, region)}:${this.accountId}:${scopeSegment}/regexpatternset/${name}/${id}`;
  }

  createRegexPatternSet(
    name: string,
    scope: "REGIONAL" | "CLOUDFRONT",
    regularExpressionList: { RegexString: string }[],
    description: string | undefined,
    region: string,
  ): RegexPatternSet {
    for (const rps of this.regexPatternSets.values()) {
      if (rps.name === name && rps.scope === scope) {
        throw new AwsError("WAFDuplicateItemException", `A RegexPatternSet with name '${name}' already exists for scope '${scope}'.`, 400);
      }
    }

    const id = crypto.randomUUID();
    const now = Date.now() / 1000;
    const rps: RegexPatternSet = {
      id,
      name,
      arn: this.regexPatternSetArn(scope, region, name, id),
      scope,
      description,
      regularExpressionList: regularExpressionList ?? [],
      lockToken: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.regexPatternSets.set(this.storageKey(scope, id), rps);
    return rps;
  }

  getRegexPatternSet(nameOrId: string, scope: string, region: string): RegexPatternSet {
    for (const rps of this.regexPatternSets.values()) {
      if ((rps.name === nameOrId || rps.id === nameOrId) && rps.scope === scope) {
        return rps;
      }
    }
    throw new AwsError("WAFNonexistentItemException", `RegexPatternSet '${nameOrId}' not found.`, 400);
  }

  listRegexPatternSets(scope: string): RegexPatternSet[] {
    return this.regexPatternSets.values().filter((rps) => rps.scope === scope);
  }

  updateRegexPatternSet(
    name: string,
    scope: string,
    id: string,
    lockToken: string,
    regularExpressionList: { RegexString: string }[],
    description: string | undefined,
    region: string,
  ): RegexPatternSet {
    const rps = this.getRegexPatternSet(id || name, scope, region);
    if (rps.lockToken !== lockToken) {
      throw new AwsError("WAFOptimisticLockException", "The lock token does not match.", 400);
    }
    rps.regularExpressionList = regularExpressionList;
    if (description !== undefined) rps.description = description;
    rps.updatedAt = Date.now() / 1000;
    rps.lockToken = crypto.randomUUID();
    this.regexPatternSets.set(this.storageKey(rps.scope, rps.id), rps);
    return rps;
  }

  deleteRegexPatternSet(name: string, scope: string, id: string, lockToken: string, region: string): void {
    const rps = this.getRegexPatternSet(id || name, scope, region);
    if (rps.lockToken !== lockToken) {
      throw new AwsError("WAFOptimisticLockException", "The lock token does not match.", 400);
    }
    this.regexPatternSets.delete(this.storageKey(rps.scope, rps.id));
  }

  // --- Logging Configuration ---

  putLoggingConfiguration(resourceArn: string, logDestinationConfigs: string[], redactedFields?: any[]): LoggingConfiguration {
    // Verify the WebACL exists
    const found = this.webAcls.values().some((acl) => acl.arn === resourceArn);
    if (!found) {
      throw new AwsError("WAFNonexistentItemException", `WebACL with ARN '${resourceArn}' not found.`, 400);
    }
    const config: LoggingConfiguration = {
      resourceArn,
      logDestinationConfigs,
      redactedFields,
    };
    this.loggingConfigs.set(resourceArn, config);
    return config;
  }

  getLoggingConfiguration(resourceArn: string): LoggingConfiguration {
    const config = this.loggingConfigs.get(resourceArn);
    if (!config) {
      throw new AwsError("WAFNonexistentItemException", `No logging configuration found for '${resourceArn}'.`, 400);
    }
    return config;
  }

  deleteLoggingConfiguration(resourceArn: string): void {
    if (!this.loggingConfigs.has(resourceArn)) {
      throw new AwsError("WAFNonexistentItemException", `No logging configuration found for '${resourceArn}'.`, 400);
    }
    this.loggingConfigs.delete(resourceArn);
  }

  listLoggingConfigurations(scope: string): LoggingConfiguration[] {
    return this.loggingConfigs.values();
  }

  // --- Tags ---

  tagResource(resourceArn: string, tags: { Key: string; Value: string }[]): void {
    const existing = this.resourceTags.get(resourceArn) ?? [];
    for (const tag of tags) {
      const idx = existing.findIndex((t) => t.Key === tag.Key);
      if (idx >= 0) existing[idx] = tag;
      else existing.push(tag);
    }
    this.resourceTags.set(resourceArn, existing);
  }

  untagResource(resourceArn: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(resourceArn) ?? [];
    const filtered = existing.filter((t) => !tagKeys.includes(t.Key));
    this.resourceTags.set(resourceArn, filtered);
  }

  listTagsForResource(resourceArn: string): { Key: string; Value: string }[] {
    return this.resourceTags.get(resourceArn) ?? [];
  }
}
