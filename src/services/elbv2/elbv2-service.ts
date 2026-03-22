import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface LoadBalancer {
  loadBalancerArn: string;
  loadBalancerName: string;
  dnsName: string;
  scheme: string;
  type: string;
  state: { code: string; reason?: string };
  vpcId: string;
  availabilityZones: { zoneName: string; subnetId: string }[];
  securityGroups: string[];
  createdTime: string;
  tags: Record<string, string>;
  attributes: Record<string, string>;
}

export interface TargetGroup {
  targetGroupArn: string;
  targetGroupName: string;
  protocol: string;
  port: number;
  vpcId: string;
  targetType: string;
  healthCheckProtocol: string;
  healthCheckPath: string;
  healthCheckPort: string;
  healthCheckIntervalSeconds: number;
  healthCheckTimeoutSeconds: number;
  healthyThresholdCount: number;
  unhealthyThresholdCount: number;
  tags: Record<string, string>;
  attributes: Record<string, string>;
}

export interface Listener {
  listenerArn: string;
  loadBalancerArn: string;
  protocol: string;
  port: number;
  defaultActions: ListenerAction[];
  tags: Record<string, string>;
}

export type ListenerAction = { type: string; targetGroupArn?: string; order?: number };

export interface TargetDescription {
  id: string;
  port?: number;
  availabilityZone?: string;
}

export interface TargetHealthDescription {
  target: TargetDescription;
  targetHealth: { state: string; reason?: string; description?: string };
}

export interface RuleCondition {
  field: string;
  values: string[];
}

export interface Rule {
  ruleArn: string;
  listenerArn: string;
  priority: string; // "default" or numeric string
  conditions: RuleCondition[];
  actions: ListenerAction[];
  isDefault: boolean;
}

export class Elbv2Service {
  private loadBalancers: StorageBackend<string, LoadBalancer>;
  private targetGroups: StorageBackend<string, TargetGroup>;
  private listeners: StorageBackend<string, Listener>;
  private tags: StorageBackend<string, Record<string, string>>; // arn -> tags
  private targets: StorageBackend<string, TargetDescription[]>; // targetGroupArn -> targets
  private rules: StorageBackend<string, Rule>; // ruleArn -> rule

  constructor(private accountId: string) {
    this.loadBalancers = new InMemoryStorage();
    this.targetGroups = new InMemoryStorage();
    this.listeners = new InMemoryStorage();
    this.tags = new InMemoryStorage();
    this.targets = new InMemoryStorage();
    this.rules = new InMemoryStorage();
  }

  createLoadBalancer(
    name: string,
    subnets: string[],
    securityGroups: string[],
    scheme: string | undefined,
    type: string | undefined,
    tags: Record<string, string>,
    region: string,
  ): LoadBalancer {
    const lbId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const arn = buildArn("elasticloadbalancing", region, this.accountId, "loadbalancer/", `app/${name}/${lbId}`);

    if (this.findLbByName(name, region)) {
      throw new AwsError("DuplicateLoadBalancerName", `A load balancer with the name '${name}' already exists.`, 400);
    }

    const azs = subnets.map((s, i) => ({
      zoneName: `${region}${String.fromCharCode(97 + (i % 3))}`,
      subnetId: s,
    }));

    const lb: LoadBalancer = {
      loadBalancerArn: arn,
      loadBalancerName: name,
      dnsName: `${name}-${lbId}.${region}.elb.amazonaws.com`,
      scheme: scheme ?? "internet-facing",
      type: type ?? "application",
      state: { code: "active" },
      vpcId: `vpc-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
      availabilityZones: azs,
      securityGroups: securityGroups ?? [],
      createdTime: new Date().toISOString(),
      tags,
      attributes: {
        "idle_timeout.timeout_seconds": "60",
        "routing.http2.enabled": "true",
        "deletion_protection.enabled": "false",
        "access_logs.s3.enabled": "false",
      },
    };
    this.loadBalancers.set(arn, lb);
    this.tags.set(arn, tags);
    return lb;
  }

  describeLoadBalancers(arns: string[] | undefined, names: string[] | undefined, region: string): LoadBalancer[] {
    if (arns && arns.length > 0) {
      return arns.map((a) => {
        const lb = this.loadBalancers.get(a);
        if (!lb) throw new AwsError("LoadBalancerNotFound", `Load balancer '${a}' not found.`, 400);
        return lb;
      });
    }
    if (names && names.length > 0) {
      return names.map((n) => {
        const lb = this.findLbByName(n, region);
        if (!lb) throw new AwsError("LoadBalancerNotFound", `Load balancer '${n}' not found.`, 400);
        return lb;
      });
    }
    return this.loadBalancers.values().filter((lb) => lb.loadBalancerArn.includes(`:${region}:`));
  }

  deleteLoadBalancer(arn: string): void {
    if (!this.loadBalancers.has(arn)) throw new AwsError("LoadBalancerNotFound", `Load balancer '${arn}' not found.`, 400);
    // Delete associated listeners
    for (const listener of this.listeners.values()) {
      if (listener.loadBalancerArn === arn) {
        this.listeners.delete(listener.listenerArn);
        this.tags.delete(listener.listenerArn);
      }
    }
    this.loadBalancers.delete(arn);
    this.tags.delete(arn);
  }

  describeLoadBalancerAttributes(arn: string): { key: string; value: string }[] {
    const lb = this.loadBalancers.get(arn);
    if (!lb) throw new AwsError("LoadBalancerNotFound", `Load balancer '${arn}' not found.`, 400);
    return Object.entries(lb.attributes).map(([key, value]) => ({ key, value }));
  }

  modifyLoadBalancerAttributes(arn: string, attributes: { key: string; value: string }[]): { key: string; value: string }[] {
    const lb = this.loadBalancers.get(arn);
    if (!lb) throw new AwsError("LoadBalancerNotFound", `Load balancer '${arn}' not found.`, 400);
    for (const attr of attributes) lb.attributes[attr.key] = attr.value;
    return Object.entries(lb.attributes).map(([key, value]) => ({ key, value }));
  }

  createTargetGroup(
    name: string,
    protocol: string | undefined,
    port: number | undefined,
    vpcId: string | undefined,
    targetType: string | undefined,
    healthCheckProtocol: string | undefined,
    healthCheckPath: string | undefined,
    tags: Record<string, string>,
    region: string,
  ): TargetGroup {
    const tgId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const arn = buildArn("elasticloadbalancing", region, this.accountId, "targetgroup/", `${name}/${tgId}`);

    const tg: TargetGroup = {
      targetGroupArn: arn,
      targetGroupName: name,
      protocol: protocol ?? "HTTP",
      port: port ?? 80,
      vpcId: vpcId ?? `vpc-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
      targetType: targetType ?? "instance",
      healthCheckProtocol: healthCheckProtocol ?? protocol ?? "HTTP",
      healthCheckPath: healthCheckPath ?? "/",
      healthCheckPort: "traffic-port",
      healthCheckIntervalSeconds: 30,
      healthCheckTimeoutSeconds: 5,
      healthyThresholdCount: 5,
      unhealthyThresholdCount: 2,
      tags,
      attributes: {
        "deregistration_delay.timeout_seconds": "300",
        "stickiness.enabled": "false",
        "stickiness.type": "lb_cookie",
      },
    };
    this.targetGroups.set(arn, tg);
    this.tags.set(arn, tags);
    return tg;
  }

  describeTargetGroups(arns: string[] | undefined, region: string): TargetGroup[] {
    if (arns && arns.length > 0) {
      return arns.map((a) => {
        const tg = this.targetGroups.get(a);
        if (!tg) throw new AwsError("TargetGroupNotFound", `Target group '${a}' not found.`, 400);
        return tg;
      });
    }
    return this.targetGroups.values().filter((tg) => tg.targetGroupArn.includes(`:${region}:`));
  }

  deleteTargetGroup(arn: string): void {
    if (!this.targetGroups.has(arn)) throw new AwsError("TargetGroupNotFound", `Target group '${arn}' not found.`, 400);
    this.targetGroups.delete(arn);
    this.targets.delete(arn);
    this.tags.delete(arn);
  }

  describeTargetGroupAttributes(arn: string): { key: string; value: string }[] {
    const tg = this.targetGroups.get(arn);
    if (!tg) throw new AwsError("TargetGroupNotFound", `Target group '${arn}' not found.`, 400);
    return Object.entries(tg.attributes).map(([key, value]) => ({ key, value }));
  }

  modifyTargetGroupAttributes(arn: string, attributes: { key: string; value: string }[]): { key: string; value: string }[] {
    const tg = this.targetGroups.get(arn);
    if (!tg) throw new AwsError("TargetGroupNotFound", `Target group '${arn}' not found.`, 400);
    for (const attr of attributes) tg.attributes[attr.key] = attr.value;
    return Object.entries(tg.attributes).map(([key, value]) => ({ key, value }));
  }

  createListener(
    loadBalancerArn: string,
    protocol: string | undefined,
    port: number,
    defaultActions: { type: string; targetGroupArn?: string; order?: number }[],
    tags: Record<string, string>,
    region: string,
  ): Listener {
    if (!this.loadBalancers.has(loadBalancerArn)) {
      throw new AwsError("LoadBalancerNotFound", `Load balancer '${loadBalancerArn}' not found.`, 400);
    }
    const listenerId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const arn = buildArn("elasticloadbalancing", region, this.accountId, "listener/", `app/${listenerId}`);

    const listener: Listener = {
      listenerArn: arn,
      loadBalancerArn,
      protocol: protocol ?? "HTTP",
      port,
      defaultActions: defaultActions ?? [],
      tags,
    };
    this.listeners.set(arn, listener);
    this.tags.set(arn, tags);
    return listener;
  }

  describeListeners(loadBalancerArn: string | undefined, listenerArns: string[] | undefined, _region: string): Listener[] {
    if (listenerArns && listenerArns.length > 0) {
      return listenerArns.map((a) => {
        const l = this.listeners.get(a);
        if (!l) throw new AwsError("ListenerNotFound", `Listener '${a}' not found.`, 400);
        return l;
      });
    }
    if (loadBalancerArn) {
      return this.listeners.values().filter((l) => l.loadBalancerArn === loadBalancerArn);
    }
    return this.listeners.values();
  }

  deleteListener(arn: string): void {
    if (!this.listeners.has(arn)) throw new AwsError("ListenerNotFound", `Listener '${arn}' not found.`, 400);
    // Delete associated rules
    for (const rule of this.rules.values()) {
      if (rule.listenerArn === arn) {
        this.rules.delete(rule.ruleArn);
      }
    }
    this.listeners.delete(arn);
    this.tags.delete(arn);
  }

  modifyListener(
    arn: string,
    protocol: string | undefined,
    port: number | undefined,
    defaultActions: ListenerAction[] | undefined,
  ): Listener {
    const listener = this.listeners.get(arn);
    if (!listener) throw new AwsError("ListenerNotFound", `Listener '${arn}' not found.`, 400);
    if (protocol !== undefined) listener.protocol = protocol;
    if (port !== undefined) listener.port = port;
    if (defaultActions !== undefined) listener.defaultActions = defaultActions;
    return listener;
  }

  // --- Target registration ---

  registerTargets(targetGroupArn: string, newTargets: TargetDescription[]): void {
    if (!this.targetGroups.has(targetGroupArn)) {
      throw new AwsError("TargetGroupNotFound", `Target group '${targetGroupArn}' not found.`, 400);
    }
    const existing = this.targets.get(targetGroupArn) ?? [];
    for (const t of newTargets) {
      const idx = existing.findIndex((e) => e.id === t.id && (e.port ?? null) === (t.port ?? null));
      if (idx === -1) existing.push(t);
    }
    this.targets.set(targetGroupArn, existing);
  }

  deregisterTargets(targetGroupArn: string, toRemove: TargetDescription[]): void {
    if (!this.targetGroups.has(targetGroupArn)) {
      throw new AwsError("TargetGroupNotFound", `Target group '${targetGroupArn}' not found.`, 400);
    }
    const existing = this.targets.get(targetGroupArn) ?? [];
    const filtered = existing.filter(
      (e) => !toRemove.some((r) => r.id === e.id && (r.port === undefined || r.port === e.port)),
    );
    this.targets.set(targetGroupArn, filtered);
  }

  describeTargetHealth(targetGroupArn: string, requestedTargets: TargetDescription[] | undefined): TargetHealthDescription[] {
    if (!this.targetGroups.has(targetGroupArn)) {
      throw new AwsError("TargetGroupNotFound", `Target group '${targetGroupArn}' not found.`, 400);
    }
    const registered = this.targets.get(targetGroupArn) ?? [];
    const toDescribe = requestedTargets && requestedTargets.length > 0 ? requestedTargets : registered;
    return toDescribe.map((t) => ({
      target: { id: t.id, port: t.port, availabilityZone: t.availabilityZone },
      targetHealth: { state: "healthy" },
    }));
  }

  // --- Target group modification ---

  modifyTargetGroup(
    arn: string,
    healthCheckProtocol: string | undefined,
    healthCheckPath: string | undefined,
    healthCheckPort: string | undefined,
    healthCheckIntervalSeconds: number | undefined,
    healthCheckTimeoutSeconds: number | undefined,
    healthyThresholdCount: number | undefined,
    unhealthyThresholdCount: number | undefined,
  ): TargetGroup {
    const tg = this.targetGroups.get(arn);
    if (!tg) throw new AwsError("TargetGroupNotFound", `Target group '${arn}' not found.`, 400);
    if (healthCheckProtocol !== undefined) tg.healthCheckProtocol = healthCheckProtocol;
    if (healthCheckPath !== undefined) tg.healthCheckPath = healthCheckPath;
    if (healthCheckPort !== undefined) tg.healthCheckPort = healthCheckPort;
    if (healthCheckIntervalSeconds !== undefined) tg.healthCheckIntervalSeconds = healthCheckIntervalSeconds;
    if (healthCheckTimeoutSeconds !== undefined) tg.healthCheckTimeoutSeconds = healthCheckTimeoutSeconds;
    if (healthyThresholdCount !== undefined) tg.healthyThresholdCount = healthyThresholdCount;
    if (unhealthyThresholdCount !== undefined) tg.unhealthyThresholdCount = unhealthyThresholdCount;
    return tg;
  }

  // --- Rules ---

  createRule(
    listenerArn: string,
    priority: string,
    conditions: RuleCondition[],
    actions: ListenerAction[],
    region: string,
  ): Rule {
    if (!this.listeners.has(listenerArn)) {
      throw new AwsError("ListenerNotFound", `Listener '${listenerArn}' not found.`, 400);
    }
    // Check for duplicate priority
    for (const r of this.rules.values()) {
      if (r.listenerArn === listenerArn && r.priority === priority) {
        throw new AwsError("PriorityInUse", `Priority '${priority}' is already in use.`, 400);
      }
    }
    const ruleId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const ruleArn = buildArn("elasticloadbalancing", region, this.accountId, "listener-rule/", `app/${ruleId}`);
    const rule: Rule = {
      ruleArn,
      listenerArn,
      priority,
      conditions,
      actions,
      isDefault: false,
    };
    this.rules.set(ruleArn, rule);
    return rule;
  }

  describeRules(listenerArn: string | undefined, ruleArns: string[] | undefined): Rule[] {
    if (ruleArns && ruleArns.length > 0) {
      return ruleArns.map((a) => {
        const r = this.rules.get(a);
        if (!r) throw new AwsError("RuleNotFound", `Rule '${a}' not found.`, 400);
        return r;
      });
    }
    if (listenerArn) {
      const rules = this.rules.values().filter((r) => r.listenerArn === listenerArn);
      return rules.sort((a, b) => {
        if (a.isDefault) return 1;
        if (b.isDefault) return -1;
        return parseInt(a.priority) - parseInt(b.priority);
      });
    }
    return this.rules.values();
  }

  deleteRule(arn: string): void {
    const rule = this.rules.get(arn);
    if (!rule) throw new AwsError("RuleNotFound", `Rule '${arn}' not found.`, 400);
    if (rule.isDefault) throw new AwsError("OperationNotPermitted", "Default rules cannot be deleted.", 400);
    this.rules.delete(arn);
  }

  modifyRule(arn: string, conditions: RuleCondition[] | undefined, actions: ListenerAction[] | undefined): Rule {
    const rule = this.rules.get(arn);
    if (!rule) throw new AwsError("RuleNotFound", `Rule '${arn}' not found.`, 400);
    if (conditions !== undefined) rule.conditions = conditions;
    if (actions !== undefined) rule.actions = actions;
    return rule;
  }

  setRulePriorities(rulePriorities: { ruleArn: string; priority: number }[]): Rule[] {
    const updated: Rule[] = [];
    for (const rp of rulePriorities) {
      const rule = this.rules.get(rp.ruleArn);
      if (!rule) throw new AwsError("RuleNotFound", `Rule '${rp.ruleArn}' not found.`, 400);
      rule.priority = String(rp.priority);
      updated.push(rule);
    }
    return updated;
  }

  describeTags(resourceArns: string[]): { resourceArn: string; tags: { key: string; value: string }[] }[] {
    return resourceArns.map((arn) => {
      const tagMap = this.tags.get(arn) ?? {};
      return {
        resourceArn: arn,
        tags: Object.entries(tagMap).map(([key, value]) => ({ key, value })),
      };
    });
  }

  addTags(resourceArns: string[], tags: { key: string; value: string }[]): void {
    for (const arn of resourceArns) {
      const existing = this.tags.get(arn) ?? {};
      for (const t of tags) existing[t.key] = t.value;
      this.tags.set(arn, existing);
      // Also update the resource's own tags
      const lb = this.loadBalancers.get(arn);
      if (lb) lb.tags = { ...existing };
      const tg = this.targetGroups.get(arn);
      if (tg) tg.tags = { ...existing };
    }
  }

  removeTags(resourceArns: string[], tagKeys: string[]): void {
    for (const arn of resourceArns) {
      const existing = this.tags.get(arn);
      if (existing) {
        for (const k of tagKeys) delete existing[k];
        this.tags.set(arn, existing);
        const lb = this.loadBalancers.get(arn);
        if (lb) lb.tags = { ...existing };
        const tg = this.targetGroups.get(arn);
        if (tg) tg.tags = { ...existing };
      }
    }
  }

  private findLbByName(name: string, region: string): LoadBalancer | undefined {
    return this.loadBalancers.values().find((lb) => lb.loadBalancerName === name && lb.loadBalancerArn.includes(`:${region}:`));
  }
}
