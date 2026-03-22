import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  BackupClient,
  CreateBackupVaultCommand,
  DescribeBackupVaultCommand,
  ListBackupVaultsCommand,
  DeleteBackupVaultCommand,
  CreateBackupPlanCommand,
  GetBackupPlanCommand,
  ListBackupPlansCommand,
  DeleteBackupPlanCommand,
  CreateBackupSelectionCommand,
  GetBackupSelectionCommand,
  ListBackupSelectionsCommand,
  DeleteBackupSelectionCommand,
  StartBackupJobCommand,
  DescribeBackupJobCommand,
  ListBackupJobsCommand,
  StartRestoreJobCommand,
  DescribeRestoreJobCommand,
  ListRestoreJobsCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsCommand,
} from "@aws-sdk/client-backup";
import { startServer, stopServer, clientConfig } from "./helpers";

const backup = new BackupClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("AWS Backup", () => {
  let vaultArn: string;
  let planId: string;
  let planArn: string;
  let selectionId: string;
  let backupJobId: string;
  let restoreJobId: string;

  // --- Vaults ---

  test("CreateBackupVault", async () => {
    const res = await backup.send(new CreateBackupVaultCommand({
      BackupVaultName: "test-vault",
      BackupVaultTags: { env: "test" },
    }));
    expect(res.BackupVaultName).toBe("test-vault");
    expect(res.BackupVaultArn).toContain("backup-vault:test-vault");
    vaultArn = res.BackupVaultArn!;
  });

  test("CreateBackupVault - duplicate", async () => {
    await expect(
      backup.send(new CreateBackupVaultCommand({ BackupVaultName: "test-vault" })),
    ).rejects.toThrow();
  });

  test("DescribeBackupVault", async () => {
    const res = await backup.send(new DescribeBackupVaultCommand({
      BackupVaultName: "test-vault",
    }));
    expect(res.BackupVaultName).toBe("test-vault");
    expect(res.BackupVaultArn).toBe(vaultArn);
  });

  test("ListBackupVaults", async () => {
    const res = await backup.send(new ListBackupVaultsCommand({}));
    expect(res.BackupVaultList).toBeDefined();
    expect(res.BackupVaultList!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Plans ---

  test("CreateBackupPlan", async () => {
    const res = await backup.send(new CreateBackupPlanCommand({
      BackupPlan: {
        BackupPlanName: "test-plan",
        Rules: [{
          RuleName: "daily-backup",
          TargetBackupVaultName: "test-vault",
          ScheduleExpression: "cron(0 12 * * ? *)",
        }],
      },
      BackupPlanTags: { team: "security" },
    }));
    planId = res.BackupPlanId!;
    planArn = res.BackupPlanArn!;
    expect(planId).toBeDefined();
    expect(planArn).toContain("backup-plan:");
    expect(res.VersionId).toBeDefined();
  });

  test("GetBackupPlan", async () => {
    const res = await backup.send(new GetBackupPlanCommand({
      BackupPlanId: planId,
    }));
    expect(res.BackupPlan).toBeDefined();
    expect(res.BackupPlan!.BackupPlanName).toBe("test-plan");
    expect(res.BackupPlan!.Rules).toBeDefined();
    expect(res.BackupPlan!.Rules!.length).toBe(1);
    expect(res.BackupPlan!.Rules![0].RuleName).toBe("daily-backup");
  });

  test("ListBackupPlans", async () => {
    const res = await backup.send(new ListBackupPlansCommand({}));
    expect(res.BackupPlansList).toBeDefined();
    expect(res.BackupPlansList!.length).toBeGreaterThanOrEqual(1);
    const found = res.BackupPlansList!.find((p) => p.BackupPlanId === planId);
    expect(found).toBeDefined();
    expect(found!.BackupPlanName).toBe("test-plan");
  });

  // --- Selections ---

  test("CreateBackupSelection", async () => {
    const res = await backup.send(new CreateBackupSelectionCommand({
      BackupPlanId: planId,
      BackupSelection: {
        SelectionName: "test-selection",
        IamRoleArn: "arn:aws:iam::000000000000:role/backup-role",
        Resources: ["arn:aws:ec2:us-east-1:000000000000:volume/vol-123"],
      },
    }));
    selectionId = res.SelectionId!;
    expect(selectionId).toBeDefined();
    expect(res.BackupPlanId).toBe(planId);
  });

  test("GetBackupSelection", async () => {
    const res = await backup.send(new GetBackupSelectionCommand({
      BackupPlanId: planId,
      SelectionId: selectionId,
    }));
    expect(res.BackupSelection).toBeDefined();
    expect(res.BackupSelection!.SelectionName).toBe("test-selection");
    expect(res.SelectionId).toBe(selectionId);
  });

  test("ListBackupSelections", async () => {
    const res = await backup.send(new ListBackupSelectionsCommand({
      BackupPlanId: planId,
    }));
    expect(res.BackupSelectionsList).toBeDefined();
    expect(res.BackupSelectionsList!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteBackupSelection", async () => {
    await backup.send(new DeleteBackupSelectionCommand({
      BackupPlanId: planId,
      SelectionId: selectionId,
    }));
    const res = await backup.send(new ListBackupSelectionsCommand({
      BackupPlanId: planId,
    }));
    expect(res.BackupSelectionsList!.length).toBe(0);
  });

  // --- Backup Jobs ---

  test("StartBackupJob", async () => {
    const res = await backup.send(new StartBackupJobCommand({
      BackupVaultName: "test-vault",
      ResourceArn: "arn:aws:ec2:us-east-1:000000000000:volume/vol-123",
      IamRoleArn: "arn:aws:iam::000000000000:role/backup-role",
    }));
    backupJobId = res.BackupJobId!;
    expect(backupJobId).toBeDefined();
  });

  test("DescribeBackupJob", async () => {
    const res = await backup.send(new DescribeBackupJobCommand({
      BackupJobId: backupJobId,
    }));
    expect(res.BackupJobId).toBe(backupJobId);
    expect(res.State).toBe("COMPLETED");
    expect(res.BackupVaultName).toBe("test-vault");
  });

  test("ListBackupJobs", async () => {
    const res = await backup.send(new ListBackupJobsCommand({}));
    expect(res.BackupJobs).toBeDefined();
    expect(res.BackupJobs!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Restore Jobs ---

  test("StartRestoreJob", async () => {
    const res = await backup.send(new StartRestoreJobCommand({
      RecoveryPointArn: vaultArn,
      IamRoleArn: "arn:aws:iam::000000000000:role/backup-role",
      Metadata: { "availability-zone": "us-east-1a" },
      ResourceType: "EBS",
    }));
    restoreJobId = res.RestoreJobId!;
    expect(restoreJobId).toBeDefined();
  });

  test("DescribeRestoreJob", async () => {
    const res = await backup.send(new DescribeRestoreJobCommand({
      RestoreJobId: restoreJobId,
    }));
    expect(res.RestoreJobId).toBe(restoreJobId);
    expect(res.Status).toBe("COMPLETED");
  });

  test("ListRestoreJobs", async () => {
    const res = await backup.send(new ListRestoreJobsCommand({}));
    expect(res.RestoreJobs).toBeDefined();
    expect(res.RestoreJobs!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Tags ---

  test("TagResource and ListTags", async () => {
    await backup.send(new TagResourceCommand({
      ResourceArn: vaultArn,
      Tags: { project: "tinstack" },
    }));
    const res = await backup.send(new ListTagsCommand({
      ResourceArn: vaultArn,
    }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.project).toBe("tinstack");
  });

  test("UntagResource", async () => {
    await backup.send(new UntagResourceCommand({
      ResourceArn: vaultArn,
      TagKeyList: ["project"],
    }));
    const res = await backup.send(new ListTagsCommand({
      ResourceArn: vaultArn,
    }));
    expect(res.Tags!.project).toBeUndefined();
  });

  // --- Cleanup ---

  test("DeleteBackupPlan", async () => {
    const res = await backup.send(new DeleteBackupPlanCommand({
      BackupPlanId: planId,
    }));
    expect(res.BackupPlanId).toBe(planId);
    expect(res.DeletionDate).toBeDefined();
  });

  test("DeleteBackupVault", async () => {
    await backup.send(new DeleteBackupVaultCommand({
      BackupVaultName: "test-vault",
    }));
    const list = await backup.send(new ListBackupVaultsCommand({}));
    const found = list.BackupVaultList!.find((v) => v.BackupVaultName === "test-vault");
    expect(found).toBeUndefined();
  });
});
