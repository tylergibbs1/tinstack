import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Vault {
  vaultName: string;
  vaultARN: string;
  creationDate: string;
  lastInventoryDate: string | null;
  numberOfArchives: number;
  sizeInBytes: number;
  tags: Record<string, string>;
  notificationConfig: { SNSTopic: string; Events: string[] } | null;
}

export interface Archive {
  archiveId: string;
  vaultName: string;
  description: string;
  creationDate: string;
  size: number;
  sha256TreeHash: string;
}

export interface GlacierJob {
  jobId: string;
  vaultARN: string;
  action: string;
  archiveId: string | null;
  statusCode: string;
  completed: boolean;
  creationDate: string;
  completionDate: string | null;
  tier: string;
  description: string | null;
}

export class GlacierService {
  private vaults: StorageBackend<string, Vault>;
  private archives: StorageBackend<string, Archive>;
  private jobs: StorageBackend<string, GlacierJob>;

  constructor(private accountId: string) {
    this.vaults = new InMemoryStorage();
    this.archives = new InMemoryStorage();
    this.jobs = new InMemoryStorage();
  }

  createVault(vaultName: string, region: string): string {
    if (this.vaults.has(vaultName)) return this.vaults.get(vaultName)!.vaultARN;

    const arn = buildArn("glacier", region, this.accountId, "vaults/", vaultName);
    this.vaults.set(vaultName, {
      vaultName,
      vaultARN: arn,
      creationDate: new Date().toISOString(),
      lastInventoryDate: null,
      numberOfArchives: 0,
      sizeInBytes: 0,
      tags: {},
      notificationConfig: null,
    });
    return arn;
  }

  describeVault(vaultName: string): Vault {
    const vault = this.vaults.get(vaultName);
    if (!vault) throw new AwsError("ResourceNotFoundException", `Vault ${vaultName} not found.`, 404);
    return vault;
  }

  listVaults(): Vault[] {
    return this.vaults.values();
  }

  deleteVault(vaultName: string): void {
    const vault = this.vaults.get(vaultName);
    if (!vault) throw new AwsError("ResourceNotFoundException", `Vault ${vaultName} not found.`, 404);
    if (vault.numberOfArchives > 0) {
      throw new AwsError("InvalidParameterValueException", `Vault ${vaultName} is not empty.`, 400);
    }
    this.vaults.delete(vaultName);
  }

  uploadArchive(vaultName: string, description: string | undefined, body: string): string {
    const vault = this.vaults.get(vaultName);
    if (!vault) throw new AwsError("ResourceNotFoundException", `Vault ${vaultName} not found.`, 404);

    const archiveId = crypto.randomUUID().replace(/-/g, "");
    this.archives.set(archiveId, {
      archiveId,
      vaultName,
      description: description ?? "",
      creationDate: new Date().toISOString(),
      size: body.length,
      sha256TreeHash: "0000000000000000000000000000000000000000000000000000000000000000",
    });
    vault.numberOfArchives += 1;
    vault.sizeInBytes += body.length;
    return archiveId;
  }

  deleteArchive(vaultName: string, archiveId: string): void {
    const vault = this.vaults.get(vaultName);
    if (!vault) throw new AwsError("ResourceNotFoundException", `Vault ${vaultName} not found.`, 404);
    const archive = this.archives.get(archiveId);
    if (!archive || archive.vaultName !== vaultName) {
      throw new AwsError("ResourceNotFoundException", `Archive ${archiveId} not found.`, 404);
    }
    vault.numberOfArchives -= 1;
    vault.sizeInBytes -= archive.size;
    this.archives.delete(archiveId);
  }

  initiateJob(vaultName: string, jobParams: any): string {
    const vault = this.vaults.get(vaultName);
    if (!vault) throw new AwsError("ResourceNotFoundException", `Vault ${vaultName} not found.`, 404);

    const jobId = crypto.randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    this.jobs.set(jobId, {
      jobId,
      vaultARN: vault.vaultARN,
      action: jobParams.Type ?? "archive-retrieval",
      archiveId: jobParams.ArchiveId ?? null,
      statusCode: "Succeeded",
      completed: true,
      creationDate: now,
      completionDate: now,
      tier: jobParams.Tier ?? "Standard",
      description: jobParams.Description ?? null,
    });
    return jobId;
  }

  describeJob(vaultName: string, jobId: string): GlacierJob {
    this.describeVault(vaultName); // ensure vault exists
    const job = this.jobs.get(jobId);
    if (!job) throw new AwsError("ResourceNotFoundException", `Job ${jobId} not found.`, 404);
    return job;
  }

  listJobs(vaultName: string): GlacierJob[] {
    this.describeVault(vaultName);
    return this.jobs.values().filter((j) => j.vaultARN.includes(vaultName));
  }

  getJobOutput(vaultName: string, jobId: string): { body: string; contentType: string } {
    const job = this.describeJob(vaultName, jobId);
    if (!job.completed) throw new AwsError("InvalidParameterValueException", `Job ${jobId} is not yet completed.`, 400);

    if (job.action === "inventory-retrieval") {
      const archives = this.archives.values().filter((a) => a.vaultName === vaultName);
      const inventory = {
        VaultARN: job.vaultARN,
        InventoryDate: new Date().toISOString(),
        ArchiveList: archives.map((a) => ({
          ArchiveId: a.archiveId,
          ArchiveDescription: a.description,
          CreationDate: a.creationDate,
          Size: a.size,
          SHA256TreeHash: a.sha256TreeHash,
        })),
      };
      return { body: JSON.stringify(inventory), contentType: "application/json" };
    }

    return { body: "", contentType: "application/octet-stream" };
  }

  setVaultNotifications(vaultName: string, config: { SNSTopic: string; Events: string[] }): void {
    const vault = this.describeVault(vaultName);
    vault.notificationConfig = config;
  }

  getVaultNotifications(vaultName: string): { SNSTopic: string; Events: string[] } {
    const vault = this.describeVault(vaultName);
    if (!vault.notificationConfig) {
      throw new AwsError("ResourceNotFoundException", `No notification configuration for vault ${vaultName}.`, 404);
    }
    return vault.notificationConfig;
  }

  deleteVaultNotifications(vaultName: string): void {
    const vault = this.describeVault(vaultName);
    vault.notificationConfig = null;
  }

  addTagsToVault(vaultName: string, tags: Record<string, string>): void {
    const vault = this.describeVault(vaultName);
    Object.assign(vault.tags, tags);
  }

  listTagsForVault(vaultName: string): Record<string, string> {
    const vault = this.describeVault(vaultName);
    return vault.tags;
  }

  removeTagsFromVault(vaultName: string, tagKeys: string[]): void {
    const vault = this.describeVault(vaultName);
    for (const key of tagKeys) {
      delete vault.tags[key];
    }
  }
}
