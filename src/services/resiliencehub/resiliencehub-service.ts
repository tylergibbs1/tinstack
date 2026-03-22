import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface ResilienceApp {
  appArn: string;
  name: string;
  description: string;
  policyArn: string;
  status: string;
  complianceStatus: string;
  creationTime: string;
  tags: Record<string, string>;
}

export interface ResiliencyPolicy {
  policyArn: string;
  policyName: string;
  policyDescription: string;
  tier: string;
  estimatedCostTier: string;
  policy: Record<string, any>;
  creationTime: string;
  tags: Record<string, string>;
}

export interface AppAssessment {
  assessmentArn: string;
  appArn: string;
  assessmentName: string;
  assessmentStatus: string;
  complianceStatus: string;
  invoker: string;
  startTime: string;
  endTime: string;
}

export class ResilienceHubService {
  private apps: StorageBackend<string, ResilienceApp>;
  private policies: StorageBackend<string, ResiliencyPolicy>;
  private assessments: StorageBackend<string, AppAssessment>;

  constructor(private accountId: string) {
    this.apps = new InMemoryStorage();
    this.policies = new InMemoryStorage();
    this.assessments = new InMemoryStorage();
  }

  createApp(name: string, region: string, description?: string, policyArn?: string, tags?: Record<string, string>): ResilienceApp {
    const arn = buildArn("resiliencehub", region, this.accountId, "app/", crypto.randomUUID().slice(0, 12));
    const app: ResilienceApp = {
      appArn: arn, name, description: description ?? "", policyArn: policyArn ?? "",
      status: "Active", complianceStatus: "NotAssessed",
      creationTime: Math.floor(Date.now() / 1000), tags: tags ?? {},
    };
    this.apps.set(arn, app);
    return app;
  }

  describeApp(appArn: string): ResilienceApp {
    const app = this.apps.get(appArn);
    if (!app) throw new AwsError("ResourceNotFoundException", `App ${appArn} not found.`, 404);
    return app;
  }

  listApps(): ResilienceApp[] { return this.apps.values(); }

  deleteApp(appArn: string): void {
    if (!this.apps.has(appArn)) throw new AwsError("ResourceNotFoundException", `App ${appArn} not found.`, 404);
    this.apps.delete(appArn);
  }

  createResiliencyPolicy(name: string, tier: string, policy: Record<string, any>, region: string, description?: string): ResiliencyPolicy {
    const arn = buildArn("resiliencehub", region, this.accountId, "resiliency-policy/", crypto.randomUUID().slice(0, 12));
    const p: ResiliencyPolicy = {
      policyArn: arn, policyName: name, policyDescription: description ?? "",
      tier: tier ?? "NonCritical", estimatedCostTier: "Low",
      policy: policy ?? {}, creationTime: Math.floor(Date.now() / 1000), tags: {},
    };
    this.policies.set(arn, p);
    return p;
  }

  describeResiliencyPolicy(policyArn: string): ResiliencyPolicy {
    const p = this.policies.get(policyArn);
    if (!p) throw new AwsError("ResourceNotFoundException", `Policy ${policyArn} not found.`, 404);
    return p;
  }

  listResiliencyPolicies(): ResiliencyPolicy[] { return this.policies.values(); }

  deleteResiliencyPolicy(policyArn: string): void {
    if (!this.policies.has(policyArn)) throw new AwsError("ResourceNotFoundException", `Policy ${policyArn} not found.`, 404);
    this.policies.delete(policyArn);
  }

  importResourcesToDraftAppVersion(appArn: string, _sourceArns: string[]): { appArn: string; appVersion: string; status: string } {
    if (!this.apps.has(appArn)) throw new AwsError("ResourceNotFoundException", `App ${appArn} not found.`, 404);
    return { appArn, appVersion: "draft", status: "Pending" };
  }

  startAppAssessment(appArn: string, assessmentName: string, region: string): AppAssessment {
    if (!this.apps.has(appArn)) throw new AwsError("ResourceNotFoundException", `App ${appArn} not found.`, 404);
    const arn = buildArn("resiliencehub", region, this.accountId, "app-assessment/", crypto.randomUUID().slice(0, 12));
    const assessment: AppAssessment = {
      assessmentArn: arn, appArn, assessmentName, assessmentStatus: "Success",
      complianceStatus: "PolicyMet", invoker: "User",
      startTime: Math.floor(Date.now() / 1000), endTime: Math.floor(Date.now() / 1000),
    };
    this.assessments.set(arn, assessment);
    return assessment;
  }

  describeAppAssessment(assessmentArn: string): AppAssessment {
    const a = this.assessments.get(assessmentArn);
    if (!a) throw new AwsError("ResourceNotFoundException", `Assessment ${assessmentArn} not found.`, 404);
    return a;
  }
}
