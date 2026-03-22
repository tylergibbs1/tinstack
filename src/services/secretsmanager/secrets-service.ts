import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Secret {
  name: string;
  arn: string;
  description?: string;
  kmsKeyId?: string;
  createdDate: number;
  lastChangedDate: number;
  lastAccessedDate?: number;
  deletedDate?: number;
  tags: Record<string, string>;
  versions: Map<string, SecretVersion>;
  currentVersionId: string;
}

export interface SecretVersion {
  versionId: string;
  secretString?: string;
  secretBinary?: string;
  versionStages: string[];
  createdDate: number;
}

export class SecretsManagerService {
  private secrets: StorageBackend<string, Secret>;

  constructor(private accountId: string) {
    this.secrets = new InMemoryStorage();
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createSecret(name: string, secretString: string | undefined, secretBinary: string | undefined, description: string | undefined, kmsKeyId: string | undefined, tags: Record<string, string>, region: string): Secret {
    const key = this.regionKey(region, name);
    if (this.secrets.has(key)) {
      throw new AwsError("ResourceExistsException", `The operation failed because the secret ${name} already exists.`, 400);
    }

    const versionId = crypto.randomUUID();
    const now = Date.now() / 1000;
    const version: SecretVersion = {
      versionId,
      secretString,
      secretBinary,
      versionStages: ["AWSCURRENT"],
      createdDate: now,
    };

    const secret: Secret = {
      name,
      arn: buildArn("secretsmanager", region, this.accountId, "secret:", name + "-" + versionId.slice(0, 6)),
      description,
      kmsKeyId,
      createdDate: now,
      lastChangedDate: now,
      tags,
      versions: new Map([[versionId, version]]),
      currentVersionId: versionId,
    };

    this.secrets.set(key, secret);
    return secret;
  }

  getSecretValue(secretId: string, versionId: string | undefined, versionStage: string | undefined, region: string): { secret: Secret; version: SecretVersion } {
    const secret = this.findSecret(secretId, region);
    if (secret.deletedDate) {
      throw new AwsError("InvalidRequestException", `You can't perform this operation on the secret because it was marked for deletion.`, 400);
    }

    secret.lastAccessedDate = Date.now() / 1000;
    const stage = versionStage ?? "AWSCURRENT";

    let version: SecretVersion | undefined;
    if (versionId) {
      version = secret.versions.get(versionId);
    } else {
      for (const v of secret.versions.values()) {
        if (v.versionStages.includes(stage)) {
          version = v;
          break;
        }
      }
    }

    if (!version) throw new AwsError("ResourceNotFoundException", `Secrets Manager can't find the specified secret version.`, 400);
    return { secret, version };
  }

  updateSecret(secretId: string, secretString: string | undefined, secretBinary: string | undefined, description: string | undefined, region: string): Secret {
    const secret = this.findSecret(secretId, region);
    const now = Date.now() / 1000;

    if (description !== undefined) secret.description = description;

    if (secretString !== undefined || secretBinary !== undefined) {
      // Move current AWSCURRENT to AWSPREVIOUS
      for (const v of secret.versions.values()) {
        const idx = v.versionStages.indexOf("AWSCURRENT");
        if (idx >= 0) {
          v.versionStages.splice(idx, 1);
          v.versionStages.push("AWSPREVIOUS");
        }
        // Remove old AWSPREVIOUS
        const prevIdx = v.versionStages.indexOf("AWSPREVIOUS");
        if (prevIdx >= 0 && v.versionId !== secret.currentVersionId) {
          v.versionStages.splice(prevIdx, 1);
        }
      }

      const versionId = crypto.randomUUID();
      const version: SecretVersion = {
        versionId,
        secretString,
        secretBinary,
        versionStages: ["AWSCURRENT"],
        createdDate: now,
      };
      secret.versions.set(versionId, version);
      secret.currentVersionId = versionId;
    }

    secret.lastChangedDate = now;
    return secret;
  }

  putSecretValue(secretId: string, secretString: string | undefined, secretBinary: string | undefined, versionStages: string[] | undefined, region: string): { secret: Secret; versionId: string } {
    const secret = this.findSecret(secretId, region);
    const now = Date.now() / 1000;
    const stages = versionStages ?? ["AWSCURRENT"];

    // Remove stages from existing versions
    for (const v of secret.versions.values()) {
      for (const stage of stages) {
        const idx = v.versionStages.indexOf(stage);
        if (idx >= 0) {
          v.versionStages.splice(idx, 1);
          if (stage === "AWSCURRENT") {
            v.versionStages.push("AWSPREVIOUS");
          }
        }
      }
    }

    const versionId = crypto.randomUUID();
    const version: SecretVersion = {
      versionId,
      secretString,
      secretBinary,
      versionStages: stages,
      createdDate: now,
    };
    secret.versions.set(versionId, version);
    if (stages.includes("AWSCURRENT")) {
      secret.currentVersionId = versionId;
    }
    secret.lastChangedDate = now;

    return { secret, versionId };
  }

  deleteSecret(secretId: string, recoveryWindowInDays: number | undefined, forceDelete: boolean, region: string): Secret {
    const secret = this.findSecret(secretId, region);
    if (forceDelete) {
      const key = this.regionKey(region, secret.name);
      this.secrets.delete(key);
    } else {
      secret.deletedDate = Date.now() / 1000;
    }
    return secret;
  }

  restoreSecret(secretId: string, region: string): Secret {
    const secret = this.findSecret(secretId, region);
    secret.deletedDate = undefined;
    return secret;
  }

  listSecrets(region: string, maxResults?: number, filters?: any[]): { secrets: Secret[]; nextToken?: string } {
    const allSecrets = this.secrets.values().filter((s) => {
      return this.secrets.has(this.regionKey(region, s.name));
    });

    const limit = maxResults ?? 100;
    return {
      secrets: allSecrets.slice(0, limit),
      nextToken: allSecrets.length > limit ? String(limit) : undefined,
    };
  }

  describeSecret(secretId: string, region: string): Secret {
    return this.findSecret(secretId, region);
  }

  listSecretVersionIds(secretId: string, region: string): SecretVersion[] {
    const secret = this.findSecret(secretId, region);
    return [...secret.versions.values()];
  }

  tagResource(secretId: string, tags: Record<string, string>, region: string): void {
    const secret = this.findSecret(secretId, region);
    Object.assign(secret.tags, tags);
  }

  untagResource(secretId: string, tagKeys: string[], region: string): void {
    const secret = this.findSecret(secretId, region);
    for (const key of tagKeys) delete secret.tags[key];
  }

  getRandomPassword(length: number, excludeChars: string, excludeNumbers: boolean, excludePunctuation: boolean, excludeUppercase: boolean, excludeLowercase: boolean, includeSpace: boolean): string {
    let chars = "";
    if (!excludeLowercase) chars += "abcdefghijklmnopqrstuvwxyz";
    if (!excludeUppercase) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (!excludeNumbers) chars += "0123456789";
    if (!excludePunctuation) chars += "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
    if (includeSpace) chars += " ";
    if (excludeChars) {
      chars = chars.split("").filter((c) => !excludeChars.includes(c)).join("");
    }
    if (chars.length === 0) chars = "abcdefghijklmnopqrstuvwxyz";

    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
  }

  private findSecret(secretId: string, region: string): Secret {
    // Try by name first
    let key = this.regionKey(region, secretId);
    let secret = this.secrets.get(key);
    if (secret) return secret;

    // Try by ARN
    for (const s of this.secrets.values()) {
      if (s.arn === secretId) return s;
    }

    throw new AwsError("ResourceNotFoundException", `Secrets Manager can't find the specified secret.`, 400);
  }
}
