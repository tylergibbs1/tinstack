import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface ComputeEnvironment {
  computeEnvironmentName: string;
  computeEnvironmentArn: string;
  type: string;
  state: string;
  status: string;
  computeResources: Record<string, any>;
  serviceRole?: string;
  tags: Record<string, string>;
  createdAt: number;
}

export interface JobQueue {
  jobQueueName: string;
  jobQueueArn: string;
  state: string;
  status: string;
  priority: number;
  computeEnvironmentOrder: { order: number; computeEnvironment: string }[];
  tags: Record<string, string>;
  createdAt: number;
}

export interface JobDefinition {
  jobDefinitionName: string;
  jobDefinitionArn: string;
  revision: number;
  type: string;
  status: string;
  containerProperties?: Record<string, any>;
  parameters?: Record<string, string>;
  tags: Record<string, string>;
  createdAt: number;
}

export interface BatchJob {
  jobId: string;
  jobName: string;
  jobArn: string;
  jobQueue: string;
  jobDefinition: string;
  status: string;
  statusReason?: string;
  container?: Record<string, any>;
  parameters?: Record<string, string>;
  tags: Record<string, string>;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
}

export class BatchService {
  private computeEnvironments: StorageBackend<string, ComputeEnvironment>;
  private jobQueues: StorageBackend<string, JobQueue>;
  private jobDefinitions: StorageBackend<string, JobDefinition>;
  private jobDefRevisions = new Map<string, number>();
  private jobs: StorageBackend<string, BatchJob>;
  private tags = new Map<string, Record<string, string>>();

  constructor(
    private accountId: string,
  ) {
    this.computeEnvironments = new InMemoryStorage();
    this.jobQueues = new InMemoryStorage();
    this.jobDefinitions = new InMemoryStorage();
    this.jobs = new InMemoryStorage();
  }

  createComputeEnvironment(
    name: string,
    type: string,
    state: string,
    computeResources: Record<string, any>,
    serviceRole: string | undefined,
    region: string,
    tags?: Record<string, string>,
  ): ComputeEnvironment {
    if (this.computeEnvironments.get(name)) {
      throw new AwsError("ClientException", `Compute environment ${name} already exists.`, 409);
    }
    const arn = buildArn("batch", region, this.accountId, "compute-environment/", name);
    const ce: ComputeEnvironment = {
      computeEnvironmentName: name,
      computeEnvironmentArn: arn,
      type: type ?? "MANAGED",
      state: state ?? "ENABLED",
      status: "VALID",
      computeResources: computeResources ?? {},
      serviceRole,
      tags: tags ?? {},
      createdAt: Date.now(),
    };
    this.computeEnvironments.set(name, ce);
    if (Object.keys(ce.tags).length > 0) this.tags.set(arn, ce.tags);
    return ce;
  }

  describeComputeEnvironments(names?: string[]): ComputeEnvironment[] {
    if (!names || names.length === 0) return this.computeEnvironments.values();
    return names.map((n) => {
      const name = n.includes("/") ? n.split("/").pop()! : n;
      const ce = this.computeEnvironments.get(name);
      if (!ce) throw new AwsError("ClientException", `Compute environment ${n} not found.`, 404);
      return ce;
    });
  }

  updateComputeEnvironment(name: string, state?: string, computeResources?: Record<string, any>, serviceRole?: string): ComputeEnvironment {
    const ce = this.computeEnvironments.get(name);
    if (!ce) throw new AwsError("ClientException", `Compute environment ${name} not found.`, 404);
    if (state) ce.state = state;
    if (computeResources) ce.computeResources = { ...ce.computeResources, ...computeResources };
    if (serviceRole) ce.serviceRole = serviceRole;
    this.computeEnvironments.set(name, ce);
    return ce;
  }

  deleteComputeEnvironment(name: string): void {
    const key = name.includes("/") ? name.split("/").pop()! : name;
    if (!this.computeEnvironments.get(key)) {
      throw new AwsError("ClientException", `Compute environment ${name} not found.`, 404);
    }
    this.computeEnvironments.delete(key);
  }

  createJobQueue(
    name: string,
    state: string,
    priority: number,
    computeEnvironmentOrder: { order: number; computeEnvironment: string }[],
    region: string,
    tags?: Record<string, string>,
  ): JobQueue {
    if (this.jobQueues.get(name)) {
      throw new AwsError("ClientException", `Job queue ${name} already exists.`, 409);
    }
    const arn = buildArn("batch", region, this.accountId, "job-queue/", name);
    const jq: JobQueue = {
      jobQueueName: name,
      jobQueueArn: arn,
      state: state ?? "ENABLED",
      status: "VALID",
      priority: priority ?? 1,
      computeEnvironmentOrder: computeEnvironmentOrder ?? [],
      tags: tags ?? {},
      createdAt: Date.now(),
    };
    this.jobQueues.set(name, jq);
    if (Object.keys(jq.tags).length > 0) this.tags.set(arn, jq.tags);
    return jq;
  }

  describeJobQueues(names?: string[]): JobQueue[] {
    if (!names || names.length === 0) return this.jobQueues.values();
    return names.map((n) => {
      const name = n.includes("/") ? n.split("/").pop()! : n;
      const jq = this.jobQueues.get(name);
      if (!jq) throw new AwsError("ClientException", `Job queue ${n} not found.`, 404);
      return jq;
    });
  }

  updateJobQueue(name: string, state?: string, priority?: number, computeEnvironmentOrder?: any[]): JobQueue {
    const jq = this.jobQueues.get(name);
    if (!jq) throw new AwsError("ClientException", `Job queue ${name} not found.`, 404);
    if (state) jq.state = state;
    if (priority !== undefined) jq.priority = priority;
    if (computeEnvironmentOrder) jq.computeEnvironmentOrder = computeEnvironmentOrder;
    this.jobQueues.set(name, jq);
    return jq;
  }

  deleteJobQueue(name: string): void {
    const key = name.includes("/") ? name.split("/").pop()! : name;
    if (!this.jobQueues.get(key)) {
      throw new AwsError("ClientException", `Job queue ${name} not found.`, 404);
    }
    this.jobQueues.delete(key);
  }

  registerJobDefinition(
    name: string,
    type: string,
    containerProperties?: Record<string, any>,
    parameters?: Record<string, string>,
    region?: string,
    tags?: Record<string, string>,
  ): JobDefinition {
    const revision = (this.jobDefRevisions.get(name) ?? 0) + 1;
    this.jobDefRevisions.set(name, revision);
    const arn = buildArn("batch", region ?? "us-east-1", this.accountId, "job-definition/", `${name}:${revision}`);
    const jd: JobDefinition = {
      jobDefinitionName: name,
      jobDefinitionArn: arn,
      revision,
      type: type ?? "container",
      status: "ACTIVE",
      containerProperties,
      parameters,
      tags: tags ?? {},
      createdAt: Date.now(),
    };
    this.jobDefinitions.set(`${name}:${revision}`, jd);
    if (Object.keys(jd.tags).length > 0) this.tags.set(arn, jd.tags);
    return jd;
  }

  describeJobDefinitions(names?: string[], status?: string): JobDefinition[] {
    let defs = this.jobDefinitions.values();
    if (names && names.length > 0) {
      defs = defs.filter((d) =>
        names.includes(d.jobDefinitionName) ||
        names.includes(d.jobDefinitionArn) ||
        names.includes(`${d.jobDefinitionName}:${d.revision}`),
      );
    }
    if (status) defs = defs.filter((d) => d.status === status);
    return defs;
  }

  deregisterJobDefinition(arn: string): void {
    const jd = this.jobDefinitions.values().find((d) => d.jobDefinitionArn === arn);
    if (!jd) throw new AwsError("ClientException", `Job definition ${arn} not found.`, 404);
    jd.status = "INACTIVE";
    this.jobDefinitions.set(`${jd.jobDefinitionName}:${jd.revision}`, jd);
  }

  submitJob(
    jobName: string,
    jobQueue: string,
    jobDefinition: string,
    parameters?: Record<string, string>,
    containerOverrides?: Record<string, any>,
    region?: string,
    tags?: Record<string, string>,
  ): BatchJob {
    const jobId = crypto.randomUUID();
    const arn = buildArn("batch", region ?? "us-east-1", this.accountId, "job/", jobId);
    const job: BatchJob = {
      jobId,
      jobName,
      jobArn: arn,
      jobQueue,
      jobDefinition,
      status: "SUBMITTED",
      container: containerOverrides,
      parameters,
      tags: tags ?? {},
      createdAt: Date.now(),
    };
    this.jobs.set(jobId, job);
    // Simulate quick transition to SUCCEEDED
    setTimeout(() => {
      const j = this.jobs.get(jobId);
      if (j && j.status === "SUBMITTED") {
        j.status = "SUCCEEDED";
        j.startedAt = Date.now();
        j.stoppedAt = Date.now();
        this.jobs.set(jobId, j);
      }
    }, 10);
    if (Object.keys(job.tags).length > 0) this.tags.set(arn, job.tags);
    return job;
  }

  describeJobs(jobIds: string[]): BatchJob[] {
    return jobIds.map((id) => {
      const job = this.jobs.get(id);
      if (!job) throw new AwsError("ClientException", `Job ${id} not found.`, 404);
      return job;
    });
  }

  listJobs(jobQueue: string, status?: string): BatchJob[] {
    let jobs = this.jobs.values().filter((j) =>
      j.jobQueue === jobQueue || j.jobQueue.endsWith(`/${jobQueue}`),
    );
    if (status) jobs = jobs.filter((j) => j.status === status);
    return jobs;
  }

  terminateJob(jobId: string, reason: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new AwsError("ClientException", `Job ${jobId} not found.`, 404);
    job.status = "FAILED";
    job.statusReason = reason;
    job.stoppedAt = Date.now();
    this.jobs.set(jobId, job);
  }

  cancelJob(jobId: string, reason: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new AwsError("ClientException", `Job ${jobId} not found.`, 404);
    if (job.status !== "SUBMITTED" && job.status !== "PENDING" && job.status !== "RUNNABLE") {
      throw new AwsError("ClientException", `Job ${jobId} cannot be cancelled in status ${job.status}.`, 400);
    }
    job.status = "FAILED";
    job.statusReason = reason;
    job.stoppedAt = Date.now();
    this.jobs.set(jobId, job);
  }

  tagResource(arn: string, newTags: Record<string, string>): void {
    const existing = this.tags.get(arn) ?? {};
    this.tags.set(arn, { ...existing, ...newTags });
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.tags.get(arn);
    if (!existing) return;
    for (const k of tagKeys) delete existing[k];
    this.tags.set(arn, existing);
  }

  listTagsForResource(arn: string): Record<string, string> {
    return this.tags.get(arn) ?? {};
  }
}
