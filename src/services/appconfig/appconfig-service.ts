import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface AppConfigApplication {
  Id: string;
  Name: string;
  Description?: string;
}

export interface AppConfigEnvironment {
  ApplicationId: string;
  EnvironmentId: string;
  Name: string;
  Description?: string;
  State: string;
}

export interface AppConfigConfigurationProfile {
  ApplicationId: string;
  Id: string;
  Name: string;
  Description?: string;
  LocationUri: string;
  Type?: string;
  Validators?: Array<{ Type: string; Content: string }>;
}

export interface AppConfigHostedConfigurationVersion {
  ApplicationId: string;
  ConfigurationProfileId: string;
  VersionNumber: number;
  ContentType: string;
  Content: Uint8Array;
  Description?: string;
}

export interface AppConfigDeployment {
  ApplicationId: string;
  EnvironmentId: string;
  DeploymentNumber: number;
  ConfigurationName: string;
  ConfigurationProfileId: string;
  ConfigurationVersion: string;
  DeploymentStrategyId: string;
  State: string;
  StartedAt: string;
  CompletedAt?: string;
  Description?: string;
}

export class AppConfigService {
  private applications: StorageBackend<string, AppConfigApplication>;
  private environments: StorageBackend<string, AppConfigEnvironment>;
  private profiles: StorageBackend<string, AppConfigConfigurationProfile>;
  private hostedVersions: StorageBackend<string, AppConfigHostedConfigurationVersion>;
  private deployments: StorageBackend<string, AppConfigDeployment>;

  private versionCounters = new Map<string, number>(); // profileKey -> next version
  private deploymentCounters = new Map<string, number>(); // envKey -> next deployment number

  constructor(private accountId: string) {
    this.applications = new InMemoryStorage();
    this.environments = new InMemoryStorage();
    this.profiles = new InMemoryStorage();
    this.hostedVersions = new InMemoryStorage();
    this.deployments = new InMemoryStorage();
  }

  private regionKey(region: string, id: string): string {
    return `${region}#${id}`;
  }

  // --- Applications ---

  createApplication(name: string, description: string | undefined, region: string): AppConfigApplication {
    if (!name) throw new AwsError("BadRequestException", "Application name is required.", 400);
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 7);
    const app: AppConfigApplication = { Id: id, Name: name, Description: description };
    this.applications.set(this.regionKey(region, id), app);
    return app;
  }

  getApplication(appId: string, region: string): AppConfigApplication {
    const app = this.applications.get(this.regionKey(region, appId));
    if (!app) throw new AwsError("ResourceNotFoundException", `Application ${appId} not found.`, 404);
    return app;
  }

  listApplications(region: string): AppConfigApplication[] {
    return this.applications.values().filter((a) =>
      this.applications.has(this.regionKey(region, a.Id)),
    );
  }

  deleteApplication(appId: string, region: string): void {
    const key = this.regionKey(region, appId);
    if (!this.applications.has(key)) throw new AwsError("ResourceNotFoundException", `Application ${appId} not found.`, 404);
    this.applications.delete(key);
  }

  applicationArn(appId: string, region: string): string {
    return buildArn("appconfig", region, this.accountId, "application/", appId);
  }

  // --- Environments ---

  createEnvironment(appId: string, name: string, description: string | undefined, region: string): AppConfigEnvironment {
    this.getApplication(appId, region); // validate app exists
    if (!name) throw new AwsError("BadRequestException", "Environment name is required.", 400);
    const envId = crypto.randomUUID().replace(/-/g, "").slice(0, 7);
    const env: AppConfigEnvironment = {
      ApplicationId: appId,
      EnvironmentId: envId,
      Name: name,
      Description: description,
      State: "READY_FOR_DEPLOYMENT",
    };
    this.environments.set(this.regionKey(region, `${appId}/${envId}`), env);
    return env;
  }

  getEnvironment(appId: string, envId: string, region: string): AppConfigEnvironment {
    this.getApplication(appId, region);
    const env = this.environments.get(this.regionKey(region, `${appId}/${envId}`));
    if (!env) throw new AwsError("ResourceNotFoundException", `Environment ${envId} not found.`, 404);
    return env;
  }

  listEnvironments(appId: string, region: string): AppConfigEnvironment[] {
    this.getApplication(appId, region);
    const prefix = `${region}#${appId}/`;
    return this.environments.keys()
      .filter((k) => k.startsWith(prefix))
      .map((k) => this.environments.get(k)!);
  }

  deleteEnvironment(appId: string, envId: string, region: string): void {
    this.getApplication(appId, region);
    const key = this.regionKey(region, `${appId}/${envId}`);
    if (!this.environments.has(key)) throw new AwsError("ResourceNotFoundException", `Environment ${envId} not found.`, 404);
    this.environments.delete(key);
  }

  environmentArn(appId: string, envId: string, region: string): string {
    return buildArn("appconfig", region, this.accountId, "application/", `${appId}/environment/${envId}`);
  }

  // --- Configuration Profiles ---

  createConfigurationProfile(
    appId: string,
    name: string,
    locationUri: string,
    description: string | undefined,
    type: string | undefined,
    validators: Array<{ Type: string; Content: string }> | undefined,
    region: string,
  ): AppConfigConfigurationProfile {
    this.getApplication(appId, region);
    if (!name) throw new AwsError("BadRequestException", "Configuration profile name is required.", 400);
    const profileId = crypto.randomUUID().replace(/-/g, "").slice(0, 7);
    const profile: AppConfigConfigurationProfile = {
      ApplicationId: appId,
      Id: profileId,
      Name: name,
      Description: description,
      LocationUri: locationUri || "hosted",
      Type: type,
      Validators: validators,
    };
    this.profiles.set(this.regionKey(region, `${appId}/${profileId}`), profile);
    return profile;
  }

  getConfigurationProfile(appId: string, profileId: string, region: string): AppConfigConfigurationProfile {
    this.getApplication(appId, region);
    const profile = this.profiles.get(this.regionKey(region, `${appId}/${profileId}`));
    if (!profile) throw new AwsError("ResourceNotFoundException", `Configuration profile ${profileId} not found.`, 404);
    return profile;
  }

  listConfigurationProfiles(appId: string, region: string): AppConfigConfigurationProfile[] {
    this.getApplication(appId, region);
    const prefix = `${region}#${appId}/`;
    return this.profiles.keys()
      .filter((k) => k.startsWith(prefix))
      .map((k) => this.profiles.get(k)!);
  }

  // --- Hosted Configuration Versions ---

  createHostedConfigurationVersion(
    appId: string,
    profileId: string,
    content: Uint8Array,
    contentType: string,
    description: string | undefined,
    region: string,
  ): AppConfigHostedConfigurationVersion {
    this.getConfigurationProfile(appId, profileId, region);
    const counterKey = `${region}#${appId}/${profileId}`;
    const nextVersion = (this.versionCounters.get(counterKey) ?? 0) + 1;
    this.versionCounters.set(counterKey, nextVersion);

    const version: AppConfigHostedConfigurationVersion = {
      ApplicationId: appId,
      ConfigurationProfileId: profileId,
      VersionNumber: nextVersion,
      ContentType: contentType,
      Content: content,
      Description: description,
    };
    this.hostedVersions.set(this.regionKey(region, `${appId}/${profileId}/${nextVersion}`), version);
    return version;
  }

  getHostedConfigurationVersion(
    appId: string,
    profileId: string,
    versionNumber: number,
    region: string,
  ): AppConfigHostedConfigurationVersion {
    this.getConfigurationProfile(appId, profileId, region);
    const version = this.hostedVersions.get(this.regionKey(region, `${appId}/${profileId}/${versionNumber}`));
    if (!version) throw new AwsError("ResourceNotFoundException", `Hosted configuration version ${versionNumber} not found.`, 404);
    return version;
  }

  // --- Deployments ---

  startDeployment(
    appId: string,
    envId: string,
    configProfileId: string,
    configVersion: string,
    deploymentStrategyId: string,
    description: string | undefined,
    region: string,
  ): AppConfigDeployment {
    this.getApplication(appId, region);
    this.getEnvironment(appId, envId, region);
    const profile = this.getConfigurationProfile(appId, configProfileId, region);

    const counterKey = `${region}#${appId}/${envId}`;
    const nextNumber = (this.deploymentCounters.get(counterKey) ?? 0) + 1;
    this.deploymentCounters.set(counterKey, nextNumber);

    const deployment: AppConfigDeployment = {
      ApplicationId: appId,
      EnvironmentId: envId,
      DeploymentNumber: nextNumber,
      ConfigurationName: profile.Name,
      ConfigurationProfileId: configProfileId,
      ConfigurationVersion: configVersion,
      DeploymentStrategyId: deploymentStrategyId || "AppConfig.AllAtOnce",
      State: "COMPLETE",
      StartedAt: new Date().toISOString(),
      CompletedAt: new Date().toISOString(),
      Description: description,
    };
    this.deployments.set(this.regionKey(region, `${appId}/${envId}/${nextNumber}`), deployment);
    return deployment;
  }

  getDeployment(appId: string, envId: string, deploymentNumber: number, region: string): AppConfigDeployment {
    this.getApplication(appId, region);
    this.getEnvironment(appId, envId, region);
    const deployment = this.deployments.get(this.regionKey(region, `${appId}/${envId}/${deploymentNumber}`));
    if (!deployment) throw new AwsError("ResourceNotFoundException", `Deployment ${deploymentNumber} not found.`, 404);
    return deployment;
  }

  listDeployments(appId: string, envId: string, region: string): AppConfigDeployment[] {
    this.getApplication(appId, region);
    this.getEnvironment(appId, envId, region);
    const prefix = `${region}#${appId}/${envId}/`;
    return this.deployments.keys()
      .filter((k) => k.startsWith(prefix))
      .map((k) => this.deployments.get(k)!);
  }
}
