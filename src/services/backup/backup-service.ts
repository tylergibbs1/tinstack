import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface BackupVault {
  backupVaultName: string;
  backupVaultArn: string;
  creationDate: number;
  encryptionKeyArn: string;
  numberOfRecoveryPoints: number;
  tags: Record<string, string>;
}

export interface BackupPlan {
  backupPlanId: string;
  backupPlanArn: string;
  backupPlanName: string;
  versionId: string;
  creationDate: number;
  rules: BackupRule[];
  advancedBackupSettings?: any[];
  tags: Record<string, string>;
}

export interface BackupRule {
  ruleName: string;
  ruleId: string;
  targetBackupVaultName: string;
  scheduleExpression: string;
  startWindowMinutes: number;
  completionWindowMinutes: number;
  lifecycle?: { moveToColdStorageAfterDays?: number; deleteAfterDays?: number };
}

export interface BackupSelection {
  selectionId: string;
  selectionName: string;
  backupPlanId: string;
  iamRoleArn: string;
  resources: string[];
  creationDate: number;
}

export interface BackupJob {
  backupJobId: string;
  backupVaultName: string;
  backupVaultArn: string;
  resourceArn: string;
  resourceType: string;
  iamRoleArn: string;
  state: string;
  creationDate: number;
  completionDate?: number;
  percentDone: string;
  backupSizeInBytes: number;
}

export interface RestoreJob {
  restoreJobId: string;
  backupVaultName: string;
  resourceType: string;
  iamRoleArn: string;
  status: string;
  creationDate: number;
  completionDate?: number;
  expectedCompletionTimeMinutes?: number;
}

export class BackupService {
  private vaults: StorageBackend<string, BackupVault>;
  private plans: StorageBackend<string, BackupPlan>;
  private selections: StorageBackend<string, BackupSelection>;
  private backupJobs: StorageBackend<string, BackupJob>;
  private restoreJobs: StorageBackend<string, RestoreJob>;
  private resourceTags: StorageBackend<string, Record<string, string>>;

  constructor(private accountId: string) {
    this.vaults = new InMemoryStorage();
    this.plans = new InMemoryStorage();
    this.selections = new InMemoryStorage();
    this.backupJobs = new InMemoryStorage();
    this.restoreJobs = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();
  }

  // --- Vaults ---

  createBackupVault(
    name: string,
    encryptionKeyArn: string | undefined,
    tags: Record<string, string> | undefined,
    region: string,
  ): BackupVault {
    if (this.vaults.has(name)) {
      throw new AwsError("AlreadyExistsException", `Backup vault with name ${name} already exists.`, 400);
    }
    const vault: BackupVault = {
      backupVaultName: name,
      backupVaultArn: `arn:aws:backup:${region}:${this.accountId}:backup-vault:${name}`,
      creationDate: Date.now() / 1000,
      encryptionKeyArn: encryptionKeyArn ?? "",
      numberOfRecoveryPoints: 0,
      tags: tags ?? {},
    };
    this.vaults.set(name, vault);
    if (tags && Object.keys(tags).length > 0) {
      this.resourceTags.set(vault.backupVaultArn, tags);
    }
    return vault;
  }

  describeBackupVault(name: string): BackupVault {
    const vault = this.vaults.get(name);
    if (!vault) {
      throw new AwsError("ResourceNotFoundException", `Backup vault ${name} not found.`, 404);
    }
    return vault;
  }

  listBackupVaults(): BackupVault[] {
    return this.vaults.values();
  }

  deleteBackupVault(name: string): void {
    if (!this.vaults.has(name)) {
      throw new AwsError("ResourceNotFoundException", `Backup vault ${name} not found.`, 404);
    }
    this.vaults.delete(name);
  }

  // --- Plans ---

  createBackupPlan(
    planInput: { BackupPlanName: string; Rules: any[]; AdvancedBackupSettings?: any[] },
    tags: Record<string, string> | undefined,
    region: string,
  ): BackupPlan {
    const planId = crypto.randomUUID();
    const versionId = crypto.randomUUID().replace(/-/g, "");
    const rules: BackupRule[] = (planInput.Rules ?? []).map((r: any) => ({
      ruleName: r.RuleName,
      ruleId: crypto.randomUUID(),
      targetBackupVaultName: r.TargetBackupVaultName,
      scheduleExpression: r.ScheduleExpression ?? "cron(0 5 ? * * *)",
      startWindowMinutes: r.StartWindowMinutes ?? 480,
      completionWindowMinutes: r.CompletionWindowMinutes ?? 10080,
      lifecycle: r.Lifecycle,
    }));

    const plan: BackupPlan = {
      backupPlanId: planId,
      backupPlanArn: `arn:aws:backup:${region}:${this.accountId}:backup-plan:${planId}`,
      backupPlanName: planInput.BackupPlanName,
      versionId,
      creationDate: Date.now() / 1000,
      rules,
      advancedBackupSettings: planInput.AdvancedBackupSettings,
      tags: tags ?? {},
    };
    this.plans.set(planId, plan);
    if (tags && Object.keys(tags).length > 0) {
      this.resourceTags.set(plan.backupPlanArn, tags);
    }
    return plan;
  }

  getBackupPlan(planId: string): BackupPlan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new AwsError("ResourceNotFoundException", `Backup plan ${planId} not found.`, 404);
    }
    return plan;
  }

  listBackupPlans(): BackupPlan[] {
    return this.plans.values();
  }

  deleteBackupPlan(planId: string): { planId: string; planArn: string; versionId: string; deletionDate: number } {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new AwsError("ResourceNotFoundException", `Backup plan ${planId} not found.`, 404);
    }
    const deletionDate = Date.now() / 1000;
    this.plans.delete(planId);
    // Clean up selections for this plan
    for (const sel of this.selections.values()) {
      if (sel.backupPlanId === planId) {
        this.selections.delete(sel.selectionId);
      }
    }
    return { planId: plan.backupPlanId, planArn: plan.backupPlanArn, versionId: plan.versionId, deletionDate };
  }

  // --- Selections ---

  createBackupSelection(
    planId: string,
    selectionInput: { SelectionName: string; IamRoleArn: string; Resources?: string[] },
  ): BackupSelection {
    if (!this.plans.has(planId)) {
      throw new AwsError("ResourceNotFoundException", `Backup plan ${planId} not found.`, 404);
    }
    const selectionId = crypto.randomUUID();
    const selection: BackupSelection = {
      selectionId,
      selectionName: selectionInput.SelectionName,
      backupPlanId: planId,
      iamRoleArn: selectionInput.IamRoleArn,
      resources: selectionInput.Resources ?? [],
      creationDate: Date.now() / 1000,
    };
    this.selections.set(selectionId, selection);
    return selection;
  }

  getBackupSelection(planId: string, selectionId: string): BackupSelection {
    const selection = this.selections.get(selectionId);
    if (!selection || selection.backupPlanId !== planId) {
      throw new AwsError("ResourceNotFoundException", `Backup selection ${selectionId} not found.`, 404);
    }
    return selection;
  }

  listBackupSelections(planId: string): BackupSelection[] {
    return this.selections.values().filter((s) => s.backupPlanId === planId);
  }

  deleteBackupSelection(planId: string, selectionId: string): void {
    const selection = this.selections.get(selectionId);
    if (!selection || selection.backupPlanId !== planId) {
      throw new AwsError("ResourceNotFoundException", `Backup selection ${selectionId} not found.`, 404);
    }
    this.selections.delete(selectionId);
  }

  // --- Backup Jobs ---

  startBackupJob(
    backupVaultName: string,
    resourceArn: string,
    iamRoleArn: string,
    region: string,
  ): BackupJob {
    const vault = this.vaults.get(backupVaultName);
    if (!vault) {
      throw new AwsError("ResourceNotFoundException", `Backup vault ${backupVaultName} not found.`, 404);
    }

    const jobId = crypto.randomUUID();
    const now = Date.now() / 1000;
    const job: BackupJob = {
      backupJobId: jobId,
      backupVaultName,
      backupVaultArn: vault.backupVaultArn,
      resourceArn,
      resourceType: this.inferResourceType(resourceArn),
      iamRoleArn,
      state: "COMPLETED",
      creationDate: now,
      completionDate: now + 60,
      percentDone: "100.0",
      backupSizeInBytes: 1024,
    };
    this.backupJobs.set(jobId, job);
    vault.numberOfRecoveryPoints += 1;
    return job;
  }

  describeBackupJob(jobId: string): BackupJob {
    const job = this.backupJobs.get(jobId);
    if (!job) {
      throw new AwsError("ResourceNotFoundException", `Backup job ${jobId} not found.`, 404);
    }
    return job;
  }

  listBackupJobs(): BackupJob[] {
    return this.backupJobs.values();
  }

  // --- Restore Jobs ---

  startRestoreJob(
    backupVaultName: string,
    iamRoleArn: string,
    resourceType: string,
    metadata: Record<string, string>,
  ): RestoreJob {
    const jobId = crypto.randomUUID();
    const now = Date.now() / 1000;
    const job: RestoreJob = {
      restoreJobId: jobId,
      backupVaultName,
      resourceType: resourceType ?? "EBS",
      iamRoleArn,
      status: "COMPLETED",
      creationDate: now,
      completionDate: now + 120,
    };
    this.restoreJobs.set(jobId, job);
    return job;
  }

  describeRestoreJob(jobId: string): RestoreJob {
    const job = this.restoreJobs.get(jobId);
    if (!job) {
      throw new AwsError("ResourceNotFoundException", `Restore job ${jobId} not found.`, 404);
    }
    return job;
  }

  listRestoreJobs(): RestoreJob[] {
    return this.restoreJobs.values();
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

  listTags(resourceArn: string): Record<string, string> {
    return this.resourceTags.get(resourceArn) ?? {};
  }

  private inferResourceType(arn: string): string {
    if (arn.includes(":dynamodb:")) return "DynamoDB";
    if (arn.includes(":rds:")) return "RDS";
    if (arn.includes(":ec2:") && arn.includes("volume")) return "EBS";
    if (arn.includes(":s3:")) return "S3";
    if (arn.includes(":elasticfilesystem:")) return "EFS";
    return "EC2";
  }
}
