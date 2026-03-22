import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { BackupService } from "./backup-service";

export class BackupHandler {
  constructor(private service: BackupService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- Backup Vaults ---

      // PUT /backup-vaults/{name}
      const vaultPutMatch = path.match(/^\/backup-vaults\/([^/]+)$/);
      if (vaultPutMatch && method === "PUT") {
        const body = await req.json();
        const vault = this.service.createBackupVault(
          vaultPutMatch[1],
          body.EncryptionKeyArn,
          body.BackupVaultTags,
          ctx.region,
        );
        return this.json(vaultToJson(vault), ctx);
      }

      // GET /backup-vaults/{name}
      const vaultGetMatch = path.match(/^\/backup-vaults\/([^/]+)$/);
      if (vaultGetMatch && method === "GET") {
        const vault = this.service.describeBackupVault(vaultGetMatch[1]);
        return this.json(vaultToJson(vault), ctx);
      }

      // GET /backup-vaults
      if (path === "/backup-vaults" && method === "GET") {
        const vaults = this.service.listBackupVaults();
        return this.json({ BackupVaultList: vaults.map(vaultToJson) }, ctx);
      }

      // DELETE /backup-vaults/{name}
      const vaultDeleteMatch = path.match(/^\/backup-vaults\/([^/]+)$/);
      if (vaultDeleteMatch && method === "DELETE") {
        this.service.deleteBackupVault(vaultDeleteMatch[1]);
        return this.json({}, ctx);
      }

      // --- Backup Plans ---

      // PUT /backup/plans
      if (path === "/backup/plans" && method === "PUT") {
        const body = await req.json();
        const plan = this.service.createBackupPlan(body.BackupPlan, body.BackupPlanTags, ctx.region);
        return this.json({
          BackupPlanId: plan.backupPlanId,
          BackupPlanArn: plan.backupPlanArn,
          VersionId: plan.versionId,
          CreationDate: plan.creationDate,
        }, ctx);
      }

      // GET /backup/plans/{planId}
      const planGetMatch = path.match(/^\/backup\/plans\/([^/]+)$/);
      if (planGetMatch && method === "GET") {
        const plan = this.service.getBackupPlan(planGetMatch[1]);
        return this.json(planToJson(plan), ctx);
      }

      // GET /backup/plans
      if (path === "/backup/plans" && method === "GET") {
        const plans = this.service.listBackupPlans();
        return this.json({ BackupPlansList: plans.map(planToListJson) }, ctx);
      }

      // DELETE /backup/plans/{planId}
      const planDeleteMatch = path.match(/^\/backup\/plans\/([^/]+)$/);
      if (planDeleteMatch && method === "DELETE") {
        const result = this.service.deleteBackupPlan(planDeleteMatch[1]);
        return this.json({
          BackupPlanId: result.planId,
          BackupPlanArn: result.planArn,
          VersionId: result.versionId,
          DeletionDate: result.deletionDate,
        }, ctx);
      }

      // --- Backup Selections ---

      // PUT /backup/plans/{planId}/selections
      const selectionPutMatch = path.match(/^\/backup\/plans\/([^/]+)\/selections$/);
      if (selectionPutMatch && method === "PUT") {
        const body = await req.json();
        const selection = this.service.createBackupSelection(selectionPutMatch[1], body.BackupSelection);
        return this.json({
          SelectionId: selection.selectionId,
          BackupPlanId: selection.backupPlanId,
          CreationDate: selection.creationDate,
        }, ctx);
      }

      // GET /backup/plans/{planId}/selections/{selectionId}
      const selectionGetMatch = path.match(/^\/backup\/plans\/([^/]+)\/selections\/([^/]+)$/);
      if (selectionGetMatch && method === "GET") {
        const selection = this.service.getBackupSelection(selectionGetMatch[1], selectionGetMatch[2]);
        return this.json({
          BackupSelection: {
            SelectionName: selection.selectionName,
            IamRoleArn: selection.iamRoleArn,
            Resources: selection.resources,
          },
          SelectionId: selection.selectionId,
          BackupPlanId: selection.backupPlanId,
          CreationDate: selection.creationDate,
        }, ctx);
      }

      // GET /backup/plans/{planId}/selections
      const selectionListMatch = path.match(/^\/backup\/plans\/([^/]+)\/selections$/);
      if (selectionListMatch && method === "GET") {
        const selections = this.service.listBackupSelections(selectionListMatch[1]);
        return this.json({
          BackupSelectionsList: selections.map((s) => ({
            SelectionId: s.selectionId,
            SelectionName: s.selectionName,
            BackupPlanId: s.backupPlanId,
            IamRoleArn: s.iamRoleArn,
            CreationDate: s.creationDate,
          })),
        }, ctx);
      }

      // DELETE /backup/plans/{planId}/selections/{selectionId}
      const selectionDeleteMatch = path.match(/^\/backup\/plans\/([^/]+)\/selections\/([^/]+)$/);
      if (selectionDeleteMatch && method === "DELETE") {
        this.service.deleteBackupSelection(selectionDeleteMatch[1], selectionDeleteMatch[2]);
        return this.json({}, ctx);
      }

      // --- Backup Jobs ---

      // PUT /backup-jobs
      if (path === "/backup-jobs" && method === "PUT") {
        const body = await req.json();
        const job = this.service.startBackupJob(
          body.BackupVaultName,
          body.ResourceArn,
          body.IamRoleArn,
          ctx.region,
        );
        return this.json({
          BackupJobId: job.backupJobId,
          CreationDate: job.creationDate,
        }, ctx);
      }

      // GET /backup-jobs/{jobId}
      const jobGetMatch = path.match(/^\/backup-jobs\/([^/]+)$/);
      if (jobGetMatch && method === "GET") {
        const job = this.service.describeBackupJob(jobGetMatch[1]);
        return this.json(backupJobToJson(job), ctx);
      }

      // GET /backup-jobs
      if (path === "/backup-jobs" && method === "GET") {
        const jobs = this.service.listBackupJobs();
        return this.json({ BackupJobs: jobs.map(backupJobToJson) }, ctx);
      }

      // --- Restore Jobs ---

      // PUT /restore-jobs
      if (path === "/restore-jobs" && method === "PUT") {
        const body = await req.json();
        const job = this.service.startRestoreJob(
          body.RecoveryPointArn ?? "default-vault",
          body.IamRoleArn,
          body.ResourceType,
          body.Metadata ?? {},
        );
        return this.json({ RestoreJobId: job.restoreJobId }, ctx);
      }

      // GET /restore-jobs/{jobId}
      const restoreJobGetMatch = path.match(/^\/restore-jobs\/([^/]+)$/);
      if (restoreJobGetMatch && method === "GET") {
        const job = this.service.describeRestoreJob(restoreJobGetMatch[1]);
        return this.json(restoreJobToJson(job), ctx);
      }

      // GET /restore-jobs
      if (path === "/restore-jobs" && method === "GET") {
        const jobs = this.service.listRestoreJobs();
        return this.json({ RestoreJobs: jobs.map(restoreJobToJson) }, ctx);
      }

      // --- Tags ---

      // POST /tags/{resourceArn}
      const tagPostMatch = path.match(/^\/tags\/(.+)$/);
      if (tagPostMatch && method === "POST") {
        const body = await req.json();
        this.service.tagResource(decodeURIComponent(tagPostMatch[1]), body.Tags ?? {});
        return this.json({}, ctx);
      }

      // POST /untag/{resourceArn}
      const untagPostMatch = path.match(/^\/untag\/(.+)$/);
      if (untagPostMatch && method === "POST") {
        const body = await req.json();
        this.service.untagResource(decodeURIComponent(untagPostMatch[1]), body.TagKeyList ?? []);
        return this.json({}, ctx);
      }

      // GET /tags/{resourceArn}
      const tagGetMatch = path.match(/^\/tags\/(.+)$/);
      if (tagGetMatch && method === "GET") {
        const tags = this.service.listTags(decodeURIComponent(tagGetMatch[1]));
        return this.json({ Tags: tags }, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown Backup operation: ${method} ${path}`, 404),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}

function vaultToJson(vault: any) {
  return {
    BackupVaultName: vault.backupVaultName,
    BackupVaultArn: vault.backupVaultArn,
    CreationDate: vault.creationDate,
    EncryptionKeyArn: vault.encryptionKeyArn,
    NumberOfRecoveryPoints: vault.numberOfRecoveryPoints,
  };
}

function planToJson(plan: any) {
  return {
    BackupPlan: {
      BackupPlanName: plan.backupPlanName,
      Rules: plan.rules.map((r: any) => ({
        RuleName: r.ruleName,
        RuleId: r.ruleId,
        TargetBackupVaultName: r.targetBackupVaultName,
        ScheduleExpression: r.scheduleExpression,
        StartWindowMinutes: r.startWindowMinutes,
        CompletionWindowMinutes: r.completionWindowMinutes,
        Lifecycle: r.lifecycle,
      })),
      AdvancedBackupSettings: plan.advancedBackupSettings,
    },
    BackupPlanId: plan.backupPlanId,
    BackupPlanArn: plan.backupPlanArn,
    VersionId: plan.versionId,
    CreationDate: plan.creationDate,
  };
}

function planToListJson(plan: any) {
  return {
    BackupPlanId: plan.backupPlanId,
    BackupPlanArn: plan.backupPlanArn,
    BackupPlanName: plan.backupPlanName,
    VersionId: plan.versionId,
    CreationDate: plan.creationDate,
  };
}

function backupJobToJson(job: any) {
  return {
    BackupJobId: job.backupJobId,
    BackupVaultName: job.backupVaultName,
    BackupVaultArn: job.backupVaultArn,
    ResourceArn: job.resourceArn,
    ResourceType: job.resourceType,
    IamRoleArn: job.iamRoleArn,
    State: job.state,
    CreationDate: job.creationDate,
    CompletionDate: job.completionDate,
    PercentDone: job.percentDone,
    BackupSizeInBytes: job.backupSizeInBytes,
  };
}

function restoreJobToJson(job: any) {
  return {
    RestoreJobId: job.restoreJobId,
    BackupVaultName: job.backupVaultName,
    ResourceType: job.resourceType,
    IamRoleArn: job.iamRoleArn,
    Status: job.status,
    CreationDate: job.creationDate,
    CompletionDate: job.completionDate,
  };
}
