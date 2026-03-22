import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface TraceSegment {
  id: string;
  traceId: string;
  document: string;
}

export interface TraceSummary {
  Id: string;
  Duration: number;
  ResponseTime: number;
  HasFault: boolean;
  HasError: boolean;
  HasThrottle: boolean;
  Http: { HttpURL?: string; HttpMethod?: string; HttpStatus?: number };
  Annotations: Record<string, { AnnotationValue: { StringValue?: string }; ServiceIds: never[] }[]>;
  Users: never[];
  ServiceIds: never[];
  IsPartial: boolean;
  AvailabilityZones: never[];
  EntryPoint: { Name: string; Type: string } | undefined;
  Revision: number;
}

export interface XRayGroup {
  groupName: string;
  groupArn: string;
  filterExpression: string;
  insightsConfiguration: { InsightsEnabled: boolean; NotificationsEnabled: boolean };
}

export interface SamplingRule {
  ruleName: string;
  ruleArn: string;
  resourceArn: string;
  priority: number;
  fixedRate: number;
  reservoirSize: number;
  serviceName: string;
  serviceType: string;
  host: string;
  httpMethod: string;
  urlPath: string;
  version: number;
  attributes: Record<string, string>;
  tags: { Key: string; Value: string }[];
}

export class XRayService {
  private segments: StorageBackend<string, TraceSegment[]>;
  private groups: StorageBackend<string, XRayGroup>;
  private samplingRules: StorageBackend<string, SamplingRule>;
  private resourceTags: StorageBackend<string, { Key: string; Value: string }[]>;

  constructor(private accountId: string) {
    this.segments = new InMemoryStorage();
    this.groups = new InMemoryStorage();
    this.samplingRules = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();

    // Create default sampling rule
    const defaultRule: SamplingRule = {
      ruleName: "Default",
      ruleArn: `arn:aws:xray:us-east-1:${accountId}:sampling-rule/Default`,
      resourceArn: "*",
      priority: 10000,
      fixedRate: 0.05,
      reservoirSize: 1,
      serviceName: "*",
      serviceType: "*",
      host: "*",
      httpMethod: "*",
      urlPath: "*",
      version: 1,
      attributes: {},
      tags: [],
    };
    this.samplingRules.set("Default", defaultRule);
  }

  putTraceSegments(traceSegmentDocuments: string[]): { UnprocessedTraceSegments: never[] } {
    for (const doc of traceSegmentDocuments) {
      const parsed = JSON.parse(doc);
      const traceId = parsed.trace_id ?? parsed.TraceId ?? `1-${Date.now().toString(16)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const segmentId = parsed.id ?? parsed.Id ?? crypto.randomUUID().replace(/-/g, "").slice(0, 16);

      const segment: TraceSegment = { id: segmentId, traceId, document: doc };
      const existing = this.segments.get(traceId) ?? [];
      existing.push(segment);
      this.segments.set(traceId, existing);
    }
    return { UnprocessedTraceSegments: [] };
  }

  getTraceSummaries(startTime: number, endTime: number): TraceSummary[] {
    const summaries: TraceSummary[] = [];
    for (const segments of this.segments.values()) {
      if (segments.length === 0) continue;
      const traceId = segments[0].traceId;
      summaries.push({
        Id: traceId,
        Duration: 0.1,
        ResponseTime: 0.05,
        HasFault: false,
        HasError: false,
        HasThrottle: false,
        Http: {},
        Annotations: {},
        Users: [],
        ServiceIds: [],
        IsPartial: false,
        AvailabilityZones: [],
        EntryPoint: undefined,
        Revision: 1,
      });
    }
    return summaries;
  }

  batchGetTraces(traceIds: string[]): { Traces: { Id: string; Duration: number; Segments: { Id: string; Document: string }[] }[] } {
    const traces = [];
    for (const traceId of traceIds) {
      const segments = this.segments.get(traceId);
      if (segments) {
        traces.push({
          Id: traceId,
          Duration: 0.1,
          Segments: segments.map((s) => ({ Id: s.id, Document: s.document })),
        });
      }
    }
    return { Traces: traces };
  }

  getServiceGraph(startTime: number, endTime: number): { Services: never[]; StartTime: number; EndTime: number; ContainsOldGroupVersions: boolean } {
    return {
      Services: [],
      StartTime: startTime,
      EndTime: endTime,
      ContainsOldGroupVersions: false,
    };
  }

  createGroup(groupName: string, filterExpression: string | undefined, region: string): XRayGroup {
    if (this.groups.has(groupName)) {
      throw new AwsError("InvalidRequestException", `Group ${groupName} already exists.`, 400);
    }
    const group: XRayGroup = {
      groupName,
      groupArn: buildArn("xray", region, this.accountId, "group/", `${groupName}`),
      filterExpression: filterExpression ?? "",
      insightsConfiguration: { InsightsEnabled: false, NotificationsEnabled: false },
    };
    this.groups.set(groupName, group);
    return group;
  }

  getGroup(groupName: string): XRayGroup {
    const group = this.groups.get(groupName);
    if (!group) throw new AwsError("InvalidRequestException", `Group ${groupName} not found.`, 404);
    return group;
  }

  getGroups(): XRayGroup[] {
    return this.groups.values();
  }

  deleteGroup(groupName: string): void {
    if (!this.groups.has(groupName)) {
      throw new AwsError("InvalidRequestException", `Group ${groupName} not found.`, 404);
    }
    this.groups.delete(groupName);
  }

  createSamplingRule(rule: any, region: string): SamplingRule {
    const name = rule.RuleName;
    if (this.samplingRules.has(name)) {
      throw new AwsError("InvalidRequestException", `Sampling rule ${name} already exists.`, 400);
    }
    const samplingRule: SamplingRule = {
      ruleName: name,
      ruleArn: buildArn("xray", region, this.accountId, "sampling-rule/", name),
      resourceArn: rule.ResourceARN ?? "*",
      priority: rule.Priority ?? 1000,
      fixedRate: rule.FixedRate ?? 0.05,
      reservoirSize: rule.ReservoirSize ?? 1,
      serviceName: rule.ServiceName ?? "*",
      serviceType: rule.ServiceType ?? "*",
      host: rule.Host ?? "*",
      httpMethod: rule.HTTPMethod ?? "*",
      urlPath: rule.URLPath ?? "*",
      version: rule.Version ?? 1,
      attributes: rule.Attributes ?? {},
      tags: [],
    };
    this.samplingRules.set(name, samplingRule);
    return samplingRule;
  }

  getSamplingRules(): SamplingRule[] {
    return this.samplingRules.values();
  }

  updateSamplingRule(ruleUpdate: any): SamplingRule {
    const name = ruleUpdate.RuleName;
    const existing = this.samplingRules.get(name);
    if (!existing) {
      throw new AwsError("InvalidRequestException", `Sampling rule ${name} not found.`, 400);
    }
    const updated: SamplingRule = {
      ...existing,
      resourceArn: ruleUpdate.ResourceARN ?? existing.resourceArn,
      priority: ruleUpdate.Priority ?? existing.priority,
      fixedRate: ruleUpdate.FixedRate ?? existing.fixedRate,
      reservoirSize: ruleUpdate.ReservoirSize ?? existing.reservoirSize,
      serviceName: ruleUpdate.ServiceName ?? existing.serviceName,
      serviceType: ruleUpdate.ServiceType ?? existing.serviceType,
      host: ruleUpdate.Host ?? existing.host,
      httpMethod: ruleUpdate.HTTPMethod ?? existing.httpMethod,
      urlPath: ruleUpdate.URLPath ?? existing.urlPath,
    };
    this.samplingRules.set(name, updated);
    return updated;
  }

  deleteSamplingRule(ruleName: string): void {
    if (!this.samplingRules.has(ruleName)) {
      throw new AwsError("InvalidRequestException", `Sampling rule ${ruleName} not found.`, 400);
    }
    this.samplingRules.delete(ruleName);
  }

  tagResource(arn: string, tags: { Key: string; Value: string }[]): void {
    const existing = this.resourceTags.get(arn) ?? [];
    for (const tag of tags) {
      const idx = existing.findIndex((t) => t.Key === tag.Key);
      if (idx >= 0) existing[idx] = tag;
      else existing.push(tag);
    }
    this.resourceTags.set(arn, existing);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(arn);
    if (existing) {
      const keysToRemove = new Set(tagKeys);
      this.resourceTags.set(arn, existing.filter((t) => !keysToRemove.has(t.Key)));
    }
  }

  listTagsForResource(arn: string): { Key: string; Value: string }[] {
    return this.resourceTags.get(arn) ?? [];
  }

  private samplingRuleToRecord(rule: SamplingRule): Record<string, any> {
    return {
      RuleName: rule.ruleName,
      RuleARN: rule.ruleArn,
      ResourceARN: rule.resourceArn,
      Priority: rule.priority,
      FixedRate: rule.fixedRate,
      ReservoirSize: rule.reservoirSize,
      ServiceName: rule.serviceName,
      ServiceType: rule.serviceType,
      Host: rule.host,
      HTTPMethod: rule.httpMethod,
      URLPath: rule.urlPath,
      Version: rule.version,
      Attributes: rule.attributes,
    };
  }

  formatSamplingRuleRecord(rule: SamplingRule): { SamplingRule: Record<string, any>; CreatedAt: number; ModifiedAt: number } {
    return {
      SamplingRule: this.samplingRuleToRecord(rule),
      CreatedAt: Date.now() / 1000,
      ModifiedAt: Date.now() / 1000,
    };
  }
}
