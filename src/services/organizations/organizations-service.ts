import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Organization {
  id: string;
  arn: string;
  featureSet: string;
  masterAccountId: string;
  masterAccountEmail: string;
  masterAccountArn: string;
  availablePolicyTypes: { Type: string; Status: string }[];
}

export interface OrgAccount {
  id: string;
  arn: string;
  name: string;
  email: string;
  status: string;
  joinedMethod: string;
  joinedTimestamp: number;
  parentId: string;
}

export interface OrganizationalUnit {
  id: string;
  arn: string;
  name: string;
  parentId: string;
}

export interface OrgPolicy {
  id: string;
  arn: string;
  name: string;
  description: string;
  type: string;
  content: string;
  awsManaged: boolean;
}

export interface OrgRoot {
  id: string;
  arn: string;
  name: string;
  policyTypes: { Type: string; Status: string }[];
}

export class OrganizationsService {
  private organization: Organization | null = null;
  private root: OrgRoot | null = null;
  private accounts = new Map<string, OrgAccount>();
  private ous = new Map<string, OrganizationalUnit>();
  private policies = new Map<string, OrgPolicy>();
  private policyAttachments = new Map<string, Set<string>>(); // policyId -> targetIds
  private tags = new Map<string, Record<string, string>>(); // resourceId -> tags

  constructor(private accountId: string) {}

  createOrganization(featureSet: string, region: string): Organization {
    if (this.organization) {
      throw new AwsError("AlreadyInOrganizationException", "The AWS account is already a member of an organization.", 400);
    }

    const orgId = `o-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const rootId = `r-${crypto.randomUUID().replace(/-/g, "").slice(0, 4)}`;

    this.organization = {
      id: orgId,
      arn: buildArn("organizations", "", this.accountId, "organization/", orgId),
      featureSet: featureSet || "ALL",
      masterAccountId: this.accountId,
      masterAccountEmail: `admin@${this.accountId}.example.com`,
      masterAccountArn: buildArn("organizations", "", this.accountId, `account/${orgId}/`, this.accountId),
      availablePolicyTypes: [{ Type: "SERVICE_CONTROL_POLICY", Status: "ENABLED" }],
    };

    this.root = {
      id: rootId,
      arn: buildArn("organizations", "", this.accountId, `root/${orgId}/`, rootId),
      name: "Root",
      policyTypes: [{ Type: "SERVICE_CONTROL_POLICY", Status: "ENABLED" }],
    };

    // Add master account
    this.accounts.set(this.accountId, {
      id: this.accountId,
      arn: this.organization.masterAccountArn,
      name: "Master Account",
      email: this.organization.masterAccountEmail,
      status: "ACTIVE",
      joinedMethod: "INVITED",
      joinedTimestamp: Date.now() / 1000,
      parentId: rootId,
    });

    return this.organization;
  }

  describeOrganization(): Organization {
    if (!this.organization) {
      throw new AwsError("AWSOrganizationsNotInUseException", "Your account is not a member of an organization.", 400);
    }
    return this.organization;
  }

  listAccounts(): OrgAccount[] {
    this.requireOrg();
    return Array.from(this.accounts.values());
  }

  createAccount(name: string, email: string): OrgAccount {
    this.requireOrg();
    const id = String(Math.floor(100000000000 + Math.random() * 900000000000));
    const account: OrgAccount = {
      id,
      arn: buildArn("organizations", "", this.accountId, `account/${this.organization!.id}/`, id),
      name,
      email,
      status: "ACTIVE",
      joinedMethod: "CREATED",
      joinedTimestamp: Date.now() / 1000,
      parentId: this.root!.id,
    };
    this.accounts.set(id, account);
    return account;
  }

  describeAccount(accountId: string): OrgAccount {
    this.requireOrg();
    const account = this.accounts.get(accountId);
    if (!account) throw new AwsError("AccountNotFoundException", `Account ${accountId} not found.`, 400);
    return account;
  }

  createOrganizationalUnit(parentId: string, name: string): OrganizationalUnit {
    this.requireOrg();
    // Check for duplicate name under same parent
    for (const ou of this.ous.values()) {
      if (ou.parentId === parentId && ou.name === name) {
        throw new AwsError("DuplicateOrganizationalUnitException", `An OU with name ${name} already exists under parent ${parentId}.`, 400);
      }
    }
    const ouId = `ou-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const ou: OrganizationalUnit = {
      id: ouId,
      arn: buildArn("organizations", "", this.accountId, `ou/${this.organization!.id}/`, ouId),
      name,
      parentId,
    };
    this.ous.set(ouId, ou);
    return ou;
  }

  listOrganizationalUnitsForParent(parentId: string): OrganizationalUnit[] {
    this.requireOrg();
    return Array.from(this.ous.values()).filter((ou) => ou.parentId === parentId);
  }

  moveAccount(accountId: string, sourceParentId: string, destinationParentId: string): void {
    this.requireOrg();
    const account = this.accounts.get(accountId);
    if (!account) throw new AwsError("AccountNotFoundException", `Account ${accountId} not found.`, 400);
    if (account.parentId !== sourceParentId) {
      throw new AwsError("SourceParentNotFoundException", `Source parent ${sourceParentId} not found for account.`, 400);
    }
    account.parentId = destinationParentId;
  }

  listRoots(): OrgRoot[] {
    this.requireOrg();
    return this.root ? [this.root] : [];
  }

  createPolicy(name: string, description: string, content: string, type: string): OrgPolicy {
    this.requireOrg();
    for (const p of this.policies.values()) {
      if (p.name === name && p.type === type) {
        throw new AwsError("DuplicatePolicyException", `A policy with name ${name} already exists.`, 400);
      }
    }
    const policyId = `p-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const policy: OrgPolicy = {
      id: policyId,
      arn: buildArn("organizations", "", this.accountId, `policy/${this.organization!.id}/`, `${type.toLowerCase()}/${policyId}`),
      name,
      description,
      type: type || "SERVICE_CONTROL_POLICY",
      content,
      awsManaged: false,
    };
    this.policies.set(policyId, policy);
    this.policyAttachments.set(policyId, new Set());
    return policy;
  }

  listPolicies(filter: string): OrgPolicy[] {
    this.requireOrg();
    if (filter) {
      return Array.from(this.policies.values()).filter((p) => p.type === filter);
    }
    return Array.from(this.policies.values());
  }

  attachPolicy(policyId: string, targetId: string): void {
    this.requireOrg();
    const policy = this.policies.get(policyId);
    if (!policy) throw new AwsError("PolicyNotFoundException", `Policy ${policyId} not found.`, 400);
    const targets = this.policyAttachments.get(policyId)!;
    targets.add(targetId);
  }

  detachPolicy(policyId: string, targetId: string): void {
    this.requireOrg();
    const policy = this.policies.get(policyId);
    if (!policy) throw new AwsError("PolicyNotFoundException", `Policy ${policyId} not found.`, 400);
    const targets = this.policyAttachments.get(policyId)!;
    targets.delete(targetId);
  }

  listChildren(parentId: string, childType: string): { Id: string; Type: string }[] {
    this.requireOrg();
    const children: { Id: string; Type: string }[] = [];
    if (childType === "ACCOUNT") {
      for (const acct of this.accounts.values()) {
        if (acct.parentId === parentId) children.push({ Id: acct.id, Type: "ACCOUNT" });
      }
    } else if (childType === "ORGANIZATIONAL_UNIT") {
      for (const ou of this.ous.values()) {
        if (ou.parentId === parentId) children.push({ Id: ou.id, Type: "ORGANIZATIONAL_UNIT" });
      }
    }
    return children;
  }

  tagResource(resourceId: string, tagsArr: { Key: string; Value: string }[]): void {
    this.requireOrg();
    const existing = this.tags.get(resourceId) ?? {};
    for (const t of tagsArr) existing[t.Key] = t.Value;
    this.tags.set(resourceId, existing);
  }

  untagResource(resourceId: string, tagKeys: string[]): void {
    this.requireOrg();
    const existing = this.tags.get(resourceId);
    if (existing) {
      for (const k of tagKeys) delete existing[k];
    }
  }

  listTagsForResource(resourceId: string): { Key: string; Value: string }[] {
    const existing = this.tags.get(resourceId) ?? {};
    return Object.entries(existing).map(([Key, Value]) => ({ Key, Value }));
  }

  private requireOrg(): void {
    if (!this.organization) {
      throw new AwsError("AWSOrganizationsNotInUseException", "Your account is not a member of an organization.", 400);
    }
  }
}
