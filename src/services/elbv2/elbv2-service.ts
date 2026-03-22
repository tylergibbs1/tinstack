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
  defaultActions: { type: string; targetGroupArn?: string; order?: number }[];
  tags: Record<string, string>;
}

export class Elbv2Service {
  private loadBalancers: StorageBackend<string, LoadBalancer>;
  private targetGroups: StorageBackend<string, TargetGroup>;
  private listeners: StorageBackend<string, Listener>;
  private tags: StorageBackend<string, Record<string, string>>; // arn -> tags

  constructor(private accountId: string) {
    this.loadBalancers = new InMemoryStorage();
    this.targetGroups = new InMemoryStorage();
    this.listeners = new InMemoryStorage();
    this.tags = new InMemoryStorage();
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
    this.listeners.delete(arn);
    this.tags.delete(arn);
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
