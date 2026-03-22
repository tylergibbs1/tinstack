import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface Origin {
  Id: string;
  DomainName: string;
  S3OriginConfig?: { OriginAccessIdentity: string };
  CustomOriginConfig?: { HTTPPort: number; HTTPSPort: number; OriginProtocolPolicy: string };
}

export interface DefaultCacheBehavior {
  TargetOriginId: string;
  ViewerProtocolPolicy: string;
  AllowedMethods?: string[];
  CachedMethods?: string[];
  ForwardedValues?: any;
}

export interface DistributionConfig {
  CallerReference: string;
  Comment: string;
  Enabled: boolean;
  Origins: Origin[];
  DefaultCacheBehavior: DefaultCacheBehavior;
  DefaultRootObject?: string;
  PriceClass?: string;
}

export interface Distribution {
  Id: string;
  ARN: string;
  Status: string;
  DomainName: string;
  LastModifiedTime: string;
  DistributionConfig: DistributionConfig;
  ETag: string;
}

export interface Invalidation {
  Id: string;
  Status: string;
  CreateTime: string;
  CallerReference: string;
  Paths: string[];
}

export class CloudFrontService {
  private distributions: StorageBackend<string, Distribution>;
  private invalidations: StorageBackend<string, Invalidation[]>; // distributionId -> invalidations

  constructor(private accountId: string) {
    this.distributions = new InMemoryStorage();
    this.invalidations = new InMemoryStorage();
  }

  private generateId(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "E";
    for (let i = 0; i < 13; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  private generateDomainName(id: string): string {
    return `${id.toLowerCase()}.cloudfront.net`;
  }

  createDistribution(config: DistributionConfig): Distribution {
    // Check for duplicate CallerReference
    for (const dist of this.distributions.values()) {
      if (dist.DistributionConfig.CallerReference === config.CallerReference) {
        throw new AwsError(
          "DistributionAlreadyExists",
          `A distribution with caller reference ${config.CallerReference} already exists.`,
          409,
        );
      }
    }

    const id = this.generateId();
    const now = new Date().toISOString();
    const etag = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();

    const distribution: Distribution = {
      Id: id,
      ARN: `arn:aws:cloudfront::${this.accountId}:distribution/${id}`,
      Status: "Deployed",
      DomainName: this.generateDomainName(id),
      LastModifiedTime: now,
      DistributionConfig: config,
      ETag: etag,
    };

    this.distributions.set(id, distribution);
    this.invalidations.set(id, []);
    return distribution;
  }

  getDistribution(id: string): Distribution {
    const dist = this.distributions.get(id);
    if (!dist) {
      throw new AwsError("NoSuchDistribution", `The specified distribution does not exist. ID: ${id}`, 404);
    }
    return dist;
  }

  listDistributions(): Distribution[] {
    return this.distributions.values();
  }

  updateDistribution(id: string, config: DistributionConfig, ifMatch?: string): Distribution {
    const existing = this.getDistribution(id);

    if (ifMatch && ifMatch !== existing.ETag) {
      throw new AwsError("InvalidIfMatchVersion", "The If-Match version is missing or not valid for the resource.", 412);
    }

    const etag = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
    const updated: Distribution = {
      ...existing,
      DistributionConfig: config,
      LastModifiedTime: new Date().toISOString(),
      ETag: etag,
    };

    this.distributions.set(id, updated);
    return updated;
  }

  deleteDistribution(id: string, ifMatch?: string): void {
    const existing = this.getDistribution(id);

    if (ifMatch && ifMatch !== existing.ETag) {
      throw new AwsError("InvalidIfMatchVersion", "The If-Match version is missing or not valid for the resource.", 412);
    }

    if (existing.DistributionConfig.Enabled) {
      throw new AwsError("DistributionNotDisabled", "The distribution must be disabled before it can be deleted.", 409);
    }

    this.distributions.delete(id);
    this.invalidations.delete(id);
  }

  createInvalidation(distributionId: string, callerReference: string, paths: string[]): Invalidation {
    this.getDistribution(distributionId); // ensure distribution exists

    const invalidation: Invalidation = {
      Id: crypto.randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase(),
      Status: "Completed",
      CreateTime: new Date().toISOString(),
      CallerReference: callerReference,
      Paths: paths,
    };

    const existing = this.invalidations.get(distributionId) ?? [];
    existing.push(invalidation);
    this.invalidations.set(distributionId, existing);
    return invalidation;
  }

  getInvalidation(distributionId: string, invalidationId: string): Invalidation {
    this.getDistribution(distributionId); // ensure distribution exists

    const invList = this.invalidations.get(distributionId) ?? [];
    const inv = invList.find((i) => i.Id === invalidationId);
    if (!inv) {
      throw new AwsError("NoSuchInvalidation", `The specified invalidation does not exist. ID: ${invalidationId}`, 404);
    }
    return inv;
  }

  listInvalidations(distributionId: string): Invalidation[] {
    this.getDistribution(distributionId); // ensure distribution exists
    return this.invalidations.get(distributionId) ?? [];
  }
}
