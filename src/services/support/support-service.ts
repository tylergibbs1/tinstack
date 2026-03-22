import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface SupportCase {
  caseId: string;
  displayId: string;
  subject: string;
  serviceCode: string;
  categoryCode: string;
  severityCode: string;
  status: string;
  submittedBy: string;
  timeCreated: string;
  ccEmailAddresses: string[];
  language: string;
  communications: { body: string; submittedBy: string; timeCreated: string; caseId: string }[];
}

export interface TrustedAdvisorCheck {
  id: string;
  name: string;
  description: string;
  category: string;
  metadata: string[];
}

export class SupportService {
  private cases: StorageBackend<string, SupportCase>;
  private checkStatuses: StorageBackend<string, string>;
  private trustedAdvisorChecks: TrustedAdvisorCheck[];

  constructor(private accountId: string) {
    this.cases = new InMemoryStorage();
    this.checkStatuses = new InMemoryStorage();

    // Pre-populate some Trusted Advisor checks
    this.trustedAdvisorChecks = [
      {
        id: "1iG5NDGVre",
        name: "Security Groups - Specific Ports Unrestricted",
        description: "Checks security groups for rules that allow unrestricted access to specific ports.",
        category: "security",
        metadata: ["Region", "Security Group Name", "Security Group ID", "Protocol", "Port", "Status", "IP Address"],
      },
      {
        id: "HCP4007jGY",
        name: "S3 Bucket Permissions",
        description: "Checks S3 buckets that have open access permissions.",
        category: "security",
        metadata: ["Region", "Bucket Name", "ACL Allows List", "ACL Allows Upload/Delete", "Status"],
      },
      {
        id: "Qch7DwouX1",
        name: "Low Utilization Amazon EC2 Instances",
        description: "Checks for EC2 instances that had low utilization for the past 14 days.",
        category: "cost_optimizing",
        metadata: ["Region", "Instance ID", "Instance Name", "Instance Type", "Estimated Monthly Savings", "Day 1-14 CPU"],
      },
      {
        id: "Ti39halfu8",
        name: "Amazon RDS Idle DB Instances",
        description: "Checks for RDS DB instances that appear idle.",
        category: "cost_optimizing",
        metadata: ["Region", "DB Instance Name", "Multi-AZ", "Instance Type", "Storage (GB)", "Days Since Last Connection"],
      },
      {
        id: "R365s2Qddf",
        name: "IAM Use",
        description: "Checks for your use of IAM.",
        category: "security",
        metadata: [],
      },
    ];
  }

  describeServices(): Record<string, any>[] {
    return [
      {
        code: "amazon-ec2",
        name: "Amazon Elastic Compute Cloud (Amazon EC2)",
        categories: [
          { code: "general-guidance", name: "General Guidance" },
          { code: "performance", name: "Performance" },
        ],
      },
      {
        code: "amazon-s3",
        name: "Amazon Simple Storage Service (Amazon S3)",
        categories: [
          { code: "general-guidance", name: "General Guidance" },
        ],
      },
      {
        code: "amazon-rds",
        name: "Amazon Relational Database Service (Amazon RDS)",
        categories: [
          { code: "general-guidance", name: "General Guidance" },
        ],
      },
    ];
  }

  describeSeverityLevels(): { code: string; name: string }[] {
    return [
      { code: "low", name: "Low" },
      { code: "normal", name: "Normal" },
      { code: "high", name: "High" },
      { code: "urgent", name: "Urgent" },
      { code: "critical", name: "Critical" },
    ];
  }

  createCase(body: any): string {
    const caseId = `case-${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();

    const supportCase: SupportCase = {
      caseId,
      displayId: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      subject: body.subject ?? "",
      serviceCode: body.serviceCode ?? "general-info",
      categoryCode: body.categoryCode ?? "general-guidance",
      severityCode: body.severityCode ?? "low",
      status: "opened",
      submittedBy: "tinstack@local",
      timeCreated: now,
      ccEmailAddresses: body.ccEmailAddresses ?? [],
      language: body.language ?? "en",
      communications: [],
    };

    if (body.communicationBody) {
      supportCase.communications.push({
        body: body.communicationBody,
        submittedBy: "tinstack@local",
        timeCreated: now,
        caseId,
      });
    }

    this.cases.set(caseId, supportCase);
    return caseId;
  }

  describeCases(caseIdList?: string[], includeResolvedCases?: boolean): Record<string, any>[] {
    let cases = this.cases.values();
    if (caseIdList && caseIdList.length > 0) {
      const idSet = new Set(caseIdList);
      cases = cases.filter((c) => idSet.has(c.caseId));
    }
    if (!includeResolvedCases) {
      cases = cases.filter((c) => c.status !== "resolved");
    }
    return cases.map((c) => ({
      caseId: c.caseId,
      displayId: c.displayId,
      subject: c.subject,
      serviceCode: c.serviceCode,
      categoryCode: c.categoryCode,
      severityCode: c.severityCode,
      status: c.status,
      submittedBy: c.submittedBy,
      timeCreated: c.timeCreated,
      ccEmailAddresses: c.ccEmailAddresses,
      language: c.language,
      recentCommunications: {
        communications: c.communications.slice(-5),
      },
    }));
  }

  resolveCase(caseId: string): { initialCaseStatus: string; finalCaseStatus: string } {
    const supportCase = this.cases.get(caseId);
    if (!supportCase) {
      throw new AwsError("CaseIdNotFound", `Case ${caseId} not found.`, 400);
    }
    const initialStatus = supportCase.status;
    supportCase.status = "resolved";
    this.cases.set(caseId, supportCase);
    return { initialCaseStatus: initialStatus, finalCaseStatus: "resolved" };
  }

  addCommunicationToCase(caseId: string, communicationBody: string): boolean {
    const supportCase = this.cases.get(caseId);
    if (!supportCase) {
      throw new AwsError("CaseIdNotFound", `Case ${caseId} not found.`, 400);
    }
    supportCase.communications.push({
      body: communicationBody,
      submittedBy: "tinstack@local",
      timeCreated: new Date().toISOString(),
      caseId,
    });
    this.cases.set(caseId, supportCase);
    return true;
  }

  describeCommunications(caseId: string): { body: string; submittedBy: string; timeCreated: string; caseId: string }[] {
    const supportCase = this.cases.get(caseId);
    if (!supportCase) {
      throw new AwsError("CaseIdNotFound", `Case ${caseId} not found.`, 400);
    }
    return supportCase.communications;
  }

  describeTrustedAdvisorChecks(): TrustedAdvisorCheck[] {
    return this.trustedAdvisorChecks;
  }

  describeTrustedAdvisorCheckResult(checkId: string): Record<string, any> {
    const check = this.trustedAdvisorChecks.find((c) => c.id === checkId);
    if (!check) {
      throw new AwsError("InvalidParameterValueException", `Check ${checkId} not found.`, 400);
    }
    return {
      result: {
        checkId,
        status: this.checkStatuses.get(checkId) ?? "ok",
        timestamp: new Date().toISOString(),
        categorySpecificSummary: { costOptimizing: { estimatedMonthlySavings: 0, estimatedPercentMonthlySavings: 0 } },
        resourcesSummary: { resourcesProcessed: 0, resourcesFlagged: 0, resourcesIgnored: 0, resourcesSuppressed: 0 },
        flaggedResources: [],
      },
    };
  }

  refreshTrustedAdvisorCheck(checkId: string): Record<string, any> {
    const current = this.checkStatuses.get(checkId) ?? "none";
    let next: string;
    switch (current) {
      case "none": next = "enqueued"; break;
      case "enqueued": next = "processing"; break;
      case "processing": next = "success"; break;
      default: next = "enqueued"; break;
    }
    this.checkStatuses.set(checkId, next);

    return {
      status: {
        checkId,
        status: next,
        millisUntilNextRefreshable: 1000,
      },
    };
  }
}
