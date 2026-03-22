import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface CanaryRun {
  Name: string;
  Status: { State: string; StateReason: string };
  Timeline: { Started: number; Completed: number };
  ArtifactS3Location: string;
}

export interface Canary {
  id: string;
  name: string;
  arn: string;
  executionRoleArn: string;
  artifactS3Location: string;
  runtimeVersion: string;
  schedule: { Expression: string; DurationInSeconds?: number };
  runConfig: { TimeoutInSeconds: number; MemoryInMB?: number };
  successRetentionPeriodInDays: number;
  failureRetentionPeriodInDays: number;
  status: { State: string; StateReason: string; StateReasonCode: string };
  timeline: { Created: number; LastModified: number; LastStarted?: number; LastStopped?: number };
  code: { Handler: string; SourceLocationArn?: string };
  tags: Record<string, string>;
  lastRun?: CanaryRun;
}

export class SyntheticsService {
  private canaries: StorageBackend<string, Canary>;

  constructor(private accountId: string) {
    this.canaries = new InMemoryStorage();
  }

  createCanary(body: any, region: string): Canary {
    const name = body.Name;
    if (this.canaries.has(name)) {
      throw new AwsError("ConflictException", `Canary ${name} already exists.`, 409);
    }

    const now = Date.now() / 1000;
    const canary: Canary = {
      id: crypto.randomUUID(),
      name,
      arn: buildArn("synthetics", region, this.accountId, "canary:", name),
      executionRoleArn: body.ExecutionRoleArn ?? "",
      artifactS3Location: body.ArtifactS3Location ?? "",
      runtimeVersion: body.RuntimeVersion ?? "syn-nodejs-puppeteer-6.2",
      schedule: body.Schedule ?? { Expression: "rate(5 minutes)" },
      runConfig: body.RunConfig ?? { TimeoutInSeconds: 60 },
      successRetentionPeriodInDays: body.SuccessRetentionPeriodInDays ?? 31,
      failureRetentionPeriodInDays: body.FailureRetentionPeriodInDays ?? 31,
      status: { State: "READY", StateReason: "", StateReasonCode: "CREATE_COMPLETE" },
      timeline: { Created: now, LastModified: now },
      code: body.Code ?? { Handler: "index.handler" },
      tags: body.Tags ?? {},
    };

    this.canaries.set(name, canary);
    return canary;
  }

  getCanary(name: string): Canary {
    const canary = this.canaries.get(name);
    if (!canary) throw new AwsError("ResourceNotFoundException", `Canary ${name} not found.`, 404);
    return canary;
  }

  describeCanaries(): Canary[] {
    return this.canaries.values();
  }

  updateCanary(name: string, body: any): Canary {
    const canary = this.getCanary(name);
    if (body.ExecutionRoleArn !== undefined) canary.executionRoleArn = body.ExecutionRoleArn;
    if (body.RuntimeVersion !== undefined) canary.runtimeVersion = body.RuntimeVersion;
    if (body.Schedule !== undefined) canary.schedule = body.Schedule;
    if (body.RunConfig !== undefined) canary.runConfig = body.RunConfig;
    if (body.SuccessRetentionPeriodInDays !== undefined) canary.successRetentionPeriodInDays = body.SuccessRetentionPeriodInDays;
    if (body.FailureRetentionPeriodInDays !== undefined) canary.failureRetentionPeriodInDays = body.FailureRetentionPeriodInDays;
    canary.timeline.LastModified = Date.now() / 1000;
    this.canaries.set(name, canary);
    return canary;
  }

  deleteCanary(name: string): void {
    if (!this.canaries.has(name)) {
      throw new AwsError("ResourceNotFoundException", `Canary ${name} not found.`, 404);
    }
    this.canaries.delete(name);
  }

  startCanary(name: string): void {
    const canary = this.getCanary(name);
    if (canary.status.State === "RUNNING") {
      throw new AwsError("ConflictException", `Canary ${name} is already running.`, 409);
    }
    canary.status = { State: "RUNNING", StateReason: "", StateReasonCode: "RUNNING" };
    canary.timeline.LastStarted = Date.now() / 1000;
    canary.lastRun = {
      Name: name,
      Status: { State: "PASSED", StateReason: "Canary run completed successfully" },
      Timeline: { Started: Date.now() / 1000, Completed: Date.now() / 1000 + 5 },
      ArtifactS3Location: canary.artifactS3Location,
    };
    this.canaries.set(name, canary);
  }

  stopCanary(name: string): void {
    const canary = this.getCanary(name);
    if (canary.status.State !== "RUNNING") {
      throw new AwsError("ConflictException", `Canary ${name} is not running.`, 409);
    }
    canary.status = { State: "STOPPED", StateReason: "", StateReasonCode: "USER_STOPPED" };
    canary.timeline.LastStopped = Date.now() / 1000;
    this.canaries.set(name, canary);
  }

  describeCanariesLastRun(): { Name: string; LastRun?: CanaryRun }[] {
    return this.canaries.values().map((c) => ({
      Name: c.name,
      LastRun: c.lastRun,
    }));
  }

  tagResource(arn: string, tags: Record<string, string>): void {
    const canary = this.canaries.values().find((c) => c.arn === arn);
    if (!canary) throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
    Object.assign(canary.tags, tags);
    this.canaries.set(canary.name, canary);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const canary = this.canaries.values().find((c) => c.arn === arn);
    if (!canary) throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
    for (const key of tagKeys) {
      delete canary.tags[key];
    }
    this.canaries.set(canary.name, canary);
  }

  listTagsForResource(arn: string): Record<string, string> {
    const canary = this.canaries.values().find((c) => c.arn === arn);
    if (!canary) throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
    return canary.tags;
  }

  formatCanary(canary: Canary): Record<string, any> {
    return {
      Id: canary.id,
      Name: canary.name,
      Arn: canary.arn,
      ExecutionRoleArn: canary.executionRoleArn,
      ArtifactS3Location: canary.artifactS3Location,
      RuntimeVersion: canary.runtimeVersion,
      Schedule: canary.schedule,
      RunConfig: canary.runConfig,
      SuccessRetentionPeriodInDays: canary.successRetentionPeriodInDays,
      FailureRetentionPeriodInDays: canary.failureRetentionPeriodInDays,
      Status: canary.status,
      Timeline: canary.timeline,
      Code: canary.code,
      Tags: canary.tags,
    };
  }
}
