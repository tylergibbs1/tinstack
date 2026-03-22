import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface MacieSession {
  status: string;
  createdAt: string;
  updatedAt: string;
  serviceRole: string;
  findingPublishingFrequency: string;
}

export interface ClassificationJob {
  jobId: string;
  name: string;
  jobArn: string;
  jobStatus: string;
  jobType: string;
  createdAt: string;
  s3JobDefinition: any;
  tags: Record<string, string>;
}

export interface FindingsFilter {
  id: string;
  arn: string;
  name: string;
  description: string;
  action: string;
  findingCriteria: any;
  tags: Record<string, string>;
}

export class Macie2Service {
  private session: MacieSession | null = null;
  private jobs: StorageBackend<string, ClassificationJob>;
  private filters: StorageBackend<string, FindingsFilter>;

  constructor(private accountId: string) {
    this.jobs = new InMemoryStorage();
    this.filters = new InMemoryStorage();
  }

  enableMacie(findingPublishingFrequency?: string): void {
    if (this.session) throw new AwsError("ConflictException", "Macie is already enabled.", 409);
    this.session = {
      status: "ENABLED", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      serviceRole: `arn:aws:iam::${this.accountId}:role/aws-service-role/macie.amazonaws.com/AWSServiceRoleForAmazonMacie`,
      findingPublishingFrequency: findingPublishingFrequency ?? "FIFTEEN_MINUTES",
    };
  }

  getMacieSession(): MacieSession {
    if (!this.session) throw new AwsError("AccessDeniedException", "Macie is not enabled.", 403);
    return this.session;
  }

  disableMacie(): void {
    if (!this.session) throw new AwsError("AccessDeniedException", "Macie is not enabled.", 403);
    this.session = null;
  }

  createClassificationJob(name: string, jobType: string, s3JobDefinition: any, region: string, tags?: Record<string, string>): ClassificationJob {
    const jobId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const job: ClassificationJob = {
      jobId, name, jobArn: buildArn("macie2", region, this.accountId, "classification-job/", jobId),
      jobStatus: "RUNNING", jobType: jobType ?? "ONE_TIME",
      createdAt: new Date().toISOString(), s3JobDefinition: s3JobDefinition ?? {},
      tags: tags ?? {},
    };
    this.jobs.set(jobId, job);
    return job;
  }

  describeClassificationJob(jobId: string): ClassificationJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new AwsError("ResourceNotFoundException", `Job ${jobId} not found.`, 404);
    return job;
  }

  listClassificationJobs(): ClassificationJob[] { return this.jobs.values(); }

  createFindingsFilter(name: string, action: string, findingCriteria: any, description: string, region: string): FindingsFilter {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const filter: FindingsFilter = {
      id, arn: buildArn("macie2", region, this.accountId, "findings-filter/", id),
      name, description: description ?? "", action: action ?? "ARCHIVE",
      findingCriteria: findingCriteria ?? {}, tags: {},
    };
    this.filters.set(id, filter);
    return filter;
  }

  getFindingsFilter(id: string): FindingsFilter {
    const f = this.filters.get(id);
    if (!f) throw new AwsError("ResourceNotFoundException", `Filter ${id} not found.`, 404);
    return f;
  }

  listFindingsFilters(): FindingsFilter[] { return this.filters.values(); }

  deleteFindingsFilter(id: string): void {
    if (!this.filters.has(id)) throw new AwsError("ResourceNotFoundException", `Filter ${id} not found.`, 404);
    this.filters.delete(id);
  }
}
