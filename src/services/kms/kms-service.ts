import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface KmsKey {
  keyId: string;
  arn: string;
  description?: string;
  keyState: string;
  keyUsage: string;
  keySpec: string;
  creationDate: number;
  enabled: boolean;
  aliases: string[];
  tags: Record<string, string>;
}

export class KmsService {
  private keys: StorageBackend<string, KmsKey>;
  private aliases: StorageBackend<string, string>; // alias -> keyId

  constructor(private accountId: string) {
    this.keys = new InMemoryStorage();
    this.aliases = new InMemoryStorage();
  }

  private regionKey(region: string, keyId: string): string {
    return `${region}#${keyId}`;
  }

  createKey(description: string | undefined, keyUsage: string, keySpec: string, tags: Record<string, string>, region: string): KmsKey {
    const keyId = crypto.randomUUID();
    const key: KmsKey = {
      keyId,
      arn: buildArn("kms", region, this.accountId, "key/", keyId),
      description,
      keyState: "Enabled",
      keyUsage: keyUsage || "ENCRYPT_DECRYPT",
      keySpec: keySpec || "SYMMETRIC_DEFAULT",
      creationDate: Date.now() / 1000,
      enabled: true,
      aliases: [],
      tags,
    };
    this.keys.set(this.regionKey(region, keyId), key);
    return key;
  }

  describeKey(keyId: string, region: string): KmsKey {
    return this.findKey(keyId, region);
  }

  listKeys(region: string): KmsKey[] {
    return this.keys.values().filter((k) => k.arn.includes(`:${region}:`));
  }

  enableKey(keyId: string, region: string): void {
    const key = this.findKey(keyId, region);
    key.enabled = true;
    key.keyState = "Enabled";
  }

  disableKey(keyId: string, region: string): void {
    const key = this.findKey(keyId, region);
    key.enabled = false;
    key.keyState = "Disabled";
  }

  scheduleKeyDeletion(keyId: string, pendingWindowInDays: number, region: string): { keyId: string; deletionDate: number } {
    const key = this.findKey(keyId, region);
    key.keyState = "PendingDeletion";
    key.enabled = false;
    const days = pendingWindowInDays || 30;
    return { keyId: key.keyId, deletionDate: Date.now() / 1000 + days * 86400 };
  }

  createAlias(aliasName: string, targetKeyId: string, region: string): void {
    const key = this.findKey(targetKeyId, region);
    this.aliases.set(`${region}#${aliasName}`, key.keyId);
    key.aliases.push(aliasName);
  }

  deleteAlias(aliasName: string, region: string): void {
    const ak = `${region}#${aliasName}`;
    const keyId = this.aliases.get(ak);
    if (keyId) {
      const key = this.keys.get(this.regionKey(region, keyId));
      if (key) key.aliases = key.aliases.filter((a) => a !== aliasName);
    }
    this.aliases.delete(ak);
  }

  listAliases(region: string): { aliasName: string; aliasArn: string; targetKeyId: string }[] {
    return this.aliases.keys()
      .filter((k) => k.startsWith(`${region}#`))
      .map((k) => {
        const aliasName = k.slice(region.length + 1);
        const keyId = this.aliases.get(k)!;
        return {
          aliasName,
          aliasArn: buildArn("kms", region, this.accountId, "", aliasName),
          targetKeyId: keyId,
        };
      });
  }

  encrypt(keyId: string, plaintext: string, region: string): { ciphertextBlob: string; keyId: string } {
    const key = this.findKey(keyId, region);
    if (!key.enabled) throw new AwsError("DisabledException", "Key is disabled", 400);
    // Simple "encryption" — base64 encode with a prefix for the key
    const marker = Buffer.from(`tinstack:${key.keyId}:`).toString("base64");
    const ciphertext = marker + plaintext;
    return { ciphertextBlob: Buffer.from(ciphertext).toString("base64"), keyId: key.keyId };
  }

  decrypt(ciphertextBlob: string, region: string): { plaintext: string; keyId: string } {
    const decoded = Buffer.from(ciphertextBlob, "base64").toString();
    const markerPrefix = "tinstack:";
    const decodedMarker = Buffer.from(decoded.substring(0, 60), "base64").toString();

    if (decodedMarker.startsWith(markerPrefix)) {
      const parts = decodedMarker.split(":");
      const keyId = parts[1];
      const key = this.findKey(keyId, region);
      const markerLen = Buffer.from(`tinstack:${keyId}:`).toString("base64").length;
      const plaintext = decoded.substring(markerLen);
      return { plaintext, keyId: key.keyId };
    }

    throw new AwsError("InvalidCiphertextException", "The ciphertext is invalid.", 400);
  }

  generateDataKey(keyId: string, keySpec: string, region: string): { ciphertextBlob: string; plaintext: string; keyId: string } {
    const key = this.findKey(keyId, region);
    const bytes = keySpec === "AES_128" ? 16 : 32;
    const plaintextBytes = new Uint8Array(bytes);
    crypto.getRandomValues(plaintextBytes);
    const plaintext = Buffer.from(plaintextBytes).toString("base64");
    const encrypted = this.encrypt(keyId, plaintext, region);
    return { ciphertextBlob: encrypted.ciphertextBlob, plaintext, keyId: key.keyId };
  }

  private findKey(keyId: string, region: string): KmsKey {
    // Try direct lookup
    let key = this.keys.get(this.regionKey(region, keyId));
    if (key) return key;

    // Try by alias
    const aliasKey = this.aliases.get(`${region}#${keyId}`);
    if (aliasKey) {
      key = this.keys.get(this.regionKey(region, aliasKey));
      if (key) return key;
    }

    // Try by ARN
    for (const k of this.keys.values()) {
      if (k.arn === keyId) return k;
    }

    throw new AwsError("NotFoundException", `Key '${keyId}' does not exist`, 400);
  }
}
