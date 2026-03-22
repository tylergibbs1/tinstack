import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Application {
  applicationId: string;
  applicationName: string;
  computePlatform: string;
  createTime: number;
}

export interface DeploymentGroup {
  deploymentGroupId: string;
  deploymentGroupName: string;
  applicationName: string;
  deploymentConfigName: string;
  serviceRoleArn: string;
  ec2TagFilters: any[];
  autoScalingGroups: string[];
  deploymentStyle?: any;
  autoRollbackConfiguration?: any;
}

export interface Deployment {
  deploymentId: string;
  applicationName: string;
  deploymentGroupName: string;
  deploymentConfigName: string;
  revision: any;
  status: string;
  createTime: number;
  startTime?: number;
  completeTime?: number;
  description?: string;
}

export class CodeDeployService {
  private applications = new Map<string, Application>();
  private deploymentGroups = new Map<string, DeploymentGroup>();
  private deployments = new Map<string, Deployment>();
  private tags = new Map<string, Record<string, string>>();

  constructor(private accountId: string) {}

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createApplication(params: { applicationName: string; computePlatform?: string; tags?: { Key: string; Value: string }[] }, region: string): Application {
    const key = this.regionKey(region, params.applicationName);
    if (this.applications.has(key)) {
      throw new AwsError("ApplicationAlreadyExistsException", `Application ${params.applicationName} already exists.`, 400);
    }

    const app: Application = {
      applicationId: crypto.randomUUID(),
      applicationName: params.applicationName,
      computePlatform: params.computePlatform ?? "Server",
      createTime: Date.now() / 1000,
    };

    this.applications.set(key, app);

    const arn = buildArn("codedeploy", region, this.accountId, "application:", params.applicationName);
    if (params.tags) {
      const tagMap: Record<string, string> = {};
      for (const t of params.tags) tagMap[t.Key] = t.Value;
      this.tags.set(arn, tagMap);
    }

    return app;
  }

  getApplication(name: string, region: string): Application {
    const key = this.regionKey(region, name);
    const app = this.applications.get(key);
    if (!app) throw new AwsError("ApplicationDoesNotExistException", `Application ${name} does not exist.`, 400);
    return app;
  }

  listApplications(region: string): string[] {
    return Array.from(this.applications.entries())
      .filter(([k]) => k.startsWith(`${region}#`))
      .map(([, v]) => v.applicationName);
  }

  deleteApplication(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.applications.has(key)) {
      throw new AwsError("ApplicationDoesNotExistException", `Application ${name} does not exist.`, 400);
    }
    this.applications.delete(key);

    // Delete associated deployment groups
    for (const [dgKey, dg] of this.deploymentGroups) {
      if (dg.applicationName === name && dgKey.startsWith(`${region}#`)) {
        this.deploymentGroups.delete(dgKey);
      }
    }
  }

  createDeploymentGroup(params: {
    applicationName: string;
    deploymentGroupName: string;
    deploymentConfigName?: string;
    serviceRoleArn: string;
    ec2TagFilters?: any[];
    autoScalingGroups?: string[];
    deploymentStyle?: any;
    autoRollbackConfiguration?: any;
  }, region: string): string {
    // Validate app exists
    this.getApplication(params.applicationName, region);

    const dgKey = this.regionKey(region, `${params.applicationName}/${params.deploymentGroupName}`);
    if (this.deploymentGroups.has(dgKey)) {
      throw new AwsError("DeploymentGroupAlreadyExistsException", `Deployment group ${params.deploymentGroupName} already exists.`, 400);
    }

    const dgId = crypto.randomUUID();
    const dg: DeploymentGroup = {
      deploymentGroupId: dgId,
      deploymentGroupName: params.deploymentGroupName,
      applicationName: params.applicationName,
      deploymentConfigName: params.deploymentConfigName ?? "CodeDeployDefault.AllAtOnce",
      serviceRoleArn: params.serviceRoleArn,
      ec2TagFilters: params.ec2TagFilters ?? [],
      autoScalingGroups: params.autoScalingGroups ?? [],
      deploymentStyle: params.deploymentStyle,
      autoRollbackConfiguration: params.autoRollbackConfiguration,
    };

    this.deploymentGroups.set(dgKey, dg);
    return dgId;
  }

  getDeploymentGroup(applicationName: string, deploymentGroupName: string, region: string): DeploymentGroup {
    this.getApplication(applicationName, region);
    const dgKey = this.regionKey(region, `${applicationName}/${deploymentGroupName}`);
    const dg = this.deploymentGroups.get(dgKey);
    if (!dg) throw new AwsError("DeploymentGroupDoesNotExistException", `Deployment group ${deploymentGroupName} does not exist.`, 400);
    return dg;
  }

  listDeploymentGroups(applicationName: string, region: string): string[] {
    this.getApplication(applicationName, region);
    const prefix = `${region}#${applicationName}/`;
    return Array.from(this.deploymentGroups.entries())
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v.deploymentGroupName);
  }

  deleteDeploymentGroup(applicationName: string, deploymentGroupName: string, region: string): void {
    this.getApplication(applicationName, region);
    const dgKey = this.regionKey(region, `${applicationName}/${deploymentGroupName}`);
    if (!this.deploymentGroups.has(dgKey)) {
      throw new AwsError("DeploymentGroupDoesNotExistException", `Deployment group ${deploymentGroupName} does not exist.`, 400);
    }
    this.deploymentGroups.delete(dgKey);
  }

  createDeployment(params: {
    applicationName: string;
    deploymentGroupName: string;
    deploymentConfigName?: string;
    revision?: any;
    description?: string;
  }, region: string): string {
    this.getApplication(params.applicationName, region);
    this.getDeploymentGroup(params.applicationName, params.deploymentGroupName, region);

    const deploymentId = `d-${crypto.randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase()}`;
    const deployment: Deployment = {
      deploymentId,
      applicationName: params.applicationName,
      deploymentGroupName: params.deploymentGroupName,
      deploymentConfigName: params.deploymentConfigName ?? "CodeDeployDefault.AllAtOnce",
      revision: params.revision ?? {},
      status: "Created",
      createTime: Date.now() / 1000,
      description: params.description,
    };

    this.deployments.set(deploymentId, deployment);
    return deploymentId;
  }

  getDeployment(deploymentId: string): Deployment {
    const dep = this.deployments.get(deploymentId);
    if (!dep) throw new AwsError("DeploymentDoesNotExistException", `Deployment ${deploymentId} does not exist.`, 400);
    return dep;
  }

  listDeployments(applicationName?: string, deploymentGroupName?: string, region?: string): string[] {
    let deps = Array.from(this.deployments.values());
    if (applicationName) deps = deps.filter((d) => d.applicationName === applicationName);
    if (deploymentGroupName) deps = deps.filter((d) => d.deploymentGroupName === deploymentGroupName);
    return deps.map((d) => d.deploymentId);
  }

  stopDeployment(deploymentId: string): Deployment {
    const dep = this.getDeployment(deploymentId);
    dep.status = "Stopped";
    dep.completeTime = Date.now() / 1000;
    return dep;
  }

  tagResource(arn: string, tags: { Key: string; Value: string }[]): void {
    const existing = this.tags.get(arn) ?? {};
    for (const t of tags) existing[t.Key] = t.Value;
    this.tags.set(arn, existing);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.tags.get(arn);
    if (existing) {
      for (const k of tagKeys) delete existing[k];
    }
  }

  listTagsForResource(arn: string): { Key: string; Value: string }[] {
    const existing = this.tags.get(arn) ?? {};
    return Object.entries(existing).map(([Key, Value]) => ({ Key, Value }));
  }
}
