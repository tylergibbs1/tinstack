import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface ResourceShare {
  resourceShareArn: string;
  name: string;
  owningAccountId: string;
  allowExternalPrincipals: boolean;
  status: string;
  creationTime: number;
  lastUpdatedTime: number;
  tags: { key: string; value: string }[];
  principals: string[];
  resourceArns: string[];
}

export interface ResourceShareAssociation {
  resourceShareArn: string;
  resourceShareName: string;
  associatedEntity: string;
  associationType: string;
  status: string;
  creationTime: number;
  lastUpdatedTime: number;
}

export class RamService {
  private shares: StorageBackend<string, ResourceShare>;
  private associations: ResourceShareAssociation[];

  constructor(private accountId: string) {
    this.shares = new InMemoryStorage();
    this.associations = [];
  }

  createResourceShare(body: any, region: string): ResourceShare {
    const name = body.name;
    const now = Date.now() / 1000;
    const arn = `arn:aws:ram:${region}:${this.accountId}:resource-share/${crypto.randomUUID()}`;

    const share: ResourceShare = {
      resourceShareArn: arn,
      name,
      owningAccountId: this.accountId,
      allowExternalPrincipals: body.allowExternalPrincipals ?? true,
      status: "ACTIVE",
      creationTime: now,
      lastUpdatedTime: now,
      tags: body.tags ?? [],
      principals: body.principals ?? [],
      resourceArns: body.resourceArns ?? [],
    };

    this.shares.set(arn, share);

    // Create associations for principals and resources
    for (const principal of share.principals) {
      this.associations.push({
        resourceShareArn: arn,
        resourceShareName: name,
        associatedEntity: principal,
        associationType: "PRINCIPAL",
        status: "ASSOCIATED",
        creationTime: now,
        lastUpdatedTime: now,
      });
    }
    for (const resourceArn of share.resourceArns) {
      this.associations.push({
        resourceShareArn: arn,
        resourceShareName: name,
        associatedEntity: resourceArn,
        associationType: "RESOURCE",
        status: "ASSOCIATED",
        creationTime: now,
        lastUpdatedTime: now,
      });
    }

    return share;
  }

  getResourceShares(resourceOwner: string): ResourceShare[] {
    return this.shares.values().filter((s) => {
      if (resourceOwner === "SELF") return s.owningAccountId === this.accountId;
      return true;
    });
  }

  updateResourceShare(body: any): ResourceShare {
    const arn = body.resourceShareArn;
    const share = this.shares.get(arn);
    if (!share) throw new AwsError("UnknownResourceException", `Resource share ${arn} not found.`, 400);

    if (body.name !== undefined) share.name = body.name;
    if (body.allowExternalPrincipals !== undefined) share.allowExternalPrincipals = body.allowExternalPrincipals;
    share.lastUpdatedTime = Date.now() / 1000;
    this.shares.set(arn, share);
    return share;
  }

  deleteResourceShare(arn: string): void {
    const share = this.shares.get(arn);
    if (!share) throw new AwsError("UnknownResourceException", `Resource share ${arn} not found.`, 400);
    share.status = "DELETED";
    this.shares.set(arn, share);
    // Remove associations
    this.associations = this.associations.filter((a) => a.resourceShareArn !== arn);
  }

  associateResourceShare(body: any): ResourceShareAssociation[] {
    const arn = body.resourceShareArn;
    const share = this.shares.get(arn);
    if (!share) throw new AwsError("UnknownResourceException", `Resource share ${arn} not found.`, 400);

    const now = Date.now() / 1000;
    const newAssociations: ResourceShareAssociation[] = [];

    for (const principal of (body.principals ?? [])) {
      if (!share.principals.includes(principal)) share.principals.push(principal);
      const assoc: ResourceShareAssociation = {
        resourceShareArn: arn,
        resourceShareName: share.name,
        associatedEntity: principal,
        associationType: "PRINCIPAL",
        status: "ASSOCIATED",
        creationTime: now,
        lastUpdatedTime: now,
      };
      this.associations.push(assoc);
      newAssociations.push(assoc);
    }

    for (const resourceArn of (body.resourceArns ?? [])) {
      if (!share.resourceArns.includes(resourceArn)) share.resourceArns.push(resourceArn);
      const assoc: ResourceShareAssociation = {
        resourceShareArn: arn,
        resourceShareName: share.name,
        associatedEntity: resourceArn,
        associationType: "RESOURCE",
        status: "ASSOCIATED",
        creationTime: now,
        lastUpdatedTime: now,
      };
      this.associations.push(assoc);
      newAssociations.push(assoc);
    }

    this.shares.set(arn, share);
    return newAssociations;
  }

  disassociateResourceShare(body: any): ResourceShareAssociation[] {
    const arn = body.resourceShareArn;
    const share = this.shares.get(arn);
    if (!share) throw new AwsError("UnknownResourceException", `Resource share ${arn} not found.`, 400);

    const disassociated: ResourceShareAssociation[] = [];

    for (const principal of (body.principals ?? [])) {
      share.principals = share.principals.filter((p) => p !== principal);
      this.associations = this.associations.filter((a) => !(a.resourceShareArn === arn && a.associatedEntity === principal));
      disassociated.push({
        resourceShareArn: arn,
        resourceShareName: share.name,
        associatedEntity: principal,
        associationType: "PRINCIPAL",
        status: "DISASSOCIATED",
        creationTime: Date.now() / 1000,
        lastUpdatedTime: Date.now() / 1000,
      });
    }

    for (const resourceArn of (body.resourceArns ?? [])) {
      share.resourceArns = share.resourceArns.filter((r) => r !== resourceArn);
      this.associations = this.associations.filter((a) => !(a.resourceShareArn === arn && a.associatedEntity === resourceArn));
      disassociated.push({
        resourceShareArn: arn,
        resourceShareName: share.name,
        associatedEntity: resourceArn,
        associationType: "RESOURCE",
        status: "DISASSOCIATED",
        creationTime: Date.now() / 1000,
        lastUpdatedTime: Date.now() / 1000,
      });
    }

    this.shares.set(arn, share);
    return disassociated;
  }

  getResourceShareAssociations(associationType: string, resourceShareArns?: string[]): ResourceShareAssociation[] {
    let results = this.associations.filter((a) => a.associationType === associationType);
    if (resourceShareArns && resourceShareArns.length > 0) {
      const arnSet = new Set(resourceShareArns);
      results = results.filter((a) => arnSet.has(a.resourceShareArn));
    }
    return results;
  }

  listResources(resourceOwner: string, resourceShareArns?: string[]): { arn: string; type: string; resourceShareArn: string; status: string; creationTime: number; lastUpdatedTime: number }[] {
    const shares = this.getResourceShares(resourceOwner);
    const resources: { arn: string; type: string; resourceShareArn: string; status: string; creationTime: number; lastUpdatedTime: number }[] = [];

    for (const share of shares) {
      if (resourceShareArns && !resourceShareArns.includes(share.resourceShareArn)) continue;
      for (const resourceArn of share.resourceArns) {
        resources.push({
          arn: resourceArn,
          type: this.guessResourceType(resourceArn),
          resourceShareArn: share.resourceShareArn,
          status: "AVAILABLE",
          creationTime: share.creationTime,
          lastUpdatedTime: share.lastUpdatedTime,
        });
      }
    }
    return resources;
  }

  tagResource(arn: string, tags: { key: string; value: string }[]): void {
    const share = this.shares.get(arn);
    if (!share) throw new AwsError("UnknownResourceException", `Resource ${arn} not found.`, 400);
    for (const tag of tags) {
      const idx = share.tags.findIndex((t) => t.key === tag.key);
      if (idx >= 0) share.tags[idx] = tag;
      else share.tags.push(tag);
    }
    this.shares.set(arn, share);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const share = this.shares.get(arn);
    if (!share) throw new AwsError("UnknownResourceException", `Resource ${arn} not found.`, 400);
    const keysToRemove = new Set(tagKeys);
    share.tags = share.tags.filter((t) => !keysToRemove.has(t.key));
    this.shares.set(arn, share);
  }

  listTagsForResource(arn: string): { key: string; value: string }[] {
    const share = this.shares.get(arn);
    if (!share) throw new AwsError("UnknownResourceException", `Resource ${arn} not found.`, 400);
    return share.tags;
  }

  private guessResourceType(arn: string): string {
    if (arn.includes(":subnet/")) return "ec2:Subnet";
    if (arn.includes(":transit-gateway/")) return "ec2:TransitGateway";
    return "unknown";
  }

  formatResourceShare(share: ResourceShare): Record<string, any> {
    return {
      resourceShareArn: share.resourceShareArn,
      name: share.name,
      owningAccountId: share.owningAccountId,
      allowExternalPrincipals: share.allowExternalPrincipals,
      status: share.status,
      creationTime: share.creationTime,
      lastUpdatedTime: share.lastUpdatedTime,
      tags: share.tags,
    };
  }
}
