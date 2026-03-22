import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

interface KinesisAnalyticsApp {
  applicationName: string;
  applicationARN: string;
  applicationStatus: string;
  runtimeEnvironment: string;
  applicationVersionId: number;
  createTimestamp: number;
  lastUpdateTimestamp: number;
  inputs: any[];
  outputs: any[];
  tags: { Key: string; Value: string }[];
}

export class KinesisAnalyticsService {
  private apps: StorageBackend<string, KinesisAnalyticsApp>;

  constructor(private accountId: string) {
    this.apps = new InMemoryStorage();
  }

  private rk(region: string, name: string): string { return `${region}#${name}`; }

  createApplication(name: string, runtimeEnvironment: string, serviceExecutionRole: string, tags: { Key: string; Value: string }[] | undefined, region: string): KinesisAnalyticsApp {
    const key = this.rk(region, name);
    if (this.apps.has(key)) throw new AwsError("ResourceInUseException", `Application ${name} already exists.`, 409);
    const now = Date.now() / 1000;
    const app: KinesisAnalyticsApp = {
      applicationName: name,
      applicationARN: buildArn("kinesisanalytics", region, this.accountId, "application/", name),
      applicationStatus: "READY",
      runtimeEnvironment: runtimeEnvironment ?? "FLINK-1_15",
      applicationVersionId: 1,
      createTimestamp: now,
      lastUpdateTimestamp: now,
      inputs: [],
      outputs: [],
      tags: tags ?? [],
    };
    this.apps.set(key, app);
    return app;
  }

  describeApplication(name: string, region: string): KinesisAnalyticsApp {
    const app = this.apps.get(this.rk(region, name));
    if (!app) throw new AwsError("ResourceNotFoundException", `Application ${name} not found.`, 404);
    return app;
  }

  listApplications(region: string): KinesisAnalyticsApp[] {
    return this.apps.values().filter((a) => a.applicationARN.includes(`:${region}:`));
  }

  deleteApplication(name: string, region: string): void {
    const key = this.rk(region, name);
    if (!this.apps.has(key)) throw new AwsError("ResourceNotFoundException", `Application ${name} not found.`, 404);
    this.apps.delete(key);
  }

  updateApplication(name: string, currentVersionId: number, region: string): KinesisAnalyticsApp {
    const app = this.describeApplication(name, region);
    if (app.applicationVersionId !== currentVersionId) throw new AwsError("InvalidArgumentException", `Version ID mismatch.`, 400);
    app.applicationVersionId++;
    app.lastUpdateTimestamp = Date.now() / 1000;
    return app;
  }

  startApplication(name: string, region: string): void {
    const app = this.describeApplication(name, region);
    if (app.applicationStatus !== "READY") throw new AwsError("InvalidApplicationConfigurationException", `Application must be in READY state.`, 400);
    app.applicationStatus = "RUNNING";
  }

  stopApplication(name: string, region: string): void {
    const app = this.describeApplication(name, region);
    if (app.applicationStatus !== "RUNNING") throw new AwsError("InvalidApplicationConfigurationException", `Application must be in RUNNING state.`, 400);
    app.applicationStatus = "READY";
  }

  addApplicationInput(name: string, input: any, region: string): void {
    const app = this.describeApplication(name, region);
    app.inputs.push(input);
    app.applicationVersionId++;
  }

  addApplicationOutput(name: string, output: any, region: string): void {
    const app = this.describeApplication(name, region);
    app.outputs.push(output);
    app.applicationVersionId++;
  }

  tagResource(arn: string, tags: { Key: string; Value: string }[]): void {
    const app = this.apps.values().find((a) => a.applicationARN === arn);
    if (!app) throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
    for (const t of tags) { const idx = app.tags.findIndex((x) => x.Key === t.Key); if (idx >= 0) app.tags[idx] = t; else app.tags.push(t); }
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const app = this.apps.values().find((a) => a.applicationARN === arn);
    if (!app) throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
    app.tags = app.tags.filter((t) => !tagKeys.includes(t.Key));
  }
}
