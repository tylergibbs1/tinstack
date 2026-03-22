import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface MediaConvertJob {
  id: string;
  arn: string;
  role: string;
  settings: any;
  queue: string;
  status: string;
  createdAt: number;
  timing: { submitTime: number; finishTime: number };
  outputGroupDetails: any[];
}

export interface MediaConvertQueue {
  name: string;
  arn: string;
  description: string;
  status: string;
  type: string;
  createdAt: number;
}

export interface MediaConvertPreset {
  name: string;
  arn: string;
  description: string;
  settings: any;
  type: string;
  createdAt: number;
}

export interface MediaConvertJobTemplate {
  name: string;
  arn: string;
  description: string;
  settings: any;
  type: string;
  createdAt: number;
}

export class MediaConvertService {
  private jobs: StorageBackend<string, MediaConvertJob>;
  private queues: StorageBackend<string, MediaConvertQueue>;
  private presets: StorageBackend<string, MediaConvertPreset>;
  private jobTemplates: StorageBackend<string, MediaConvertJobTemplate>;

  constructor(
    private accountId: string,
    private baseUrl: string,
  ) {
    this.jobs = new InMemoryStorage();
    this.queues = new InMemoryStorage();
    this.presets = new InMemoryStorage();
    this.jobTemplates = new InMemoryStorage();

    // Create default queue
    this.queues.set("Default", {
      name: "Default",
      arn: buildArn("mediaconvert", "us-east-1", this.accountId, "queues/", "Default"),
      description: "Default queue",
      status: "ACTIVE",
      type: "SYSTEM",
      createdAt: Math.floor(Date.now() / 1000),
    });
  }

  createJob(role: string, settings: any, region: string, queue?: string): MediaConvertJob {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const nowEpoch = Math.floor(Date.now() / 1000);
    const job: MediaConvertJob = {
      id,
      arn: buildArn("mediaconvert", region, this.accountId, "jobs/", id),
      role,
      settings: settings ?? {},
      queue: queue ?? buildArn("mediaconvert", region, this.accountId, "queues/", "Default"),
      status: "COMPLETE",
      createdAt: nowEpoch,
      timing: { submitTime: nowEpoch, finishTime: nowEpoch },
      outputGroupDetails: [],
    };
    this.jobs.set(id, job);
    return job;
  }

  getJob(id: string): MediaConvertJob {
    const job = this.jobs.get(id);
    if (!job) throw new AwsError("NotFoundException", `Job ${id} not found.`, 404);
    return job;
  }

  listJobs(status?: string, queue?: string): MediaConvertJob[] {
    let jobs = this.jobs.values();
    if (status) jobs = jobs.filter((j) => j.status === status);
    if (queue) jobs = jobs.filter((j) => j.queue === queue);
    return jobs;
  }

  cancelJob(id: string): void {
    const job = this.jobs.get(id);
    if (!job) throw new AwsError("NotFoundException", `Job ${id} not found.`, 404);
    if (job.status === "COMPLETE") {
      throw new AwsError("ConflictException", `Job ${id} is already complete and cannot be canceled.`, 409);
    }
    job.status = "CANCELED";
    this.jobs.set(id, job);
  }

  createQueue(name: string, description: string, region: string): MediaConvertQueue {
    if (this.queues.has(name)) {
      throw new AwsError("ConflictException", `Queue ${name} already exists.`, 409);
    }
    const queue: MediaConvertQueue = {
      name,
      arn: buildArn("mediaconvert", region, this.accountId, "queues/", name),
      description,
      status: "ACTIVE",
      type: "CUSTOM",
      createdAt: Math.floor(Date.now() / 1000),
    };
    this.queues.set(name, queue);
    return queue;
  }

  getQueue(name: string): MediaConvertQueue {
    const queue = this.queues.get(name);
    if (!queue) throw new AwsError("NotFoundException", `Queue ${name} not found.`, 404);
    return queue;
  }

  listQueues(): MediaConvertQueue[] {
    return this.queues.values();
  }

  deleteQueue(name: string): void {
    if (!this.queues.has(name)) {
      throw new AwsError("NotFoundException", `Queue ${name} not found.`, 404);
    }
    this.queues.delete(name);
  }

  createPreset(name: string, settings: any, description: string, region: string): MediaConvertPreset {
    if (this.presets.has(name)) {
      throw new AwsError("ConflictException", `Preset ${name} already exists.`, 409);
    }
    const preset: MediaConvertPreset = {
      name,
      arn: buildArn("mediaconvert", region, this.accountId, "presets/", name),
      description,
      settings: settings ?? {},
      type: "CUSTOM",
      createdAt: Math.floor(Date.now() / 1000),
    };
    this.presets.set(name, preset);
    return preset;
  }

  getPreset(name: string): MediaConvertPreset {
    const preset = this.presets.get(name);
    if (!preset) throw new AwsError("NotFoundException", `Preset ${name} not found.`, 404);
    return preset;
  }

  listPresets(): MediaConvertPreset[] {
    return this.presets.values();
  }

  deletePreset(name: string): void {
    if (!this.presets.has(name)) {
      throw new AwsError("NotFoundException", `Preset ${name} not found.`, 404);
    }
    this.presets.delete(name);
  }

  createJobTemplate(name: string, settings: any, description: string, region: string): MediaConvertJobTemplate {
    if (this.jobTemplates.has(name)) {
      throw new AwsError("ConflictException", `Job template ${name} already exists.`, 409);
    }
    const template: MediaConvertJobTemplate = {
      name,
      arn: buildArn("mediaconvert", region, this.accountId, "jobTemplates/", name),
      description,
      settings: settings ?? {},
      type: "CUSTOM",
      createdAt: Math.floor(Date.now() / 1000),
    };
    this.jobTemplates.set(name, template);
    return template;
  }

  getJobTemplate(name: string): MediaConvertJobTemplate {
    const template = this.jobTemplates.get(name);
    if (!template) throw new AwsError("NotFoundException", `Job template ${name} not found.`, 404);
    return template;
  }

  listJobTemplates(): MediaConvertJobTemplate[] {
    return this.jobTemplates.values();
  }

  deleteJobTemplate(name: string): void {
    if (!this.jobTemplates.has(name)) {
      throw new AwsError("NotFoundException", `Job template ${name} not found.`, 404);
    }
    this.jobTemplates.delete(name);
  }

  describeEndpoints(): { url: string }[] {
    return [{ url: this.baseUrl }];
  }
}
