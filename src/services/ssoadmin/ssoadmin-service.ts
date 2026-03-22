import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface SSOInstance {
  instanceArn: string;
  identityStoreId: string;
  ownerAccountId: string;
  status: string;
  createdDate: number;
}

export interface PermissionSet {
  permissionSetArn: string;
  name: string;
  description: string;
  instanceArn: string;
  sessionDuration: string;
  relayState: string;
  createdDate: number;
  managedPolicies: ManagedPolicy[];
  tags: { Key: string; Value: string }[];
}

export interface ManagedPolicy {
  arn: string;
  name: string;
}

export interface AccountAssignment {
  instanceArn: string;
  targetId: string;
  targetType: string;
  permissionSetArn: string;
  principalType: string;
  principalId: string;
  createdDate: number;
  requestId: string;
}

export class SSOAdminService {
  private instances: SSOInstance[];
  private permissionSets: StorageBackend<string, PermissionSet>;
  private assignments: AccountAssignment[];
  private resourceTags: StorageBackend<string, { Key: string; Value: string }[]>;

  constructor(private accountId: string, private region: string) {
    this.permissionSets = new InMemoryStorage();
    this.assignments = [];
    this.resourceTags = new InMemoryStorage();

    // Create a default instance
    const instId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const storeId = `d-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    this.instances = [{
      instanceArn: `arn:aws:sso:::instance/ssoins-${instId}`,
      identityStoreId: storeId,
      ownerAccountId: accountId,
      status: "ACTIVE",
      createdDate: Date.now() / 1000,
    }];
  }

  listInstances(): SSOInstance[] {
    return this.instances;
  }

  // --- Permission Sets ---

  createPermissionSet(
    instanceArn: string,
    name: string,
    description: string | undefined,
    sessionDuration: string | undefined,
    relayState: string | undefined,
    tags: { Key: string; Value: string }[] | undefined,
  ): PermissionSet {
    const psId = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toLowerCase();
    const permissionSetArn = `${instanceArn}/ps-${psId}`;
    const ps: PermissionSet = {
      permissionSetArn,
      name,
      description: description ?? "",
      instanceArn,
      sessionDuration: sessionDuration ?? "PT1H",
      relayState: relayState ?? "",
      createdDate: Date.now() / 1000,
      managedPolicies: [],
      tags: tags ?? [],
    };
    this.permissionSets.set(permissionSetArn, ps);
    if (tags && tags.length > 0) {
      this.resourceTags.set(permissionSetArn, tags);
    }
    return ps;
  }

  describePermissionSet(instanceArn: string, permissionSetArn: string): PermissionSet {
    const ps = this.permissionSets.get(permissionSetArn);
    if (!ps || ps.instanceArn !== instanceArn) {
      const id = permissionSetArn.split("/").pop();
      throw new AwsError("ResourceNotFoundException", `Could not find PermissionSet with id ${id}`, 404);
    }
    return ps;
  }

  listPermissionSets(instanceArn: string): string[] {
    return this.permissionSets.values()
      .filter((ps) => ps.instanceArn === instanceArn)
      .map((ps) => ps.permissionSetArn);
  }

  deletePermissionSet(instanceArn: string, permissionSetArn: string): void {
    const ps = this.permissionSets.get(permissionSetArn);
    if (!ps || ps.instanceArn !== instanceArn) {
      throw new AwsError("ResourceNotFoundException", `PermissionSet not found.`, 404);
    }
    this.permissionSets.delete(permissionSetArn);
  }

  // --- Account Assignments ---

  createAccountAssignment(
    instanceArn: string,
    targetId: string,
    targetType: string,
    permissionSetArn: string,
    principalType: string,
    principalId: string,
  ): AccountAssignment {
    const assignment: AccountAssignment = {
      instanceArn,
      targetId,
      targetType,
      permissionSetArn,
      principalType,
      principalId,
      createdDate: Date.now() / 1000,
      requestId: crypto.randomUUID(),
    };
    this.assignments.push(assignment);
    return assignment;
  }

  listAccountAssignments(
    instanceArn: string,
    accountId: string,
    permissionSetArn: string,
  ): AccountAssignment[] {
    return this.assignments.filter(
      (a) => a.instanceArn === instanceArn && a.targetId === accountId && a.permissionSetArn === permissionSetArn,
    );
  }

  deleteAccountAssignment(
    instanceArn: string,
    targetId: string,
    targetType: string,
    permissionSetArn: string,
    principalType: string,
    principalId: string,
  ): AccountAssignment {
    const idx = this.assignments.findIndex(
      (a) =>
        a.instanceArn === instanceArn &&
        a.targetId === targetId &&
        a.targetType === targetType &&
        a.permissionSetArn === permissionSetArn &&
        a.principalType === principalType &&
        a.principalId === principalId,
    );
    if (idx === -1) {
      throw new AwsError("ResourceNotFoundException", "Account assignment not found.", 404);
    }
    const [removed] = this.assignments.splice(idx, 1);
    return removed;
  }

  // --- Managed Policies ---

  attachManagedPolicyToPermissionSet(
    instanceArn: string,
    permissionSetArn: string,
    managedPolicyArn: string,
  ): void {
    const ps = this.describePermissionSet(instanceArn, permissionSetArn);
    if (ps.managedPolicies.some((p) => p.arn === managedPolicyArn)) {
      throw new AwsError("ConflictException", `Policy ${managedPolicyArn} is already attached.`, 409);
    }
    const policyName = managedPolicyArn.split("/").pop() ?? managedPolicyArn;
    ps.managedPolicies.push({ arn: managedPolicyArn, name: policyName });
  }

  listManagedPoliciesInPermissionSet(
    instanceArn: string,
    permissionSetArn: string,
  ): ManagedPolicy[] {
    const ps = this.describePermissionSet(instanceArn, permissionSetArn);
    return ps.managedPolicies;
  }

  detachManagedPolicyFromPermissionSet(
    instanceArn: string,
    permissionSetArn: string,
    managedPolicyArn: string,
  ): void {
    const ps = this.describePermissionSet(instanceArn, permissionSetArn);
    const idx = ps.managedPolicies.findIndex((p) => p.arn === managedPolicyArn);
    if (idx === -1) {
      throw new AwsError("ResourceNotFoundException", `Policy ${managedPolicyArn} is not attached.`, 404);
    }
    ps.managedPolicies.splice(idx, 1);
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
