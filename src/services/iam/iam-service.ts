import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface IamRole {
  roleName: string;
  roleId: string;
  arn: string;
  path: string;
  assumeRolePolicyDocument: string;
  description?: string;
  createDate: string;
  tags: Record<string, string>;
  attachedPolicies: string[];
  inlinePolicies: Record<string, string>;
}

export interface IamUser {
  userName: string;
  userId: string;
  arn: string;
  path: string;
  createDate: string;
  tags: Record<string, string>;
  attachedPolicies: string[];
  inlinePolicies: Record<string, string>;
}

export interface IamGroup {
  groupName: string;
  groupId: string;
  arn: string;
  path: string;
  createDate: string;
  users: string[];
  inlinePolicies: Record<string, string>;
}

export interface IamAccessKey {
  accessKeyId: string;
  secretAccessKey: string;
  userName: string;
  status: "Active" | "Inactive";
  createDate: string;
}

export interface IamInstanceProfile {
  instanceProfileName: string;
  instanceProfileId: string;
  arn: string;
  path: string;
  createDate: string;
  roles: string[];
}

export interface PolicyVersion {
  versionId: string;
  document: string;
  isDefaultVersion: boolean;
  createDate: string;
}

export interface IamPolicy {
  policyName: string;
  policyId: string;
  arn: string;
  path: string;
  defaultVersionId: string;
  document: string;
  description?: string;
  createDate: string;
  attachmentCount: number;
  versions: PolicyVersion[];
}

export class IamService {
  private roles: StorageBackend<string, IamRole>;
  private users: StorageBackend<string, IamUser>;
  private policies: StorageBackend<string, IamPolicy>;
  private groups: StorageBackend<string, IamGroup>;
  private accessKeys: StorageBackend<string, IamAccessKey>;
  private instanceProfiles: StorageBackend<string, IamInstanceProfile>;

  constructor(private accountId: string) {
    this.roles = new InMemoryStorage();
    this.users = new InMemoryStorage();
    this.policies = new InMemoryStorage();
    this.groups = new InMemoryStorage();
    this.accessKeys = new InMemoryStorage();
    this.instanceProfiles = new InMemoryStorage();
  }

  createRole(roleName: string, assumeRolePolicyDocument: string, path: string, description: string | undefined, tags: Record<string, string>): IamRole {
    if (this.roles.has(roleName)) {
      throw new AwsError("EntityAlreadyExists", `Role with name ${roleName} already exists.`, 409);
    }
    const roleId = `AROA${crypto.randomUUID().replace(/-/g, "").slice(0, 17).toUpperCase()}`;
    const role: IamRole = {
      roleName,
      roleId,
      arn: buildArn("iam", "", this.accountId, "role/", roleName),
      path: path || "/",
      assumeRolePolicyDocument,
      description,
      createDate: new Date().toISOString(),
      tags,
      attachedPolicies: [],
      inlinePolicies: {},
    };
    this.roles.set(roleName, role);
    return role;
  }

  getRole(roleName: string): IamRole {
    const role = this.roles.get(roleName);
    if (!role) throw new AwsError("NoSuchEntity", `Role ${roleName} not found.`, 404);
    return role;
  }

  deleteRole(roleName: string): void {
    if (!this.roles.has(roleName)) throw new AwsError("NoSuchEntity", `Role ${roleName} not found.`, 404);
    this.roles.delete(roleName);
  }

  listRoles(pathPrefix?: string): IamRole[] {
    return this.roles.values().filter((r) => !pathPrefix || r.path.startsWith(pathPrefix));
  }

  attachRolePolicy(roleName: string, policyArn: string): void {
    const role = this.getRole(roleName);
    if (!role.attachedPolicies.includes(policyArn)) role.attachedPolicies.push(policyArn);
  }

  detachRolePolicy(roleName: string, policyArn: string): void {
    const role = this.getRole(roleName);
    role.attachedPolicies = role.attachedPolicies.filter((p) => p !== policyArn);
  }

  putRolePolicy(roleName: string, policyName: string, policyDocument: string): void {
    const role = this.getRole(roleName);
    role.inlinePolicies[policyName] = policyDocument;
  }

  deleteRolePolicy(roleName: string, policyName: string): void {
    const role = this.getRole(roleName);
    delete role.inlinePolicies[policyName];
  }

  createUser(userName: string, path: string, tags: Record<string, string>): IamUser {
    if (this.users.has(userName)) {
      throw new AwsError("EntityAlreadyExists", `User with name ${userName} already exists.`, 409);
    }
    const user: IamUser = {
      userName,
      userId: `AIDA${crypto.randomUUID().replace(/-/g, "").slice(0, 17).toUpperCase()}`,
      arn: buildArn("iam", "", this.accountId, "user/", userName),
      path: path || "/",
      createDate: new Date().toISOString(),
      tags,
      attachedPolicies: [],
      inlinePolicies: {},
    };
    this.users.set(userName, user);
    return user;
  }

  getUser(userName: string): IamUser {
    const user = this.users.get(userName);
    if (!user) throw new AwsError("NoSuchEntity", `User ${userName} not found.`, 404);
    return user;
  }

  deleteUser(userName: string): void {
    if (!this.users.has(userName)) throw new AwsError("NoSuchEntity", `User ${userName} not found.`, 404);
    this.users.delete(userName);
  }

  listUsers(pathPrefix?: string): IamUser[] {
    return this.users.values().filter((u) => !pathPrefix || u.path.startsWith(pathPrefix));
  }

  createPolicy(policyName: string, policyDocument: string, path: string, description?: string): IamPolicy {
    const policyId = `ANPA${crypto.randomUUID().replace(/-/g, "").slice(0, 17).toUpperCase()}`;
    const now = new Date().toISOString();
    const policy: IamPolicy = {
      policyName,
      policyId,
      arn: buildArn("iam", "", this.accountId, "policy/", policyName),
      path: path || "/",
      defaultVersionId: "v1",
      document: policyDocument,
      description,
      createDate: now,
      attachmentCount: 0,
      versions: [{ versionId: "v1", document: policyDocument, isDefaultVersion: true, createDate: now }],
    };
    this.policies.set(policy.arn, policy);
    return policy;
  }

  getPolicy(policyArn: string): IamPolicy {
    const policy = this.policies.get(policyArn);
    if (!policy) throw new AwsError("NoSuchEntity", `Policy ${policyArn} not found.`, 404);
    return policy;
  }

  getPolicyVersion(policyArn: string, versionId: string): PolicyVersion {
    const policy = this.getPolicy(policyArn);
    const version = policy.versions.find((v) => v.versionId === versionId);
    if (!version) {
      throw new AwsError("NoSuchEntity", `Policy version ${versionId} not found.`, 404);
    }
    return version;
  }

  listPolicyVersions(policyArn: string): PolicyVersion[] {
    const policy = this.getPolicy(policyArn);
    return policy.versions;
  }

  createPolicyVersion(policyArn: string, policyDocument: string, setAsDefault: boolean): PolicyVersion {
    const policy = this.getPolicy(policyArn);
    if (policy.versions.length >= 5) {
      throw new AwsError("LimitExceeded", "A managed policy can have up to 5 versions.", 409);
    }
    const maxVersion = policy.versions.reduce((max, v) => {
      const num = parseInt(v.versionId.slice(1));
      return num > max ? num : max;
    }, 0);
    const newVersionId = `v${maxVersion + 1}`;
    const now = new Date().toISOString();
    const newVersion: PolicyVersion = {
      versionId: newVersionId,
      document: policyDocument,
      isDefaultVersion: setAsDefault,
      createDate: now,
    };
    if (setAsDefault) {
      for (const v of policy.versions) v.isDefaultVersion = false;
      policy.defaultVersionId = newVersionId;
      policy.document = policyDocument;
    }
    policy.versions.push(newVersion);
    return newVersion;
  }

  deletePolicyVersion(policyArn: string, versionId: string): void {
    const policy = this.getPolicy(policyArn);
    const version = policy.versions.find((v) => v.versionId === versionId);
    if (!version) {
      throw new AwsError("NoSuchEntity", `Policy version ${versionId} not found.`, 404);
    }
    if (version.isDefaultVersion) {
      throw new AwsError("DeleteConflict", "Cannot delete the default version of a policy.", 409);
    }
    policy.versions = policy.versions.filter((v) => v.versionId !== versionId);
  }

  setDefaultPolicyVersion(policyArn: string, versionId: string): void {
    const policy = this.getPolicy(policyArn);
    const version = policy.versions.find((v) => v.versionId === versionId);
    if (!version) {
      throw new AwsError("NoSuchEntity", `Policy version ${versionId} not found.`, 404);
    }
    for (const v of policy.versions) v.isDefaultVersion = false;
    version.isDefaultVersion = true;
    policy.defaultVersionId = versionId;
    policy.document = version.document;
  }

  listRolePolicies(roleName: string): string[] {
    const role = this.getRole(roleName);
    return Object.keys(role.inlinePolicies);
  }

  listAttachedRolePolicies(roleName: string): { policyName: string; policyArn: string }[] {
    const role = this.getRole(roleName);
    return role.attachedPolicies.map((arn) => {
      const policy = this.policies.get(arn);
      return { policyName: policy?.policyName ?? arn.split("/").pop()!, policyArn: arn };
    });
  }

  deletePolicy(policyArn: string): void {
    if (!this.policies.has(policyArn)) throw new AwsError("NoSuchEntity", `Policy ${policyArn} not found.`, 404);
    this.policies.delete(policyArn);
  }

  listPolicies(): IamPolicy[] {
    return this.policies.values();
  }

  // --- Groups ---

  createGroup(groupName: string, path: string): IamGroup {
    if (this.groups.has(groupName)) {
      throw new AwsError("EntityAlreadyExists", `Group with name ${groupName} already exists.`, 409);
    }
    const group: IamGroup = {
      groupName,
      groupId: `AGPA${crypto.randomUUID().replace(/-/g, "").slice(0, 17).toUpperCase()}`,
      arn: buildArn("iam", "", this.accountId, "group/", groupName),
      path: path || "/",
      createDate: new Date().toISOString(),
      users: [],
      inlinePolicies: {},
    };
    this.groups.set(groupName, group);
    return group;
  }

  getGroup(groupName: string): { group: IamGroup; users: IamUser[] } {
    const group = this.groups.get(groupName);
    if (!group) throw new AwsError("NoSuchEntity", `Group ${groupName} not found.`, 404);
    const users = group.users.map((u) => this.users.get(u)).filter((u): u is IamUser => !!u);
    return { group, users };
  }

  listGroups(pathPrefix?: string): IamGroup[] {
    return this.groups.values().filter((g) => !pathPrefix || g.path.startsWith(pathPrefix));
  }

  deleteGroup(groupName: string): void {
    if (!this.groups.has(groupName)) throw new AwsError("NoSuchEntity", `Group ${groupName} not found.`, 404);
    this.groups.delete(groupName);
  }

  addUserToGroup(groupName: string, userName: string): void {
    const { group } = this.getGroup(groupName);
    this.getUser(userName); // validate user exists
    if (!group.users.includes(userName)) group.users.push(userName);
  }

  removeUserFromGroup(groupName: string, userName: string): void {
    const { group } = this.getGroup(groupName);
    group.users = group.users.filter((u) => u !== userName);
  }

  listGroupsForUser(userName: string): IamGroup[] {
    this.getUser(userName); // validate user exists
    return this.groups.values().filter((g) => g.users.includes(userName));
  }

  putGroupPolicy(groupName: string, policyName: string, policyDocument: string): void {
    const { group } = this.getGroup(groupName);
    group.inlinePolicies[policyName] = policyDocument;
  }

  getGroupPolicy(groupName: string, policyName: string): { policyName: string; policyDocument: string; groupName: string } {
    const { group } = this.getGroup(groupName);
    const doc = group.inlinePolicies[policyName];
    if (doc === undefined) throw new AwsError("NoSuchEntity", `Policy ${policyName} not found on group ${groupName}.`, 404);
    return { policyName, policyDocument: doc, groupName };
  }

  listGroupPolicies(groupName: string): string[] {
    const { group } = this.getGroup(groupName);
    return Object.keys(group.inlinePolicies);
  }

  deleteGroupPolicy(groupName: string, policyName: string): void {
    const { group } = this.getGroup(groupName);
    if (!(policyName in group.inlinePolicies)) throw new AwsError("NoSuchEntity", `Policy ${policyName} not found on group ${groupName}.`, 404);
    delete group.inlinePolicies[policyName];
  }

  // --- Access Keys ---

  createAccessKey(userName: string): IamAccessKey {
    this.getUser(userName); // validate user exists
    const accessKey: IamAccessKey = {
      accessKeyId: `AKIA${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
      secretAccessKey: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8),
      userName,
      status: "Active",
      createDate: new Date().toISOString(),
    };
    this.accessKeys.set(accessKey.accessKeyId, accessKey);
    return accessKey;
  }

  listAccessKeys(userName: string): IamAccessKey[] {
    this.getUser(userName); // validate user exists
    return this.accessKeys.values().filter((k) => k.userName === userName);
  }

  deleteAccessKey(userName: string, accessKeyId: string): void {
    const key = this.accessKeys.get(accessKeyId);
    if (!key || key.userName !== userName) throw new AwsError("NoSuchEntity", `Access key ${accessKeyId} not found for user ${userName}.`, 404);
    this.accessKeys.delete(accessKeyId);
  }

  updateAccessKey(userName: string, accessKeyId: string, status: "Active" | "Inactive"): void {
    const key = this.accessKeys.get(accessKeyId);
    if (!key || key.userName !== userName) throw new AwsError("NoSuchEntity", `Access key ${accessKeyId} not found for user ${userName}.`, 404);
    key.status = status;
  }

  getAccessKeyLastUsed(accessKeyId: string): { userName: string; lastUsedDate: string; serviceName: string; region: string } {
    const key = this.accessKeys.get(accessKeyId);
    if (!key) throw new AwsError("NoSuchEntity", `Access key ${accessKeyId} not found.`, 404);
    return {
      userName: key.userName,
      lastUsedDate: new Date().toISOString(),
      serviceName: "N/A",
      region: "N/A",
    };
  }

  // --- Instance Profiles ---

  createInstanceProfile(instanceProfileName: string, path: string): IamInstanceProfile {
    if (this.instanceProfiles.has(instanceProfileName)) {
      throw new AwsError("EntityAlreadyExists", `Instance profile ${instanceProfileName} already exists.`, 409);
    }
    const profile: IamInstanceProfile = {
      instanceProfileName,
      instanceProfileId: `AIPA${crypto.randomUUID().replace(/-/g, "").slice(0, 17).toUpperCase()}`,
      arn: buildArn("iam", "", this.accountId, "instance-profile/", instanceProfileName),
      path: path || "/",
      createDate: new Date().toISOString(),
      roles: [],
    };
    this.instanceProfiles.set(instanceProfileName, profile);
    return profile;
  }

  getInstanceProfile(instanceProfileName: string): IamInstanceProfile {
    const profile = this.instanceProfiles.get(instanceProfileName);
    if (!profile) throw new AwsError("NoSuchEntity", `Instance profile ${instanceProfileName} not found.`, 404);
    return profile;
  }

  listInstanceProfiles(pathPrefix?: string): IamInstanceProfile[] {
    return this.instanceProfiles.values().filter((p) => !pathPrefix || p.path.startsWith(pathPrefix));
  }

  deleteInstanceProfile(instanceProfileName: string): void {
    if (!this.instanceProfiles.has(instanceProfileName)) throw new AwsError("NoSuchEntity", `Instance profile ${instanceProfileName} not found.`, 404);
    this.instanceProfiles.delete(instanceProfileName);
  }

  addRoleToInstanceProfile(instanceProfileName: string, roleName: string): void {
    const profile = this.getInstanceProfile(instanceProfileName);
    this.getRole(roleName); // validate role exists
    if (profile.roles.length > 0) {
      throw new AwsError("LimitExceeded", "An instance profile can have only one role.", 409);
    }
    profile.roles.push(roleName);
  }

  removeRoleFromInstanceProfile(instanceProfileName: string, roleName: string): void {
    const profile = this.getInstanceProfile(instanceProfileName);
    profile.roles = profile.roles.filter((r) => r !== roleName);
  }

  listInstanceProfilesForRole(roleName: string): IamInstanceProfile[] {
    this.getRole(roleName); // validate role exists
    return this.instanceProfiles.values().filter((p) => p.roles.includes(roleName));
  }

  // --- User Policies ---

  putUserPolicy(userName: string, policyName: string, policyDocument: string): void {
    const user = this.getUser(userName);
    user.inlinePolicies[policyName] = policyDocument;
  }

  getUserPolicy(userName: string, policyName: string): { policyName: string; policyDocument: string; userName: string } {
    const user = this.getUser(userName);
    const doc = user.inlinePolicies[policyName];
    if (doc === undefined) throw new AwsError("NoSuchEntity", `Policy ${policyName} not found on user ${userName}.`, 404);
    return { policyName, policyDocument: doc, userName };
  }

  listUserPolicies(userName: string): string[] {
    const user = this.getUser(userName);
    return Object.keys(user.inlinePolicies);
  }

  deleteUserPolicy(userName: string, policyName: string): void {
    const user = this.getUser(userName);
    if (!(policyName in user.inlinePolicies)) throw new AwsError("NoSuchEntity", `Policy ${policyName} not found on user ${userName}.`, 404);
    delete user.inlinePolicies[policyName];
  }

  attachUserPolicy(userName: string, policyArn: string): void {
    const user = this.getUser(userName);
    if (!user.attachedPolicies.includes(policyArn)) user.attachedPolicies.push(policyArn);
  }

  detachUserPolicy(userName: string, policyArn: string): void {
    const user = this.getUser(userName);
    user.attachedPolicies = user.attachedPolicies.filter((p) => p !== policyArn);
  }

  listAttachedUserPolicies(userName: string): { policyName: string; policyArn: string }[] {
    const user = this.getUser(userName);
    return user.attachedPolicies.map((arn) => {
      const policy = this.policies.get(arn);
      return { policyName: policy?.policyName ?? arn.split("/").pop()!, policyArn: arn };
    });
  }

  // --- Role extras ---

  updateRole(roleName: string, description?: string, maxSessionDuration?: number): void {
    const role = this.getRole(roleName);
    if (description !== undefined) role.description = description;
    // maxSessionDuration stored but not modeled in the interface for simplicity
  }

  updateAssumeRolePolicy(roleName: string, policyDocument: string): void {
    const role = this.getRole(roleName);
    role.assumeRolePolicyDocument = policyDocument;
  }

  getRolePolicy(roleName: string, policyName: string): { policyName: string; policyDocument: string; roleName: string } {
    const role = this.getRole(roleName);
    const doc = role.inlinePolicies[policyName];
    if (doc === undefined) throw new AwsError("NoSuchEntity", `Policy ${policyName} not found on role ${roleName}.`, 404);
    return { policyName, policyDocument: doc, roleName };
  }

  tagRole(roleName: string, tags: Record<string, string>): void {
    const role = this.getRole(roleName);
    Object.assign(role.tags, tags);
  }

  untagRole(roleName: string, tagKeys: string[]): void {
    const role = this.getRole(roleName);
    for (const key of tagKeys) delete role.tags[key];
  }

  listRoleTags(roleName: string): Record<string, string> {
    const role = this.getRole(roleName);
    return role.tags;
  }

  // --- User extras ---

  updateUser(userName: string, newUserName?: string, newPath?: string): void {
    const user = this.getUser(userName);
    if (newUserName && newUserName !== userName) {
      if (this.users.has(newUserName)) {
        throw new AwsError("EntityAlreadyExists", `User with name ${newUserName} already exists.`, 409);
      }
      user.userName = newUserName;
      user.arn = buildArn("iam", "", this.accountId, "user/", newUserName);
      this.users.delete(userName);
      this.users.set(newUserName, user);
    }
    if (newPath !== undefined) user.path = newPath;
  }
}
