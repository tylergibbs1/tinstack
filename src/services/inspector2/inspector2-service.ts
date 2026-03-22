import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface AccountStatus {
  accountId: string;
  ec2: string;
  ecr: string;
  lambda: string;
  lambdaCode: string;
}

export interface Inspector2Filter {
  arn: string;
  name: string;
  action: string;
  description: string;
  filterCriteria: Record<string, any>;
  createdAt: number;
  ownerId: string;
}

export interface Inspector2Finding {
  findingArn: string;
  awsAccountId: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  firstObservedAt: string;
  lastObservedAt: string;
}

export class Inspector2Service {
  private accountStatus: AccountStatus | null = null;
  private filters: StorageBackend<string, Inspector2Filter>;
  private findings: StorageBackend<string, Inspector2Finding>;
  private resourceTags: StorageBackend<string, Record<string, string>>;
  private orgConfig: {
    ec2: boolean;
    ecr: boolean;
    lambda: boolean;
    lambdaCode: boolean;
  };

  constructor(private accountId: string) {
    this.filters = new InMemoryStorage();
    this.findings = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();
    this.orgConfig = { ec2: false, ecr: false, lambda: false, lambdaCode: false };
  }

  enable(
    resourceTypes: string[],
    region: string,
  ): AccountStatus {
    if (!this.accountStatus) {
      this.accountStatus = {
        accountId: this.accountId,
        ec2: "DISABLED",
        ecr: "DISABLED",
        lambda: "DISABLED",
        lambdaCode: "DISABLED",
      };
    }

    for (const rt of resourceTypes) {
      switch (rt) {
        case "EC2": this.accountStatus.ec2 = "ENABLED"; break;
        case "ECR": this.accountStatus.ecr = "ENABLED"; break;
        case "LAMBDA": this.accountStatus.lambda = "ENABLED"; break;
        case "LAMBDA_CODE": this.accountStatus.lambdaCode = "ENABLED"; break;
      }
    }

    return this.accountStatus;
  }

  disable(resourceTypes: string[]): AccountStatus {
    if (!this.accountStatus) {
      throw new AwsError("ResourceNotFoundException", "Inspector2 is not enabled.", 404);
    }

    for (const rt of resourceTypes) {
      switch (rt) {
        case "EC2": this.accountStatus.ec2 = "DISABLED"; break;
        case "ECR": this.accountStatus.ecr = "DISABLED"; break;
        case "LAMBDA": this.accountStatus.lambda = "DISABLED"; break;
        case "LAMBDA_CODE": this.accountStatus.lambdaCode = "DISABLED"; break;
      }
    }

    return this.accountStatus;
  }

  batchGetAccountStatus(): AccountStatus[] {
    if (!this.accountStatus) {
      return [{
        accountId: this.accountId,
        ec2: "DISABLED",
        ecr: "DISABLED",
        lambda: "DISABLED",
        lambdaCode: "DISABLED",
      }];
    }
    return [this.accountStatus];
  }

  // --- Findings ---

  listFindings(): Inspector2Finding[] {
    return this.findings.values();
  }

  // --- Filters ---

  createFilter(
    name: string,
    action: string,
    description: string | undefined,
    filterCriteria: Record<string, any> | undefined,
    tags: Record<string, string> | undefined,
    region: string,
  ): string {
    const filterId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const arn = `arn:aws:inspector2:${region}:${this.accountId}:owner/${this.accountId}/filter/${filterId}`;

    const filter: Inspector2Filter = {
      arn,
      name,
      action: action ?? "NONE",
      description: description ?? "",
      filterCriteria: filterCriteria ?? {},
      createdAt: Date.now() / 1000,
      ownerId: this.accountId,
    };
    this.filters.set(arn, filter);
    if (tags && Object.keys(tags).length > 0) {
      this.resourceTags.set(arn, tags);
    }
    return arn;
  }

  listFilters(): Inspector2Filter[] {
    return this.filters.values();
  }

  deleteFilter(arn: string): void {
    if (!this.filters.has(arn)) {
      throw new AwsError("ResourceNotFoundException", `Filter ${arn} not found.`, 404);
    }
    this.filters.delete(arn);
  }

  updateFilter(
    arn: string,
    name: string | undefined,
    action: string | undefined,
    description: string | undefined,
    filterCriteria: Record<string, any> | undefined,
  ): string {
    const filter = this.filters.get(arn);
    if (!filter) {
      throw new AwsError("ResourceNotFoundException", `Filter ${arn} not found.`, 404);
    }
    if (name !== undefined) filter.name = name;
    if (action !== undefined) filter.action = action;
    if (description !== undefined) filter.description = description;
    if (filterCriteria !== undefined) filter.filterCriteria = filterCriteria;
    return arn;
  }

  // --- Coverage ---

  listCoverage(): any[] {
    if (!this.accountStatus) return [];
    const covered: any[] = [];
    if (this.accountStatus.ec2 === "ENABLED") {
      covered.push({ accountId: this.accountId, resourceType: "AWS_EC2_INSTANCE", scanStatus: { statusCode: "ACTIVE" } });
    }
    if (this.accountStatus.ecr === "ENABLED") {
      covered.push({ accountId: this.accountId, resourceType: "AWS_ECR_REPOSITORY", scanStatus: { statusCode: "ACTIVE" } });
    }
    if (this.accountStatus.lambda === "ENABLED") {
      covered.push({ accountId: this.accountId, resourceType: "AWS_LAMBDA_FUNCTION", scanStatus: { statusCode: "ACTIVE" } });
    }
    return covered;
  }

  // --- Organization Config ---

  describeOrganizationConfiguration(): Record<string, any> {
    return {
      autoEnable: {
        ec2: this.orgConfig.ec2,
        ecr: this.orgConfig.ecr,
        lambda: this.orgConfig.lambda,
        lambdaCode: this.orgConfig.lambdaCode,
      },
    };
  }

  // --- Tags ---

  tagResource(resourceArn: string, tags: Record<string, string>): void {
    const existing = this.resourceTags.get(resourceArn) ?? {};
    this.resourceTags.set(resourceArn, { ...existing, ...tags });
  }

  untagResource(resourceArn: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(resourceArn) ?? {};
    for (const key of tagKeys) {
      delete existing[key];
    }
    this.resourceTags.set(resourceArn, existing);
  }
}
