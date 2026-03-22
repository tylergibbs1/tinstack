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
}

export class IamService {
  private roles: StorageBackend<string, IamRole>;
  private users: StorageBackend<string, IamUser>;
  private policies: StorageBackend<string, IamPolicy>;

  constructor(private accountId: string) {
    this.roles = new InMemoryStorage();
    this.users = new InMemoryStorage();
    this.policies = new InMemoryStorage();
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
    const policy: IamPolicy = {
      policyName,
      policyId,
      arn: buildArn("iam", "", this.accountId, "policy/", policyName),
      path: path || "/",
      defaultVersionId: "v1",
      document: policyDocument,
      description,
      createDate: new Date().toISOString(),
      attachmentCount: 0,
    };
    this.policies.set(policy.arn, policy);
    return policy;
  }

  deletePolicy(policyArn: string): void {
    if (!this.policies.has(policyArn)) throw new AwsError("NoSuchEntity", `Policy ${policyArn} not found.`, 404);
    this.policies.delete(policyArn);
  }

  listPolicies(): IamPolicy[] {
    return this.policies.values();
  }
}
