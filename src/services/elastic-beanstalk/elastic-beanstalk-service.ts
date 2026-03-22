import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface BeanstalkApp {
  applicationName: string;
  applicationArn: string;
  description?: string;
  dateCreated: string;
  dateUpdated: string;
  versions: AppVersion[];
}

export interface AppVersion {
  applicationName: string;
  versionLabel: string;
  description?: string;
  sourceBundle?: { s3Bucket: string; s3Key: string };
  dateCreated: string;
}

export interface BeanstalkEnv {
  environmentId: string;
  environmentName: string;
  applicationName: string;
  versionLabel?: string;
  solutionStackName?: string;
  status: string;
  health: string;
  tier: { name: string; type: string };
  dateCreated: string;
  dateUpdated: string;
  endpointURL?: string;
  cname?: string;
  environmentArn: string;
}

export class ElasticBeanstalkService {
  private apps: StorageBackend<string, BeanstalkApp>;
  private envs: StorageBackend<string, BeanstalkEnv>;

  constructor(private accountId: string) {
    this.apps = new InMemoryStorage();
    this.envs = new InMemoryStorage();
  }

  createApplication(name: string, description: string | undefined, region: string): BeanstalkApp {
    if (this.apps.get(name)) throw new AwsError("InvalidParameterValue", `Application ${name} already exists.`, 400);
    const now = new Date().toISOString();
    const app: BeanstalkApp = {
      applicationName: name,
      applicationArn: buildArn("elasticbeanstalk", region, this.accountId, "application/", name),
      description, dateCreated: now, dateUpdated: now, versions: [],
    };
    this.apps.set(name, app);
    return app;
  }

  describeApplications(names?: string[]): BeanstalkApp[] {
    const all = this.apps.values();
    return names?.length ? all.filter((a) => names.includes(a.applicationName)) : all;
  }

  deleteApplication(name: string): void {
    if (!this.apps.get(name)) throw new AwsError("InvalidParameterValue", `Application ${name} not found.`, 400);
    this.apps.delete(name);
  }

  createApplicationVersion(appName: string, versionLabel: string, description?: string, sourceBundle?: { s3Bucket: string; s3Key: string }): AppVersion {
    const app = this.apps.get(appName);
    if (!app) throw new AwsError("InvalidParameterValue", `Application ${appName} not found.`, 400);
    const version: AppVersion = { applicationName: appName, versionLabel, description, sourceBundle, dateCreated: new Date().toISOString() };
    app.versions.push(version);
    return version;
  }

  describeApplicationVersions(appName?: string): AppVersion[] {
    if (appName) {
      const app = this.apps.get(appName);
      return app ? app.versions : [];
    }
    return this.apps.values().flatMap((a) => a.versions);
  }

  createEnvironment(appName: string, envName: string, versionLabel: string | undefined, solutionStack: string | undefined, tier: any, region: string): BeanstalkEnv {
    if (!this.apps.get(appName)) throw new AwsError("InvalidParameterValue", `Application ${appName} not found.`, 400);
    const now = new Date().toISOString();
    const envId = `e-${Math.random().toString(36).substring(2, 14)}`;
    const env: BeanstalkEnv = {
      environmentId: envId,
      environmentName: envName,
      applicationName: appName,
      versionLabel,
      solutionStackName: solutionStack ?? "64bit Amazon Linux 2 v5.8.0 running Node.js 18",
      status: "Ready",
      health: "Green",
      tier: tier ?? { name: "WebServer", type: "Standard" },
      dateCreated: now, dateUpdated: now,
      endpointURL: `${envName}.${region}.elasticbeanstalk.com`,
      cname: `${envName}.${region}.elasticbeanstalk.com`,
      environmentArn: buildArn("elasticbeanstalk", region, this.accountId, "environment/", `${appName}/${envName}`),
    };
    this.envs.set(envId, env);
    return env;
  }

  describeEnvironments(appName?: string, envNames?: string[], envIds?: string[]): BeanstalkEnv[] {
    return this.envs.values().filter((e) => {
      if (e.status === "Terminated") return false;
      if (appName && e.applicationName !== appName) return false;
      if (envNames?.length && !envNames.includes(e.environmentName)) return false;
      if (envIds?.length && !envIds.includes(e.environmentId)) return false;
      return true;
    });
  }

  terminateEnvironment(envId: string): BeanstalkEnv {
    const env = this.envs.get(envId);
    if (!env) throw new AwsError("InvalidParameterValue", `Environment ${envId} not found.`, 400);
    env.status = "Terminated";
    env.dateUpdated = new Date().toISOString();
    return env;
  }

  updateEnvironment(envId: string, versionLabel?: string, description?: string): BeanstalkEnv {
    const env = this.envs.get(envId);
    if (!env) throw new AwsError("InvalidParameterValue", `Environment ${envId} not found.`, 400);
    if (versionLabel) env.versionLabel = versionLabel;
    env.dateUpdated = new Date().toISOString();
    return env;
  }
}
