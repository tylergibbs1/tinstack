import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface LaunchConfiguration {
  launchConfigurationName: string;
  launchConfigurationARN: string;
  imageId: string;
  instanceType: string;
  keyName?: string;
  securityGroups: string[];
  userData?: string;
  createdTime: string;
}

export interface AutoScalingGroup {
  autoScalingGroupName: string;
  autoScalingGroupARN: string;
  launchConfigurationName?: string;
  launchTemplate?: { launchTemplateId?: string; launchTemplateName?: string; version?: string };
  minSize: number;
  maxSize: number;
  desiredCapacity: number;
  defaultCooldown: number;
  availabilityZones: string[];
  healthCheckType: string;
  healthCheckGracePeriod: number;
  status: string;
  vpcZoneIdentifier: string;
  tags: { key: string; value: string; resourceId: string; resourceType: string; propagateAtLaunch: boolean }[];
  createdTime: string;
}

export interface ScalingPolicy {
  policyName: string;
  policyARN: string;
  autoScalingGroupName: string;
  policyType: string;
  adjustmentType?: string;
  scalingAdjustment?: number;
  cooldown?: number;
  targetTrackingConfiguration?: any;
  alarms: any[];
  enabled: boolean;
}

export interface ScalingActivity {
  activityId: string;
  autoScalingGroupName: string;
  description: string;
  cause: string;
  startTime: string;
  endTime: string;
  statusCode: string;
  progress: number;
}

export class AutoScalingService {
  private launchConfigurations: StorageBackend<string, LaunchConfiguration>;
  private autoScalingGroups: StorageBackend<string, AutoScalingGroup>;
  private scalingPolicies: StorageBackend<string, ScalingPolicy>;
  private activities: ScalingActivity[] = [];
  private asgTags: StorageBackend<string, { key: string; value: string; resourceId: string; resourceType: string; propagateAtLaunch: boolean }[]>;

  constructor(private accountId: string) {
    this.launchConfigurations = new InMemoryStorage();
    this.autoScalingGroups = new InMemoryStorage();
    this.scalingPolicies = new InMemoryStorage();
    this.asgTags = new InMemoryStorage();
  }

  private lcKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  private asgKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  private policyKey(region: string, asgName: string, policyName: string): string {
    return `${region}#${asgName}#${policyName}`;
  }

  // --- Launch Configurations ---

  createLaunchConfiguration(
    name: string,
    imageId: string,
    instanceType: string,
    keyName: string | undefined,
    securityGroups: string[],
    userData: string | undefined,
    region: string,
  ): void {
    const key = this.lcKey(region, name);
    if (this.launchConfigurations.has(key)) {
      throw new AwsError("AlreadyExists", `Launch configuration ${name} already exists`, 400);
    }
    const arn = buildArn("autoscaling", region, this.accountId, "launchConfiguration:", `${crypto.randomUUID()}:launchConfigurationName/${name}`);
    const lc: LaunchConfiguration = {
      launchConfigurationName: name,
      launchConfigurationARN: arn,
      imageId,
      instanceType,
      keyName,
      securityGroups,
      userData,
      createdTime: new Date().toISOString(),
    };
    this.launchConfigurations.set(key, lc);
  }

  describeLaunchConfigurations(names: string[] | undefined, region: string): LaunchConfiguration[] {
    if (names && names.length > 0) {
      return names
        .map((n) => this.launchConfigurations.get(this.lcKey(region, n)))
        .filter((lc): lc is LaunchConfiguration => lc !== undefined);
    }
    return this.launchConfigurations.values().filter((lc) => lc.launchConfigurationARN.includes(`:${region}:`));
  }

  deleteLaunchConfiguration(name: string, region: string): void {
    const key = this.lcKey(region, name);
    if (!this.launchConfigurations.has(key)) {
      throw new AwsError("ValidationError", `Launch configuration name not found - ${name}`, 400);
    }
    this.launchConfigurations.delete(key);
  }

  // --- Auto Scaling Groups ---

  createAutoScalingGroup(
    name: string,
    launchConfigurationName: string | undefined,
    launchTemplate: { launchTemplateId?: string; launchTemplateName?: string; version?: string } | undefined,
    minSize: number,
    maxSize: number,
    desiredCapacity: number | undefined,
    availabilityZones: string[],
    vpcZoneIdentifier: string | undefined,
    healthCheckType: string | undefined,
    healthCheckGracePeriod: number | undefined,
    defaultCooldown: number | undefined,
    tags: { key: string; value: string; resourceId: string; resourceType: string; propagateAtLaunch: boolean }[] | undefined,
    region: string,
  ): void {
    const key = this.asgKey(region, name);
    if (this.autoScalingGroups.has(key)) {
      throw new AwsError("AlreadyExists", `AutoScalingGroup ${name} already exists`, 400);
    }

    const arn = buildArn("autoscaling", region, this.accountId, "autoScalingGroup:", `${crypto.randomUUID()}:autoScalingGroupName/${name}`);
    const asg: AutoScalingGroup = {
      autoScalingGroupName: name,
      autoScalingGroupARN: arn,
      launchConfigurationName,
      launchTemplate,
      minSize,
      maxSize,
      desiredCapacity: desiredCapacity ?? minSize,
      defaultCooldown: defaultCooldown ?? 300,
      availabilityZones,
      healthCheckType: healthCheckType ?? "EC2",
      healthCheckGracePeriod: healthCheckGracePeriod ?? 0,
      status: "Active",
      vpcZoneIdentifier: vpcZoneIdentifier ?? "",
      tags: tags ?? [],
      createdTime: new Date().toISOString(),
    };

    this.autoScalingGroups.set(key, asg);
    if (asg.tags.length > 0) {
      this.asgTags.set(key, asg.tags);
    }

    this.addActivity(name, "Launching a new EC2 instance", `At ${new Date().toISOString()}, a user request created an AutoScalingGroup.`, "Successful");
  }

  describeAutoScalingGroups(names: string[] | undefined, region: string): AutoScalingGroup[] {
    if (names && names.length > 0) {
      return names
        .map((n) => this.autoScalingGroups.get(this.asgKey(region, n)))
        .filter((asg): asg is AutoScalingGroup => asg !== undefined);
    }
    return this.autoScalingGroups.values().filter((asg) => asg.autoScalingGroupARN.includes(`:${region}:`));
  }

  updateAutoScalingGroup(
    name: string,
    minSize: number | undefined,
    maxSize: number | undefined,
    desiredCapacity: number | undefined,
    defaultCooldown: number | undefined,
    healthCheckType: string | undefined,
    healthCheckGracePeriod: number | undefined,
    region: string,
  ): void {
    const key = this.asgKey(region, name);
    const asg = this.autoScalingGroups.get(key);
    if (!asg) {
      throw new AwsError("ValidationError", `AutoScalingGroup name not found - ${name}`, 400);
    }
    if (minSize !== undefined) asg.minSize = minSize;
    if (maxSize !== undefined) asg.maxSize = maxSize;
    if (desiredCapacity !== undefined) asg.desiredCapacity = desiredCapacity;
    if (defaultCooldown !== undefined) asg.defaultCooldown = defaultCooldown;
    if (healthCheckType !== undefined) asg.healthCheckType = healthCheckType;
    if (healthCheckGracePeriod !== undefined) asg.healthCheckGracePeriod = healthCheckGracePeriod;
  }

  deleteAutoScalingGroup(name: string, region: string): void {
    const key = this.asgKey(region, name);
    if (!this.autoScalingGroups.has(key)) {
      throw new AwsError("ValidationError", `AutoScalingGroup name not found - ${name}`, 400);
    }
    this.autoScalingGroups.delete(key);
    this.asgTags.delete(key);
  }

  setDesiredCapacity(name: string, desiredCapacity: number, region: string): void {
    const key = this.asgKey(region, name);
    const asg = this.autoScalingGroups.get(key);
    if (!asg) {
      throw new AwsError("ValidationError", `AutoScalingGroup name not found - ${name}`, 400);
    }
    if (desiredCapacity < asg.minSize || desiredCapacity > asg.maxSize) {
      throw new AwsError("ValidationError", `New SetDesiredCapacity value ${desiredCapacity} is outside of the AutoScalingGroup's min/max range.`, 400);
    }
    asg.desiredCapacity = desiredCapacity;
    this.addActivity(name, `Setting desired capacity to ${desiredCapacity}`, "User request", "Successful");
  }

  // --- Scaling Policies ---

  putScalingPolicy(
    autoScalingGroupName: string,
    policyName: string,
    policyType: string | undefined,
    adjustmentType: string | undefined,
    scalingAdjustment: number | undefined,
    cooldown: number | undefined,
    targetTrackingConfiguration: any | undefined,
    region: string,
  ): ScalingPolicy {
    const asgKey = this.asgKey(region, autoScalingGroupName);
    if (!this.autoScalingGroups.has(asgKey)) {
      throw new AwsError("ValidationError", `AutoScalingGroup name not found - ${autoScalingGroupName}`, 400);
    }

    const key = this.policyKey(region, autoScalingGroupName, policyName);
    const arn = buildArn("autoscaling", region, this.accountId, "scalingPolicy:", `${crypto.randomUUID()}:autoScalingGroupName/${autoScalingGroupName}:policyName/${policyName}`);

    const policy: ScalingPolicy = {
      policyName,
      policyARN: arn,
      autoScalingGroupName,
      policyType: policyType ?? "SimpleScaling",
      adjustmentType,
      scalingAdjustment,
      cooldown,
      targetTrackingConfiguration,
      alarms: [],
      enabled: true,
    };

    this.scalingPolicies.set(key, policy);
    return policy;
  }

  describePolicies(autoScalingGroupName: string | undefined, policyNames: string[] | undefined, region: string): ScalingPolicy[] {
    let policies = this.scalingPolicies.values().filter((p) => p.policyARN.includes(`:${region}:`));
    if (autoScalingGroupName) {
      policies = policies.filter((p) => p.autoScalingGroupName === autoScalingGroupName);
    }
    if (policyNames && policyNames.length > 0) {
      policies = policies.filter((p) => policyNames.includes(p.policyName));
    }
    return policies;
  }

  deletePolicy(autoScalingGroupName: string | undefined, policyName: string, region: string): void {
    if (autoScalingGroupName) {
      const key = this.policyKey(region, autoScalingGroupName, policyName);
      if (!this.scalingPolicies.has(key)) {
        throw new AwsError("ValidationError", `Policy not found - ${policyName}`, 400);
      }
      this.scalingPolicies.delete(key);
    } else {
      // Find by name across all ASGs
      const found = this.scalingPolicies.values().find((p) => p.policyName === policyName && p.policyARN.includes(`:${region}:`));
      if (!found) {
        throw new AwsError("ValidationError", `Policy not found - ${policyName}`, 400);
      }
      const key = this.policyKey(region, found.autoScalingGroupName, policyName);
      this.scalingPolicies.delete(key);
    }
  }

  // --- Activities ---

  describeScalingActivities(autoScalingGroupName: string | undefined, _region: string): ScalingActivity[] {
    if (autoScalingGroupName) {
      return this.activities.filter((a) => a.autoScalingGroupName === autoScalingGroupName);
    }
    return this.activities;
  }

  private addActivity(asgName: string, description: string, cause: string, statusCode: string): void {
    const now = new Date().toISOString();
    this.activities.push({
      activityId: crypto.randomUUID(),
      autoScalingGroupName: asgName,
      description,
      cause,
      startTime: now,
      endTime: now,
      statusCode,
      progress: 100,
    });
  }

  // --- Tags ---

  createOrUpdateTags(
    tags: { key: string; value: string; resourceId: string; resourceType: string; propagateAtLaunch: boolean }[],
    region: string,
  ): void {
    for (const tag of tags) {
      const asgKey = this.asgKey(region, tag.resourceId);
      const asg = this.autoScalingGroups.get(asgKey);
      if (!asg) continue;
      const idx = asg.tags.findIndex((t) => t.key === tag.key);
      if (idx >= 0) {
        asg.tags[idx] = tag;
      } else {
        asg.tags.push(tag);
      }
    }
  }

  describeTags(region: string): { key: string; value: string; resourceId: string; resourceType: string; propagateAtLaunch: boolean }[] {
    const result: { key: string; value: string; resourceId: string; resourceType: string; propagateAtLaunch: boolean }[] = [];
    for (const asg of this.autoScalingGroups.values()) {
      if (!asg.autoScalingGroupARN.includes(`:${region}:`)) continue;
      for (const tag of asg.tags) {
        result.push(tag);
      }
    }
    return result;
  }
}
