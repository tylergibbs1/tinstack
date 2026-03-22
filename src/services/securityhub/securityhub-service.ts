import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface SecurityHubFinding {
  id: string;
  data: Record<string, any>;
}

export interface SecurityHubInsight {
  insightArn: string;
  name: string;
  filters: Record<string, any>;
  groupByAttribute: string;
}

export interface SecurityHubStandard {
  standardsArn: string;
  standardsSubscriptionArn: string;
  standardsStatus: string;
}

export class SecurityHubService {
  private enabled: boolean = false;
  private enabledAt: string | null = null;
  private hubTags: Record<string, string> = {};
  private findings: StorageBackend<string, SecurityHubFinding>;
  private insights: StorageBackend<string, SecurityHubInsight>;
  private standards: StorageBackend<string, SecurityHubStandard>;
  private resourceTags: StorageBackend<string, Record<string, string>>;

  constructor(private accountId: string) {
    this.findings = new InMemoryStorage();
    this.insights = new InMemoryStorage();
    this.standards = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();
  }

  enableSecurityHub(
    enableDefaultStandards: boolean | undefined,
    tags: Record<string, string> | undefined,
    region: string,
  ): void {
    if (this.enabled) return;
    this.enabled = true;
    this.enabledAt = new Date().toISOString();
    this.hubTags = tags ?? {};

    if (enableDefaultStandards !== false) {
      // Enable default standards
      const defaultArn = `arn:aws:securityhub:${region}:${this.accountId}:hub/default`;
      const stdArn = `arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0`;
      const subArn = `arn:aws:securityhub:${region}:${this.accountId}:subscription/cis-aws-foundations-benchmark/v/1.2.0`;
      this.standards.set(subArn, {
        standardsArn: stdArn,
        standardsSubscriptionArn: subArn,
        standardsStatus: "READY",
      });
    }
  }

  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new AwsError("InvalidAccessException", "Account is not subscribed to AWS Security Hub.", 403);
    }
  }

  describeHub(region: string): Record<string, any> {
    this.ensureEnabled();
    return {
      HubArn: `arn:aws:securityhub:${region}:${this.accountId}:hub/default`,
      SubscribedAt: this.enabledAt,
      AutoEnableControls: true,
      ControlFindingGenerator: "SECURITY_CONTROL",
      Tags: this.hubTags,
    };
  }

  // --- Standards ---

  getEnabledStandards(): SecurityHubStandard[] {
    this.ensureEnabled();
    return this.standards.values();
  }

  batchEnableStandards(
    standardsSubscriptionRequests: { StandardsArn: string }[],
    region: string,
  ): SecurityHubStandard[] {
    this.ensureEnabled();
    const results: SecurityHubStandard[] = [];
    for (const req of standardsSubscriptionRequests) {
      const subArn = `arn:aws:securityhub:${region}:${this.accountId}:subscription/${req.StandardsArn.split(":::")[1] ?? req.StandardsArn}`;
      const std: SecurityHubStandard = {
        standardsArn: req.StandardsArn,
        standardsSubscriptionArn: subArn,
        standardsStatus: "READY",
      };
      this.standards.set(subArn, std);
      results.push(std);
    }
    return results;
  }

  batchDisableStandards(standardsSubscriptionArns: string[]): SecurityHubStandard[] {
    this.ensureEnabled();
    const results: SecurityHubStandard[] = [];
    for (const arn of standardsSubscriptionArns) {
      const std = this.standards.get(arn);
      if (std) {
        std.standardsStatus = "INCOMPLETE";
        results.push(std);
        this.standards.delete(arn);
      }
    }
    return results;
  }

  // --- Findings ---

  getFindings(): Record<string, any>[] {
    this.ensureEnabled();
    return this.findings.values().map((f) => f.data);
  }

  batchImportFindings(
    findingsInput: Record<string, any>[],
  ): { failedCount: number; successCount: number; failedFindings: any[] } {
    this.ensureEnabled();
    let failedCount = 0;
    let successCount = 0;
    const failedFindings: any[] = [];

    for (const findingData of findingsInput) {
      const findingId = findingData.Id;
      if (!findingId) {
        failedCount++;
        failedFindings.push({ Id: "", ErrorCode: "InvalidInput", ErrorMessage: "Finding must have an Id" });
        continue;
      }

      const existing = this.findings.get(findingId);
      if (existing) {
        existing.data = { ...existing.data, ...findingData };
      } else {
        this.findings.set(findingId, { id: findingId, data: findingData });
      }
      successCount++;
    }

    return { failedCount, successCount, failedFindings };
  }

  batchUpdateFindings(
    findingIdentifiers: { Id: string; ProductArn: string }[],
    note: any | undefined,
    severity: any | undefined,
    workflow: any | undefined,
  ): { processedFindings: any[]; unprocessedFindings: any[] } {
    this.ensureEnabled();
    const processed: any[] = [];
    const unprocessed: any[] = [];

    for (const identifier of findingIdentifiers) {
      const finding = this.findings.get(identifier.Id);
      if (!finding) {
        unprocessed.push({ FindingIdentifier: identifier, ErrorCode: "FindingNotFound", ErrorMessage: "Finding not found" });
        continue;
      }
      if (note) finding.data.Note = note;
      if (severity) finding.data.Severity = severity;
      if (workflow) finding.data.Workflow = workflow;
      processed.push(identifier);
    }

    return { processedFindings: processed, unprocessedFindings: unprocessed };
  }

  // --- Insights ---

  createInsight(
    name: string,
    filters: Record<string, any>,
    groupByAttribute: string,
    region: string,
  ): string {
    this.ensureEnabled();
    const insightArn = `arn:aws:securityhub:${region}:${this.accountId}:insight/custom/${crypto.randomUUID()}`;
    const insight: SecurityHubInsight = {
      insightArn,
      name,
      filters: filters ?? {},
      groupByAttribute,
    };
    this.insights.set(insightArn, insight);
    return insightArn;
  }

  getInsights(insightArns?: string[]): SecurityHubInsight[] {
    this.ensureEnabled();
    const all = this.insights.values();
    if (insightArns && insightArns.length > 0) {
      return all.filter((i) => insightArns.includes(i.insightArn));
    }
    return all;
  }

  deleteInsight(insightArn: string): string {
    this.ensureEnabled();
    if (!this.insights.has(insightArn)) {
      throw new AwsError("ResourceNotFoundException", `Insight ${insightArn} not found.`, 404);
    }
    this.insights.delete(insightArn);
    return insightArn;
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
