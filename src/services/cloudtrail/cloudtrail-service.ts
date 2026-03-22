import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Trail {
  name: string;
  arn: string;
  s3BucketName: string;
  s3KeyPrefix?: string;
  snsTopicArn?: string;
  isMultiRegionTrail: boolean;
  includeGlobalServiceEvents: boolean;
  logFileValidationEnabled: boolean;
  isOrganizationTrail: boolean;
  cloudWatchLogsLogGroupArn?: string;
  cloudWatchLogsRoleArn?: string;
  kmsKeyId?: string;
  homeRegion: string;
}

export interface TrailStatus {
  isLogging: boolean;
  startLoggingTime?: number;
  stopLoggingTime?: number;
  latestDeliveryTime?: number;
}

export interface EventSelector {
  readWriteType: string;
  includeManagementEvents: boolean;
  dataResources: { Type: string; Values: string[] }[];
}

export interface LookupEvent {
  eventId: string;
  eventName: string;
  eventTime: number;
  eventSource: string;
  username: string;
  cloudTrailEvent: string;
}

export class CloudTrailService {
  private trails = new Map<string, Trail>();
  private trailStatuses = new Map<string, TrailStatus>();
  private eventSelectors = new Map<string, EventSelector[]>();
  private trailTags = new Map<string, Record<string, string>>();
  private events: LookupEvent[] = [];

  constructor(private accountId: string) {}

  private trailKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createTrail(params: {
    Name: string;
    S3BucketName: string;
    S3KeyPrefix?: string;
    SnsTopicName?: string;
    IsMultiRegionTrail?: boolean;
    IncludeGlobalServiceEvents?: boolean;
    EnableLogFileValidation?: boolean;
    IsOrganizationTrail?: boolean;
    CloudWatchLogsLogGroupArn?: string;
    CloudWatchLogsRoleArn?: string;
    KmsKeyId?: string;
  }, region: string): Trail {
    const key = this.trailKey(region, params.Name);
    if (this.trails.has(key)) {
      throw new AwsError("TrailAlreadyExistsException", `Trail ${params.Name} already exists.`, 400);
    }

    const trail: Trail = {
      name: params.Name,
      arn: buildArn("cloudtrail", region, this.accountId, "trail/", params.Name),
      s3BucketName: params.S3BucketName,
      s3KeyPrefix: params.S3KeyPrefix,
      snsTopicArn: params.SnsTopicName,
      isMultiRegionTrail: params.IsMultiRegionTrail ?? false,
      includeGlobalServiceEvents: params.IncludeGlobalServiceEvents ?? true,
      logFileValidationEnabled: params.EnableLogFileValidation ?? false,
      isOrganizationTrail: params.IsOrganizationTrail ?? false,
      cloudWatchLogsLogGroupArn: params.CloudWatchLogsLogGroupArn,
      cloudWatchLogsRoleArn: params.CloudWatchLogsRoleArn,
      kmsKeyId: params.KmsKeyId,
      homeRegion: region,
    };

    this.trails.set(key, trail);
    this.trailStatuses.set(key, { isLogging: false });
    this.eventSelectors.set(key, []);
    return trail;
  }

  getTrail(name: string, region: string): Trail {
    return this.findTrail(name, region);
  }

  describeTrails(region: string, trailNameList?: string[], includeShadowTrails?: boolean): Trail[] {
    if (trailNameList && trailNameList.length > 0) {
      return trailNameList.map((n) => this.findTrail(n, region));
    }
    return Array.from(this.trails.values()).filter((t) => t.homeRegion === region || t.isMultiRegionTrail);
  }

  updateTrail(params: {
    Name: string;
    S3BucketName?: string;
    S3KeyPrefix?: string;
    IsMultiRegionTrail?: boolean;
    IncludeGlobalServiceEvents?: boolean;
    EnableLogFileValidation?: boolean;
    CloudWatchLogsLogGroupArn?: string;
    CloudWatchLogsRoleArn?: string;
    KmsKeyId?: string;
  }, region: string): Trail {
    const trail = this.findTrail(params.Name, region);
    if (params.S3BucketName !== undefined) trail.s3BucketName = params.S3BucketName;
    if (params.S3KeyPrefix !== undefined) trail.s3KeyPrefix = params.S3KeyPrefix;
    if (params.IsMultiRegionTrail !== undefined) trail.isMultiRegionTrail = params.IsMultiRegionTrail;
    if (params.IncludeGlobalServiceEvents !== undefined) trail.includeGlobalServiceEvents = params.IncludeGlobalServiceEvents;
    if (params.EnableLogFileValidation !== undefined) trail.logFileValidationEnabled = params.EnableLogFileValidation;
    if (params.CloudWatchLogsLogGroupArn !== undefined) trail.cloudWatchLogsLogGroupArn = params.CloudWatchLogsLogGroupArn;
    if (params.CloudWatchLogsRoleArn !== undefined) trail.cloudWatchLogsRoleArn = params.CloudWatchLogsRoleArn;
    if (params.KmsKeyId !== undefined) trail.kmsKeyId = params.KmsKeyId;
    return trail;
  }

  deleteTrail(name: string, region: string): void {
    const key = this.resolveTrailKey(name, region);
    if (!this.trails.has(key)) {
      throw new AwsError("TrailNotFoundException", `Trail ${name} not found.`, 400);
    }
    this.trails.delete(key);
    this.trailStatuses.delete(key);
    this.eventSelectors.delete(key);
    this.trailTags.delete(key);
  }

  startLogging(name: string, region: string): void {
    const key = this.resolveTrailKey(name, region);
    const status = this.trailStatuses.get(key);
    if (!status) throw new AwsError("TrailNotFoundException", `Trail ${name} not found.`, 400);
    status.isLogging = true;
    status.startLoggingTime = Date.now() / 1000;
    status.latestDeliveryTime = Date.now() / 1000;
  }

  stopLogging(name: string, region: string): void {
    const key = this.resolveTrailKey(name, region);
    const status = this.trailStatuses.get(key);
    if (!status) throw new AwsError("TrailNotFoundException", `Trail ${name} not found.`, 400);
    status.isLogging = false;
    status.stopLoggingTime = Date.now() / 1000;
  }

  getTrailStatus(name: string, region: string): TrailStatus {
    const key = this.resolveTrailKey(name, region);
    const status = this.trailStatuses.get(key);
    if (!status) throw new AwsError("TrailNotFoundException", `Trail ${name} not found.`, 400);
    return status;
  }

  putEventSelectors(name: string, eventSelectors: EventSelector[], region: string): EventSelector[] {
    const key = this.resolveTrailKey(name, region);
    if (!this.trails.has(key)) throw new AwsError("TrailNotFoundException", `Trail ${name} not found.`, 400);
    this.eventSelectors.set(key, eventSelectors);
    return eventSelectors;
  }

  getEventSelectors(name: string, region: string): EventSelector[] {
    const key = this.resolveTrailKey(name, region);
    if (!this.trails.has(key)) throw new AwsError("TrailNotFoundException", `Trail ${name} not found.`, 400);
    return this.eventSelectors.get(key) ?? [];
  }

  lookupEvents(_params: any): LookupEvent[] {
    return this.events;
  }

  listTrails(region: string): { Name: string; TrailARN: string; HomeRegion: string }[] {
    return Array.from(this.trails.values())
      .filter((t) => t.homeRegion === region || t.isMultiRegionTrail)
      .map((t) => ({ Name: t.name, TrailARN: t.arn, HomeRegion: t.homeRegion }));
  }

  addTags(resourceId: string, tagsList: { Key: string; Value: string }[]): void {
    const existing = this.trailTags.get(resourceId) ?? {};
    for (const t of tagsList) existing[t.Key] = t.Value;
    this.trailTags.set(resourceId, existing);
  }

  removeTags(resourceId: string, tagsList: { Key: string }[]): void {
    const existing = this.trailTags.get(resourceId);
    if (existing) {
      for (const t of tagsList) delete existing[t.Key];
    }
  }

  listTags(resourceIdList: string[]): { ResourceId: string; TagsList: { Key: string; Value: string }[] }[] {
    return resourceIdList.map((rid) => {
      const tags = this.trailTags.get(rid) ?? {};
      return {
        ResourceId: rid,
        TagsList: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
      };
    });
  }

  private findTrail(name: string, region: string): Trail {
    const key = this.resolveTrailKey(name, region);
    const trail = this.trails.get(key);
    if (!trail) throw new AwsError("TrailNotFoundException", `Trail ${name} not found.`, 400);
    return trail;
  }

  private resolveTrailKey(nameOrArn: string, region: string): string {
    // If it's an ARN, extract the trail name
    if (nameOrArn.startsWith("arn:")) {
      const parts = nameOrArn.split("/");
      const name = parts[parts.length - 1];
      // Search all trails for matching ARN
      for (const [key, trail] of this.trails) {
        if (trail.arn === nameOrArn || trail.name === name) return key;
      }
      return `${region}#${name}`;
    }
    return this.trailKey(region, nameOrArn);
  }
}
