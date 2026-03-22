import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

interface EmrServerlessApp {
  applicationId: string;
  name: string;
  arn: string;
  releaseLabel: string;
  type: string;
  state: string;
  createdAt: number;
  updatedAt: number;
  tags: Record<string, string>;
}

interface EmrServerlessJobRun {
  applicationId: string;
  jobRunId: string;
  arn: string;
  name?: string;
  state: string;
  executionRole: string;
  jobDriver: any;
  createdAt: number;
  updatedAt: number;
}

export class EmrServerlessService {
  private apps: StorageBackend<string, EmrServerlessApp>;
  private jobRuns: StorageBackend<string, EmrServerlessJobRun>;

  constructor(private accountId: string) {
    this.apps = new InMemoryStorage();
    this.jobRuns = new InMemoryStorage();
  }

  createApplication(name: string, releaseLabel: string, type: string, tags: Record<string, string> | undefined, region: string): EmrServerlessApp {
    const id = crypto.randomUUID().slice(0, 16);
    const arn = buildArn("emr-serverless", region, this.accountId, "/applications/", id);
    const now = Date.now() / 1000;
    const app: EmrServerlessApp = { applicationId: id, name, arn, releaseLabel: releaseLabel ?? "emr-6.9.0", type: type ?? "SPARK", state: "CREATED", createdAt: now, updatedAt: now, tags: tags ?? {} };
    this.apps.set(id, app);
    return app;
  }

  getApplication(applicationId: string): EmrServerlessApp {
    const app = this.apps.get(applicationId);
    if (!app) throw new AwsError("ResourceNotFoundException", `Application ${applicationId} not found.`, 404);
    return app;
  }

  listApplications(): EmrServerlessApp[] { return this.apps.values(); }

  deleteApplication(applicationId: string): void {
    if (!this.apps.has(applicationId)) throw new AwsError("ResourceNotFoundException", `Application ${applicationId} not found.`, 404);
    this.apps.delete(applicationId);
  }

  updateApplication(applicationId: string, updates: any): EmrServerlessApp {
    const app = this.getApplication(applicationId);
    if (updates.releaseLabel) app.releaseLabel = updates.releaseLabel;
    app.updatedAt = Date.now() / 1000;
    return app;
  }

  startApplication(applicationId: string): void {
    const app = this.getApplication(applicationId);
    app.state = "STARTED";
  }

  stopApplication(applicationId: string): void {
    const app = this.getApplication(applicationId);
    app.state = "STOPPED";
  }

  startJobRun(applicationId: string, executionRoleArn: string, jobDriver: any, name: string | undefined, region: string): EmrServerlessJobRun {
    this.getApplication(applicationId);
    const jobRunId = crypto.randomUUID().slice(0, 16);
    const arn = buildArn("emr-serverless", region, this.accountId, `/applications/${applicationId}/jobruns/`, jobRunId);
    const now = Date.now() / 1000;
    const run: EmrServerlessJobRun = { applicationId, jobRunId, arn, name, state: "SUCCESS", executionRole: executionRoleArn ?? "mock-role", jobDriver: jobDriver ?? {}, createdAt: now, updatedAt: now };
    this.jobRuns.set(jobRunId, run);
    return run;
  }

  getJobRun(applicationId: string, jobRunId: string): EmrServerlessJobRun {
    const run = this.jobRuns.get(jobRunId);
    if (!run || run.applicationId !== applicationId) throw new AwsError("ResourceNotFoundException", `Job run ${jobRunId} not found.`, 404);
    return run;
  }

  listJobRuns(applicationId: string): EmrServerlessJobRun[] {
    return this.jobRuns.values().filter((r) => r.applicationId === applicationId);
  }

  cancelJobRun(applicationId: string, jobRunId: string): void {
    const run = this.getJobRun(applicationId, jobRunId);
    run.state = "CANCELLED";
  }

  tagResource(arn: string, tags: Record<string, string>): void {
    const app = this.apps.values().find((a) => a.arn === arn);
    if (app) { Object.assign(app.tags, tags); return; }
    throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const app = this.apps.values().find((a) => a.arn === arn);
    if (app) { for (const k of tagKeys) delete app.tags[k]; return; }
    throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
  }
}
