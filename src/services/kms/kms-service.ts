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
  rotationEnabled: boolean;
}

export interface KmsGrant {
  grantId: string;
  grantToken: string;
  keyId: string;
  granteePrincipal: string;
  retiringPrincipal?: string;
  operations: string[];
  creationDate: number;
  name?: string;
}

export class KmsService {
  private keys: StorageBackend<string, KmsKey>;
  private aliases: StorageBackend<string, string>; // alias -> keyId
  private grants: StorageBackend<string, KmsGrant[]>;

  constructor(private accountId: string) {
    this.keys = new InMemoryStorage();
    this.aliases = new InMemoryStorage();
    this.grants = new InMemoryStorage();
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
      rotationEnabled: false,
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

  listResourceTags(keyId: string, region: string): { TagKey: string; TagValue: string }[] {
    const key = this.findKey(keyId, region);
    return Object.entries(key.tags).map(([TagKey, TagValue]) => ({ TagKey, TagValue }));
  }

  encrypt(keyId: string, plaintext: string, region: string): { ciphertextBlob: string; keyId: string } {
    const key = this.findKey(keyId, region);
    if (!key.enabled) throw new AwsError("DisabledException", "Key is disabled", 400);
    // Simple "encryption" — prefix with a fixed-format marker, then base64 the whole thing
    const ciphertext = `TINSTACK_KMS:${key.keyId}:${plaintext}`;
    return { ciphertextBlob: Buffer.from(ciphertext).toString("base64"), keyId: key.arn };
  }

  decrypt(ciphertextBlob: string, region: string): { plaintext: string; keyId: string } {
    const decoded = Buffer.from(ciphertextBlob, "base64").toString();

    if (decoded.startsWith("TINSTACK_KMS:")) {
      const firstColon = decoded.indexOf(":", 13); // after "TINSTACK_KMS:"
      if (firstColon === -1) throw new AwsError("InvalidCiphertextException", "The ciphertext is invalid.", 400);
      const keyId = decoded.substring(13, firstColon);
      const plaintext = decoded.substring(firstColon + 1);
      const key = this.findKey(keyId, region);
      return { plaintext, keyId: key.arn };
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
    return { ciphertextBlob: encrypted.ciphertextBlob, plaintext, keyId: key.arn };
  }

  tagResource(keyId: string, tags: { TagKey: string; TagValue: string }[], region: string): void {
    const key = this.findKey(keyId, region);
    for (const t of tags) key.tags[t.TagKey] = t.TagValue;
  }

  untagResource(keyId: string, tagKeys: string[], region: string): void {
    const key = this.findKey(keyId, region);
    for (const k of tagKeys) delete key.tags[k];
  }

  enableKeyRotation(keyId: string, region: string): void {
    const key = this.findKey(keyId, region);
    key.rotationEnabled = true;
  }

  disableKeyRotation(keyId: string, region: string): void {
    const key = this.findKey(keyId, region);
    key.rotationEnabled = false;
  }

  getKeyRotationStatus(keyId: string, region: string): boolean {
    const key = this.findKey(keyId, region);
    return key.rotationEnabled;
  }

  generateRandom(numberOfBytes: number): string {
    const bytes = new Uint8Array(numberOfBytes || 32);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString("base64");
  }

  sign(keyId: string, message: string, signingAlgorithm: string, region: string): { signature: string; keyId: string; signingAlgorithm: string } {
    const key = this.findKey(keyId, region);
    if (!key.enabled) throw new AwsError("DisabledException", "Key is disabled", 400);
    // Mock signature: HMAC the message with the keyId as "key"
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(`${key.keyId}:${message}`);
    const signature = hasher.digest("base64") as string;
    return { signature, keyId: key.arn, signingAlgorithm: signingAlgorithm || "RSASSA_PSS_SHA_256" };
  }

  verify(keyId: string, message: string, signature: string, signingAlgorithm: string, region: string): { signatureValid: boolean; keyId: string; signingAlgorithm: string } {
    const key = this.findKey(keyId, region);
    if (!key.enabled) throw new AwsError("DisabledException", "Key is disabled", 400);
    // Re-compute expected signature and compare
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(`${key.keyId}:${message}`);
    const expected = hasher.digest("base64") as string;
    return { signatureValid: signature === expected, keyId: key.arn, signingAlgorithm: signingAlgorithm || "RSASSA_PSS_SHA_256" };
  }

  reEncrypt(ciphertextBlob: string, destinationKeyId: string, region: string): { ciphertextBlob: string; sourceKeyId: string; keyId: string } {
    const decrypted = this.decrypt(ciphertextBlob, region);
    const encrypted = this.encrypt(destinationKeyId, decrypted.plaintext, region);
    return { ciphertextBlob: encrypted.ciphertextBlob, sourceKeyId: decrypted.keyId, keyId: encrypted.keyId };
  }

  createGrant(keyId: string, granteePrincipal: string, operations: string[], retiringPrincipal: string | undefined, name: string | undefined, region: string): { grantId: string; grantToken: string } {
    const key = this.findKey(keyId, region);
    const rk = this.regionKey(region, key.keyId);
    const grants = this.grants.get(rk) ?? [];
    const grantId = crypto.randomUUID();
    const grantToken = crypto.randomUUID();
    const grant: KmsGrant = {
      grantId,
      grantToken,
      keyId: key.keyId,
      granteePrincipal,
      retiringPrincipal,
      operations,
      creationDate: Date.now() / 1000,
      name,
    };
    grants.push(grant);
    this.grants.set(rk, grants);
    return { grantId, grantToken };
  }

  listGrants(keyId: string, region: string): KmsGrant[] {
    const key = this.findKey(keyId, region);
    return this.grants.get(this.regionKey(region, key.keyId)) ?? [];
  }

  revokeGrant(keyId: string, grantId: string, region: string): void {
    const key = this.findKey(keyId, region);
    const rk = this.regionKey(region, key.keyId);
    const grants = this.grants.get(rk);
    if (!grants) throw new AwsError("NotFoundException", `Grant not found: ${grantId}`, 400);
    const idx = grants.findIndex((g) => g.grantId === grantId);
    if (idx === -1) throw new AwsError("NotFoundException", `Grant not found: ${grantId}`, 400);
    grants.splice(idx, 1);
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
