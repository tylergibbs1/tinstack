import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface Protection {
  protectionId: string;
  protectionArn: string;
  name: string;
  resourceArn: string;
  healthCheckIds: string[];
}

export interface Subscription {
  startTime: number;
  endTime: number;
  timeCommitmentInSeconds: number;
  autoRenew: string;
  limits: { Type: string; Max: number }[];
  proactiveEngagementStatus: string;
  subscriptionArn: string;
}

export interface Attack {
  attackId: string;
  resourceArn: string;
  startTime: string;
  endTime: string;
  attackVectors: { vectorType: string }[];
}

export class ShieldService {
  private protections: StorageBackend<string, Protection>;
  private subscription: Subscription | null = null;
  private attacks: StorageBackend<string, Attack>;
  private resourceTags: StorageBackend<string, { Key: string; Value: string }[]>;

  constructor(private accountId: string) {
    this.protections = new InMemoryStorage();
    this.attacks = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();
  }

  // --- Protections ---

  createProtection(
    name: string,
    resourceArn: string,
    tags: { Key: string; Value: string }[] | undefined,
  ): string {
    // Check for duplicate resource ARN
    for (const p of this.protections.values()) {
      if (p.resourceArn === resourceArn) {
        throw new AwsError("ResourceAlreadyExistsException", `A protection already exists for resource ${resourceArn}.`, 400);
      }
    }

    const protectionId = crypto.randomUUID();
    const protectionArn = `arn:aws:shield::${this.accountId}:protection/${protectionId}`;
    const protection: Protection = {
      protectionId,
      protectionArn,
      name,
      resourceArn,
      healthCheckIds: [],
    };
    this.protections.set(protectionId, protection);
    if (tags && tags.length > 0) {
      this.resourceTags.set(protectionArn, tags);
    }
    return protectionId;
  }

  describeProtection(protectionId: string | undefined, resourceArn: string | undefined): Protection {
    if (protectionId) {
      const protection = this.protections.get(protectionId);
      if (!protection) {
        throw new AwsError("ResourceNotFoundException", `Protection ${protectionId} not found.`, 404);
      }
      return protection;
    }
    if (resourceArn) {
      const protection = this.protections.values().find((p) => p.resourceArn === resourceArn);
      if (!protection) {
        throw new AwsError("ResourceNotFoundException", `No protection found for resource ${resourceArn}.`, 404);
      }
      return protection;
    }
    throw new AwsError("InvalidParameterException", "ProtectionId or ResourceArn must be provided.", 400);
  }

  listProtections(): Protection[] {
    return this.protections.values();
  }

  deleteProtection(protectionId: string): void {
    if (!this.protections.has(protectionId)) {
      throw new AwsError("ResourceNotFoundException", `Protection ${protectionId} not found.`, 404);
    }
    this.protections.delete(protectionId);
  }

  // --- Subscription ---

  createSubscription(): void {
    if (this.subscription) return;
    const now = Date.now() / 1000;
    const end = now + 365 * 24 * 60 * 60;
    const subId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const formatted = `${subId.slice(0, 4)}-${subId.slice(4, 8)}-${subId.slice(8, 12)}`;

    this.subscription = {
      startTime: now,
      endTime: end,
      timeCommitmentInSeconds: 31536000,
      autoRenew: "ENABLED",
      limits: [{ Type: "MitigationCapacityUnits", Max: 10000 }],
      proactiveEngagementStatus: "ENABLED",
      subscriptionArn: `arn:aws:shield::${this.accountId}:subscription/${formatted}`,
    };
  }

  describeSubscription(): Subscription {
    if (!this.subscription) {
      throw new AwsError("ResourceNotFoundException", "No subscription found.", 404);
    }
    return this.subscription;
  }

  // --- Attacks ---

  describeAttack(attackId: string): Attack {
    const attack = this.attacks.get(attackId);
    if (!attack) {
      throw new AwsError("AccessDeniedException", `Attack ${attackId} not found.`, 404);
    }
    return attack;
  }

  listAttacks(): Attack[] {
    return this.attacks.values();
  }

  // --- Health Checks ---

  associateHealthCheck(protectionId: string, healthCheckArn: string): void {
    const protection = this.protections.get(protectionId);
    if (!protection) {
      throw new AwsError("ResourceNotFoundException", `Protection ${protectionId} not found.`, 404);
    }
    const id = healthCheckArn.split("/").pop() ?? healthCheckArn;
    if (!protection.healthCheckIds.includes(id)) {
      protection.healthCheckIds.push(id);
    }
  }

  disassociateHealthCheck(protectionId: string, healthCheckArn: string): void {
    const protection = this.protections.get(protectionId);
    if (!protection) {
      throw new AwsError("ResourceNotFoundException", `Protection ${protectionId} not found.`, 404);
    }
    const id = healthCheckArn.split("/").pop() ?? healthCheckArn;
    protection.healthCheckIds = protection.healthCheckIds.filter((hc) => hc !== id);
  }

  // --- Tags ---

  tagResource(resourceArn: string, tags: { Key: string; Value: string }[]): void {
    const existing = this.resourceTags.get(resourceArn) ?? [];
    for (const tag of tags) {
      const idx = existing.findIndex((t) => t.Key === tag.Key);
      if (idx >= 0) existing[idx] = tag;
      else existing.push(tag);
    }
    this.resourceTags.set(resourceArn, existing);
  }

  untagResource(resourceArn: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(resourceArn) ?? [];
    this.resourceTags.set(resourceArn, existing.filter((t) => !tagKeys.includes(t.Key)));
  }

  listTagsForResource(resourceArn: string): { Key: string; Value: string }[] {
    return this.resourceTags.get(resourceArn) ?? [];
  }
}
