import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface ScalableTarget {
  serviceNamespace: string;
  resourceId: string;
  scalableDimension: string;
  minCapacity: number;
  maxCapacity: number;
  roleARN: string;
  creationTime: number;
  suspendedState?: {
    dynamicScalingInSuspended: boolean;
    dynamicScalingOutSuspended: boolean;
    scheduledScalingSuspended: boolean;
  };
}

export interface ScalingPolicy {
  policyARN: string;
  policyName: string;
  serviceNamespace: string;
  resourceId: string;
  scalableDimension: string;
  policyType: string;
  targetTrackingScalingPolicyConfiguration?: {
    targetValue: number;
    predefinedMetricSpecification?: { predefinedMetricType: string };
    customizedMetricSpecification?: any;
    scaleInCooldown?: number;
    scaleOutCooldown?: number;
    disableScaleIn?: boolean;
  };
  stepScalingPolicyConfiguration?: any;
  alarms: { alarmName: string; alarmARN: string }[];
  creationTime: number;
}

export interface ScalingActivity {
  activityId: string;
  serviceNamespace: string;
  resourceId: string;
  scalableDimension: string;
  description: string;
  cause: string;
  startTime: number;
  endTime: number;
  statusCode: string;
}

export class ApplicationAutoScalingService {
  private targets: StorageBackend<string, ScalableTarget>;
  private policies: StorageBackend<string, ScalingPolicy>;
  private activities: ScalingActivity[] = [];

  constructor(private accountId: string) {
    this.targets = new InMemoryStorage();
    this.policies = new InMemoryStorage();
  }

  private targetKey(namespace: string, resourceId: string, dimension: string): string {
    return `${namespace}#${resourceId}#${dimension}`;
  }

  private policyKey(namespace: string, resourceId: string, policyName: string): string {
    return `${namespace}#${resourceId}#${policyName}`;
  }

  // --- Scalable Targets ---

  registerScalableTarget(
    serviceNamespace: string,
    resourceId: string,
    scalableDimension: string,
    minCapacity: number | undefined,
    maxCapacity: number | undefined,
    roleARN: string | undefined,
    suspendedState: any | undefined,
    region: string,
  ): void {
    const key = this.targetKey(serviceNamespace, resourceId, scalableDimension);
    const existing = this.targets.get(key);

    if (existing) {
      // Update existing target
      if (minCapacity !== undefined) existing.minCapacity = minCapacity;
      if (maxCapacity !== undefined) existing.maxCapacity = maxCapacity;
      if (roleARN !== undefined) existing.roleARN = roleARN;
      if (suspendedState !== undefined) existing.suspendedState = suspendedState;
      return;
    }

    const defaultRoleArn = roleARN ?? buildArn("iam", "", this.accountId, "role/", "aws-service-role/autoscaling");
    const target: ScalableTarget = {
      serviceNamespace,
      resourceId,
      scalableDimension,
      minCapacity: minCapacity ?? 0,
      maxCapacity: maxCapacity ?? 1,
      roleARN: defaultRoleArn,
      creationTime: Date.now() / 1000,
      suspendedState: suspendedState ?? {
        dynamicScalingInSuspended: false,
        dynamicScalingOutSuspended: false,
        scheduledScalingSuspended: false,
      },
    };

    this.targets.set(key, target);
  }

  describeScalableTargets(
    serviceNamespace: string,
    resourceIds: string[] | undefined,
    scalableDimension: string | undefined,
  ): ScalableTarget[] {
    let targets = this.targets.values().filter((t) => t.serviceNamespace === serviceNamespace);
    if (resourceIds && resourceIds.length > 0) {
      targets = targets.filter((t) => resourceIds.includes(t.resourceId));
    }
    if (scalableDimension) {
      targets = targets.filter((t) => t.scalableDimension === scalableDimension);
    }
    return targets;
  }

  deregisterScalableTarget(
    serviceNamespace: string,
    resourceId: string,
    scalableDimension: string,
  ): void {
    const key = this.targetKey(serviceNamespace, resourceId, scalableDimension);
    if (!this.targets.has(key)) {
      throw new AwsError("ObjectNotFoundException", `No scalable target found for service namespace: ${serviceNamespace}, resource ID: ${resourceId}, scalable dimension: ${scalableDimension}`, 400);
    }
    this.targets.delete(key);

    // Also delete associated policies
    for (const policy of this.policies.values()) {
      if (policy.serviceNamespace === serviceNamespace && policy.resourceId === resourceId && policy.scalableDimension === scalableDimension) {
        const pKey = this.policyKey(serviceNamespace, resourceId, policy.policyName);
        this.policies.delete(pKey);
      }
    }
  }

  // --- Scaling Policies ---

  putScalingPolicy(
    policyName: string,
    serviceNamespace: string,
    resourceId: string,
    scalableDimension: string,
    policyType: string | undefined,
    targetTrackingScalingPolicyConfiguration: any | undefined,
    stepScalingPolicyConfiguration: any | undefined,
    region: string,
  ): ScalingPolicy {
    // Verify target exists
    const targetKey = this.targetKey(serviceNamespace, resourceId, scalableDimension);
    if (!this.targets.has(targetKey)) {
      throw new AwsError("ObjectNotFoundException", `No scalable target found for service namespace: ${serviceNamespace}, resource ID: ${resourceId}, scalable dimension: ${scalableDimension}`, 400);
    }

    const key = this.policyKey(serviceNamespace, resourceId, policyName);
    const arn = buildArn("autoscaling", region, this.accountId, "scalingPolicy:", `${crypto.randomUUID()}:resource/${serviceNamespace}/${resourceId}:policyName/${policyName}`);

    const policy: ScalingPolicy = {
      policyARN: arn,
      policyName,
      serviceNamespace,
      resourceId,
      scalableDimension,
      policyType: policyType ?? "TargetTrackingScaling",
      targetTrackingScalingPolicyConfiguration,
      stepScalingPolicyConfiguration,
      alarms: [],
      creationTime: Date.now() / 1000,
    };

    this.policies.set(key, policy);
    return policy;
  }

  describeScalingPolicies(
    serviceNamespace: string,
    resourceId: string | undefined,
    policyNames: string[] | undefined,
    scalableDimension: string | undefined,
  ): ScalingPolicy[] {
    let policies = this.policies.values().filter((p) => p.serviceNamespace === serviceNamespace);
    if (resourceId) {
      policies = policies.filter((p) => p.resourceId === resourceId);
    }
    if (policyNames && policyNames.length > 0) {
      policies = policies.filter((p) => policyNames.includes(p.policyName));
    }
    if (scalableDimension) {
      policies = policies.filter((p) => p.scalableDimension === scalableDimension);
    }
    return policies;
  }

  deleteScalingPolicy(
    policyName: string,
    serviceNamespace: string,
    resourceId: string,
    scalableDimension: string,
  ): void {
    const key = this.policyKey(serviceNamespace, resourceId, policyName);
    if (!this.policies.has(key)) {
      throw new AwsError("ObjectNotFoundException", `No scaling policy found for service namespace: ${serviceNamespace}, resource ID: ${resourceId}, policy name: ${policyName}`, 400);
    }
    this.policies.delete(key);
  }

  // --- Scaling Activities ---

  describeScalingActivities(
    serviceNamespace: string,
    resourceId: string | undefined,
    scalableDimension: string | undefined,
  ): ScalingActivity[] {
    let activities = this.activities.filter((a) => a.serviceNamespace === serviceNamespace);
    if (resourceId) {
      activities = activities.filter((a) => a.resourceId === resourceId);
    }
    if (scalableDimension) {
      activities = activities.filter((a) => a.scalableDimension === scalableDimension);
    }
    return activities;
  }
}
