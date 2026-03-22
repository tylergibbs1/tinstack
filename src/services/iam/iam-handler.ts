import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlEnvelopeNoResult, xmlResponse, AWS_NAMESPACES } from "../../core/xml";
import type { IamService } from "./iam-service";

const NS = AWS_NAMESPACES.IAM;

export class IamQueryHandler {
  constructor(private service: IamService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateRole": return this.createRole(params, ctx);
        case "GetRole": return this.getRole(params, ctx);
        case "DeleteRole": return this.deleteRole(params, ctx);
        case "ListRoles": return this.listRoles(params, ctx);
        case "AttachRolePolicy": return this.attachRolePolicy(params, ctx);
        case "DetachRolePolicy": return this.detachRolePolicy(params, ctx);
        case "PutRolePolicy": return this.putRolePolicy(params, ctx);
        case "DeleteRolePolicy": return this.deleteRolePolicy(params, ctx);
        case "CreateUser": return this.createUser(params, ctx);
        case "GetUser": return this.getUser(params, ctx);
        case "DeleteUser": return this.deleteUser(params, ctx);
        case "ListUsers": return this.listUsers(params, ctx);
        case "CreatePolicy": return this.createPolicy(params, ctx);
        case "DeletePolicy": return this.deletePolicy(params, ctx);
        case "ListPolicies": return this.listPolicies(params, ctx);
        case "ListRolePolicies": return this.listRolePolicies(params, ctx);
        case "GetPolicy": return this.getPolicy(params, ctx);
        case "GetPolicyVersion": return this.getPolicyVersion(params, ctx);
        case "ListAttachedRolePolicies": return this.listAttachedRolePolicies(params, ctx);
        case "ListPolicyVersions": {
          const policyArn = params.get("PolicyArn")!;
          const versions = this.service.listPolicyVersions(policyArn);
          const xml = new XmlBuilder().start("Versions");
          for (const v of versions) {
            xml.start("member")
              .elem("VersionId", v.versionId)
              .elem("IsDefaultVersion", String(v.isDefaultVersion))
              .elem("Document", encodeURIComponent(v.document))
              .elem("CreateDate", v.createDate)
              .end("member");
          }
          xml.end("Versions").elem("IsTruncated", "false");
          return xmlResponse(xmlEnvelope("ListPolicyVersions", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "CreatePolicyVersion": return this.handleCreatePolicyVersion(params, ctx);
        case "DeletePolicyVersion": return this.handleDeletePolicyVersion(params, ctx);
        case "SetDefaultPolicyVersion": return this.handleSetDefaultPolicyVersion(params, ctx);
        case "ListInstanceProfilesForRole": return this.listInstanceProfilesForRole(params, ctx);
        // Groups
        case "CreateGroup": return this.createGroup(params, ctx);
        case "GetGroup": return this.handleGetGroup(params, ctx);
        case "ListGroups": return this.handleListGroups(params, ctx);
        case "DeleteGroup": return this.handleDeleteGroup(params, ctx);
        case "AddUserToGroup": return this.handleAddUserToGroup(params, ctx);
        case "RemoveUserFromGroup": return this.handleRemoveUserFromGroup(params, ctx);
        case "ListGroupsForUser": return this.handleListGroupsForUser(params, ctx);
        case "PutGroupPolicy": return this.handlePutGroupPolicy(params, ctx);
        case "GetGroupPolicy": return this.handleGetGroupPolicy(params, ctx);
        case "ListGroupPolicies": return this.handleListGroupPolicies(params, ctx);
        case "DeleteGroupPolicy": return this.handleDeleteGroupPolicy(params, ctx);
        // Access Keys
        case "CreateAccessKey": return this.handleCreateAccessKey(params, ctx);
        case "ListAccessKeys": return this.handleListAccessKeys(params, ctx);
        case "DeleteAccessKey": return this.handleDeleteAccessKey(params, ctx);
        case "UpdateAccessKey": return this.handleUpdateAccessKey(params, ctx);
        case "GetAccessKeyLastUsed": return this.handleGetAccessKeyLastUsed(params, ctx);
        // Instance Profiles
        case "CreateInstanceProfile": return this.handleCreateInstanceProfile(params, ctx);
        case "GetInstanceProfile": return this.handleGetInstanceProfile(params, ctx);
        case "ListInstanceProfiles": return this.handleListInstanceProfiles(params, ctx);
        case "DeleteInstanceProfile": return this.handleDeleteInstanceProfile(params, ctx);
        case "AddRoleToInstanceProfile": return this.handleAddRoleToInstanceProfile(params, ctx);
        case "RemoveRoleFromInstanceProfile": return this.handleRemoveRoleFromInstanceProfile(params, ctx);
        // User Policies
        case "PutUserPolicy": return this.handlePutUserPolicy(params, ctx);
        case "GetUserPolicy": return this.handleGetUserPolicy(params, ctx);
        case "ListUserPolicies": return this.handleListUserPolicies(params, ctx);
        case "DeleteUserPolicy": return this.handleDeleteUserPolicy(params, ctx);
        case "AttachUserPolicy": return this.handleAttachUserPolicy(params, ctx);
        case "DetachUserPolicy": return this.handleDetachUserPolicy(params, ctx);
        case "ListAttachedUserPolicies": return this.handleListAttachedUserPolicies(params, ctx);
        // Role extras
        case "UpdateRole": return this.handleUpdateRole(params, ctx);
        case "UpdateAssumeRolePolicy": return this.handleUpdateAssumeRolePolicy(params, ctx);
        case "GetRolePolicy": return this.handleGetRolePolicy(params, ctx);
        case "TagRole": return this.handleTagRole(params, ctx);
        case "UntagRole": return this.handleUntagRole(params, ctx);
        case "ListRoleTags": return this.handleListRoleTags(params, ctx);
        // User extras
        case "UpdateUser": return this.handleUpdateUser(params, ctx);
        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private roleFieldsXml(role: any): string {
    const xml = new XmlBuilder()
      .elem("RoleName", role.roleName)
      .elem("RoleId", role.roleId)
      .elem("Arn", role.arn)
      .elem("Path", role.path)
      .elem("CreateDate", role.createDate)
      .elem("AssumeRolePolicyDocument", encodeURIComponent(role.assumeRolePolicyDocument));
    if (role.description) xml.elem("Description", role.description);
    if (role.tags && Object.keys(role.tags).length > 0) {
      xml.start("Tags");
      for (const [k, v] of Object.entries(role.tags)) {
        xml.start("member").elem("Key", k).elem("Value", v as string).end("member");
      }
      xml.end("Tags");
    }
    return xml.build();
  }

  private roleXml(role: any): string {
    return new XmlBuilder()
      .start("Role")
      .raw(this.roleFieldsXml(role))
      .end("Role")
      .build();
  }

  private createRole(params: URLSearchParams, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    let i = 1;
    while (params.has(`Tags.member.${i}.Key`)) {
      tags[params.get(`Tags.member.${i}.Key`)!] = params.get(`Tags.member.${i}.Value`)!;
      i++;
    }
    const role = this.service.createRole(
      params.get("RoleName")!,
      params.get("AssumeRolePolicyDocument") ?? "{}",
      params.get("Path") ?? "/",
      params.get("Description") ?? undefined,
      tags,
    );
    return xmlResponse(xmlEnvelope("CreateRole", ctx.requestId, this.roleXml(role), NS), ctx.requestId);
  }

  private getRole(params: URLSearchParams, ctx: RequestContext): Response {
    const role = this.service.getRole(params.get("RoleName")!);
    return xmlResponse(xmlEnvelope("GetRole", ctx.requestId, this.roleXml(role), NS), ctx.requestId);
  }

  private deleteRole(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteRole(params.get("RoleName")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteRole", ctx.requestId, NS), ctx.requestId);
  }

  private listRoles(params: URLSearchParams, ctx: RequestContext): Response {
    const roles = this.service.listRoles(params.get("PathPrefix") ?? undefined);
    const xml = new XmlBuilder().start("Roles");
    for (const r of roles) xml.raw(`<member>${this.roleFieldsXml(r)}</member>`);
    xml.end("Roles").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListRoles", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private attachRolePolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.attachRolePolicy(params.get("RoleName")!, params.get("PolicyArn")!);
    return xmlResponse(xmlEnvelopeNoResult("AttachRolePolicy", ctx.requestId, NS), ctx.requestId);
  }

  private detachRolePolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.detachRolePolicy(params.get("RoleName")!, params.get("PolicyArn")!);
    return xmlResponse(xmlEnvelopeNoResult("DetachRolePolicy", ctx.requestId, NS), ctx.requestId);
  }

  private putRolePolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.putRolePolicy(params.get("RoleName")!, params.get("PolicyName")!, params.get("PolicyDocument") ?? "{}");
    return xmlResponse(xmlEnvelopeNoResult("PutRolePolicy", ctx.requestId, NS), ctx.requestId);
  }

  private deleteRolePolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteRolePolicy(params.get("RoleName")!, params.get("PolicyName")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteRolePolicy", ctx.requestId, NS), ctx.requestId);
  }

  private createUser(params: URLSearchParams, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    let i = 1;
    while (params.has(`Tags.member.${i}.Key`)) {
      tags[params.get(`Tags.member.${i}.Key`)!] = params.get(`Tags.member.${i}.Value`)!;
      i++;
    }
    const user = this.service.createUser(params.get("UserName")!, params.get("Path") ?? "/", tags);
    const result = new XmlBuilder()
      .start("User")
        .elem("UserName", user.userName)
        .elem("UserId", user.userId)
        .elem("Arn", user.arn)
        .elem("Path", user.path)
        .elem("CreateDate", user.createDate)
      .end("User")
      .build();
    return xmlResponse(xmlEnvelope("CreateUser", ctx.requestId, result, NS), ctx.requestId);
  }

  private getUser(params: URLSearchParams, ctx: RequestContext): Response {
    const user = this.service.getUser(params.get("UserName")!);
    const result = new XmlBuilder()
      .start("User")
        .elem("UserName", user.userName)
        .elem("UserId", user.userId)
        .elem("Arn", user.arn)
        .elem("Path", user.path)
        .elem("CreateDate", user.createDate)
      .end("User")
      .build();
    return xmlResponse(xmlEnvelope("GetUser", ctx.requestId, result, NS), ctx.requestId);
  }

  private deleteUser(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteUser(params.get("UserName")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteUser", ctx.requestId, NS), ctx.requestId);
  }

  private listUsers(params: URLSearchParams, ctx: RequestContext): Response {
    const users = this.service.listUsers(params.get("PathPrefix") ?? undefined);
    const xml = new XmlBuilder().start("Users");
    for (const u of users) {
      xml.start("member")
        .elem("UserName", u.userName).elem("UserId", u.userId)
        .elem("Arn", u.arn).elem("Path", u.path).elem("CreateDate", u.createDate)
        .end("member");
    }
    xml.end("Users").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListUsers", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private createPolicy(params: URLSearchParams, ctx: RequestContext): Response {
    const policy = this.service.createPolicy(
      params.get("PolicyName")!, params.get("PolicyDocument") ?? "{}",
      params.get("Path") ?? "/", params.get("Description") ?? undefined,
    );
    const result = new XmlBuilder()
      .start("Policy")
        .elem("PolicyName", policy.policyName).elem("PolicyId", policy.policyId)
        .elem("Arn", policy.arn).elem("Path", policy.path)
        .elem("DefaultVersionId", policy.defaultVersionId)
        .elem("CreateDate", policy.createDate)
      .end("Policy")
      .build();
    return xmlResponse(xmlEnvelope("CreatePolicy", ctx.requestId, result, NS), ctx.requestId);
  }

  private deletePolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deletePolicy(params.get("PolicyArn")!);
    return xmlResponse(xmlEnvelopeNoResult("DeletePolicy", ctx.requestId, NS), ctx.requestId);
  }

  private listPolicies(params: URLSearchParams, ctx: RequestContext): Response {
    const policies = this.service.listPolicies();
    const xml = new XmlBuilder().start("Policies");
    for (const p of policies) {
      xml.start("member")
        .elem("PolicyName", p.policyName).elem("PolicyId", p.policyId)
        .elem("Arn", p.arn).elem("Path", p.path)
        .elem("DefaultVersionId", p.defaultVersionId).elem("CreateDate", p.createDate)
        .end("member");
    }
    xml.end("Policies").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListPolicies", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private listRolePolicies(params: URLSearchParams, ctx: RequestContext): Response {
    const policyNames = this.service.listRolePolicies(params.get("RoleName")!);
    const xml = new XmlBuilder().start("PolicyNames");
    for (const name of policyNames) {
      xml.elem("member", name);
    }
    xml.end("PolicyNames").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListRolePolicies", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private getPolicy(params: URLSearchParams, ctx: RequestContext): Response {
    const policy = this.service.getPolicy(params.get("PolicyArn")!);
    const result = new XmlBuilder()
      .start("Policy")
        .elem("PolicyName", policy.policyName).elem("PolicyId", policy.policyId)
        .elem("Arn", policy.arn).elem("Path", policy.path)
        .elem("DefaultVersionId", policy.defaultVersionId)
        .elem("AttachmentCount", policy.attachmentCount)
        .elem("IsAttachable", true)
        .elem("CreateDate", policy.createDate)
      .end("Policy")
      .build();
    return xmlResponse(xmlEnvelope("GetPolicy", ctx.requestId, result, NS), ctx.requestId);
  }

  private getPolicyVersion(params: URLSearchParams, ctx: RequestContext): Response {
    const version = this.service.getPolicyVersion(params.get("PolicyArn")!, params.get("VersionId")!);
    const result = new XmlBuilder()
      .start("PolicyVersion")
        .elem("Document", encodeURIComponent(version.document))
        .elem("VersionId", version.versionId)
        .elem("IsDefaultVersion", version.isDefaultVersion)
        .elem("CreateDate", version.createDate)
      .end("PolicyVersion")
      .build();
    return xmlResponse(xmlEnvelope("GetPolicyVersion", ctx.requestId, result, NS), ctx.requestId);
  }

  private listAttachedRolePolicies(params: URLSearchParams, ctx: RequestContext): Response {
    const policies = this.service.listAttachedRolePolicies(params.get("RoleName")!);
    const xml = new XmlBuilder().start("AttachedPolicies");
    for (const p of policies) {
      xml.start("member")
        .elem("PolicyName", p.policyName)
        .elem("PolicyArn", p.policyArn)
        .end("member");
    }
    xml.end("AttachedPolicies").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListAttachedRolePolicies", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Instance Profiles for Role ---

  private listInstanceProfilesForRole(params: URLSearchParams, ctx: RequestContext): Response {
    const roleName = params.get("RoleName")!;
    const profiles = this.service.listInstanceProfilesForRole(roleName);
    const xml = new XmlBuilder().start("InstanceProfiles");
    for (const p of profiles) {
      xml.raw(`<member>${this.instanceProfileFieldsXml(p)}</member>`);
    }
    xml.end("InstanceProfiles").elem("IsTruncated", "false");
    return xmlResponse(xmlEnvelope("ListInstanceProfilesForRole", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Groups ---

  private groupFieldsXml(group: any): string {
    return new XmlBuilder()
      .elem("GroupName", group.groupName)
      .elem("GroupId", group.groupId)
      .elem("Arn", group.arn)
      .elem("Path", group.path)
      .elem("CreateDate", group.createDate)
      .build();
  }

  private createGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const group = this.service.createGroup(params.get("GroupName")!, params.get("Path") ?? "/");
    const result = new XmlBuilder()
      .start("Group").raw(this.groupFieldsXml(group)).end("Group")
      .build();
    return xmlResponse(xmlEnvelope("CreateGroup", ctx.requestId, result, NS), ctx.requestId);
  }

  private handleGetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const { group, users } = this.service.getGroup(params.get("GroupName")!);
    const xml = new XmlBuilder()
      .start("Group").raw(this.groupFieldsXml(group)).end("Group")
      .start("Users");
    for (const u of users) {
      xml.start("member")
        .elem("UserName", u.userName).elem("UserId", u.userId)
        .elem("Arn", u.arn).elem("Path", u.path).elem("CreateDate", u.createDate)
        .end("member");
    }
    xml.end("Users").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("GetGroup", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private handleListGroups(params: URLSearchParams, ctx: RequestContext): Response {
    const groups = this.service.listGroups(params.get("PathPrefix") ?? undefined);
    const xml = new XmlBuilder().start("Groups");
    for (const g of groups) xml.raw(`<member>${this.groupFieldsXml(g)}</member>`);
    xml.end("Groups").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListGroups", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private handleDeleteGroup(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteGroup(params.get("GroupName")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteGroup", ctx.requestId, NS), ctx.requestId);
  }

  private handleAddUserToGroup(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.addUserToGroup(params.get("GroupName")!, params.get("UserName")!);
    return xmlResponse(xmlEnvelopeNoResult("AddUserToGroup", ctx.requestId, NS), ctx.requestId);
  }

  private handleRemoveUserFromGroup(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.removeUserFromGroup(params.get("GroupName")!, params.get("UserName")!);
    return xmlResponse(xmlEnvelopeNoResult("RemoveUserFromGroup", ctx.requestId, NS), ctx.requestId);
  }

  private handleListGroupsForUser(params: URLSearchParams, ctx: RequestContext): Response {
    const groups = this.service.listGroupsForUser(params.get("UserName")!);
    const xml = new XmlBuilder().start("Groups");
    for (const g of groups) xml.raw(`<member>${this.groupFieldsXml(g)}</member>`);
    xml.end("Groups").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListGroupsForUser", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private handlePutGroupPolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.putGroupPolicy(params.get("GroupName")!, params.get("PolicyName")!, params.get("PolicyDocument") ?? "{}");
    return xmlResponse(xmlEnvelopeNoResult("PutGroupPolicy", ctx.requestId, NS), ctx.requestId);
  }

  private handleGetGroupPolicy(params: URLSearchParams, ctx: RequestContext): Response {
    const result = this.service.getGroupPolicy(params.get("GroupName")!, params.get("PolicyName")!);
    const xml = new XmlBuilder()
      .elem("GroupName", result.groupName)
      .elem("PolicyName", result.policyName)
      .elem("PolicyDocument", encodeURIComponent(result.policyDocument));
    return xmlResponse(xmlEnvelope("GetGroupPolicy", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private handleListGroupPolicies(params: URLSearchParams, ctx: RequestContext): Response {
    const policyNames = this.service.listGroupPolicies(params.get("GroupName")!);
    const xml = new XmlBuilder().start("PolicyNames");
    for (const name of policyNames) xml.elem("member", name);
    xml.end("PolicyNames").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListGroupPolicies", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private handleDeleteGroupPolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteGroupPolicy(params.get("GroupName")!, params.get("PolicyName")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteGroupPolicy", ctx.requestId, NS), ctx.requestId);
  }

  // --- Access Keys ---

  private handleCreateAccessKey(params: URLSearchParams, ctx: RequestContext): Response {
    const key = this.service.createAccessKey(params.get("UserName")!);
    const xml = new XmlBuilder()
      .start("AccessKey")
        .elem("UserName", key.userName)
        .elem("AccessKeyId", key.accessKeyId)
        .elem("Status", key.status)
        .elem("SecretAccessKey", key.secretAccessKey)
        .elem("CreateDate", key.createDate)
      .end("AccessKey");
    return xmlResponse(xmlEnvelope("CreateAccessKey", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private handleListAccessKeys(params: URLSearchParams, ctx: RequestContext): Response {
    const keys = this.service.listAccessKeys(params.get("UserName")!);
    const xml = new XmlBuilder().start("AccessKeyMetadata");
    for (const k of keys) {
      xml.start("member")
        .elem("UserName", k.userName)
        .elem("AccessKeyId", k.accessKeyId)
        .elem("Status", k.status)
        .elem("CreateDate", k.createDate)
        .end("member");
    }
    xml.end("AccessKeyMetadata").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListAccessKeys", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private handleDeleteAccessKey(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteAccessKey(params.get("UserName")!, params.get("AccessKeyId")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteAccessKey", ctx.requestId, NS), ctx.requestId);
  }

  private handleUpdateAccessKey(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.updateAccessKey(params.get("UserName")!, params.get("AccessKeyId")!, params.get("Status") as "Active" | "Inactive");
    return xmlResponse(xmlEnvelopeNoResult("UpdateAccessKey", ctx.requestId, NS), ctx.requestId);
  }

  private handleGetAccessKeyLastUsed(params: URLSearchParams, ctx: RequestContext): Response {
    const info = this.service.getAccessKeyLastUsed(params.get("AccessKeyId")!);
    const xml = new XmlBuilder()
      .elem("UserName", info.userName)
      .start("AccessKeyLastUsed")
        .elem("LastUsedDate", info.lastUsedDate)
        .elem("ServiceName", info.serviceName)
        .elem("Region", info.region)
      .end("AccessKeyLastUsed");
    return xmlResponse(xmlEnvelope("GetAccessKeyLastUsed", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Instance Profiles ---

  private instanceProfileFieldsXml(profile: any): string {
    const xml = new XmlBuilder()
      .elem("InstanceProfileName", profile.instanceProfileName)
      .elem("InstanceProfileId", profile.instanceProfileId)
      .elem("Arn", profile.arn)
      .elem("Path", profile.path)
      .elem("CreateDate", profile.createDate)
      .start("Roles");
    for (const roleName of profile.roles) {
      try {
        const role = this.service.getRole(roleName);
        xml.raw(`<member>${this.roleFieldsXml(role)}</member>`);
      } catch { /* role may have been deleted */ }
    }
    xml.end("Roles");
    return xml.build();
  }

  private handleCreateInstanceProfile(params: URLSearchParams, ctx: RequestContext): Response {
    const profile = this.service.createInstanceProfile(params.get("InstanceProfileName")!, params.get("Path") ?? "/");
    const result = new XmlBuilder()
      .start("InstanceProfile").raw(this.instanceProfileFieldsXml(profile)).end("InstanceProfile")
      .build();
    return xmlResponse(xmlEnvelope("CreateInstanceProfile", ctx.requestId, result, NS), ctx.requestId);
  }

  private handleGetInstanceProfile(params: URLSearchParams, ctx: RequestContext): Response {
    const profile = this.service.getInstanceProfile(params.get("InstanceProfileName")!);
    const result = new XmlBuilder()
      .start("InstanceProfile").raw(this.instanceProfileFieldsXml(profile)).end("InstanceProfile")
      .build();
    return xmlResponse(xmlEnvelope("GetInstanceProfile", ctx.requestId, result, NS), ctx.requestId);
  }

  private handleListInstanceProfiles(params: URLSearchParams, ctx: RequestContext): Response {
    const profiles = this.service.listInstanceProfiles(params.get("PathPrefix") ?? undefined);
    const xml = new XmlBuilder().start("InstanceProfiles");
    for (const p of profiles) xml.raw(`<member>${this.instanceProfileFieldsXml(p)}</member>`);
    xml.end("InstanceProfiles").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListInstanceProfiles", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private handleDeleteInstanceProfile(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteInstanceProfile(params.get("InstanceProfileName")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteInstanceProfile", ctx.requestId, NS), ctx.requestId);
  }

  private handleAddRoleToInstanceProfile(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.addRoleToInstanceProfile(params.get("InstanceProfileName")!, params.get("RoleName")!);
    return xmlResponse(xmlEnvelopeNoResult("AddRoleToInstanceProfile", ctx.requestId, NS), ctx.requestId);
  }

  private handleRemoveRoleFromInstanceProfile(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.removeRoleFromInstanceProfile(params.get("InstanceProfileName")!, params.get("RoleName")!);
    return xmlResponse(xmlEnvelopeNoResult("RemoveRoleFromInstanceProfile", ctx.requestId, NS), ctx.requestId);
  }

  // --- User Policies ---

  private handlePutUserPolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.putUserPolicy(params.get("UserName")!, params.get("PolicyName")!, params.get("PolicyDocument") ?? "{}");
    return xmlResponse(xmlEnvelopeNoResult("PutUserPolicy", ctx.requestId, NS), ctx.requestId);
  }

  private handleGetUserPolicy(params: URLSearchParams, ctx: RequestContext): Response {
    const result = this.service.getUserPolicy(params.get("UserName")!, params.get("PolicyName")!);
    const xml = new XmlBuilder()
      .elem("UserName", result.userName)
      .elem("PolicyName", result.policyName)
      .elem("PolicyDocument", encodeURIComponent(result.policyDocument));
    return xmlResponse(xmlEnvelope("GetUserPolicy", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private handleListUserPolicies(params: URLSearchParams, ctx: RequestContext): Response {
    const policyNames = this.service.listUserPolicies(params.get("UserName")!);
    const xml = new XmlBuilder().start("PolicyNames");
    for (const name of policyNames) xml.elem("member", name);
    xml.end("PolicyNames").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListUserPolicies", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private handleDeleteUserPolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteUserPolicy(params.get("UserName")!, params.get("PolicyName")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteUserPolicy", ctx.requestId, NS), ctx.requestId);
  }

  private handleAttachUserPolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.attachUserPolicy(params.get("UserName")!, params.get("PolicyArn")!);
    return xmlResponse(xmlEnvelopeNoResult("AttachUserPolicy", ctx.requestId, NS), ctx.requestId);
  }

  private handleDetachUserPolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.detachUserPolicy(params.get("UserName")!, params.get("PolicyArn")!);
    return xmlResponse(xmlEnvelopeNoResult("DetachUserPolicy", ctx.requestId, NS), ctx.requestId);
  }

  private handleListAttachedUserPolicies(params: URLSearchParams, ctx: RequestContext): Response {
    const policies = this.service.listAttachedUserPolicies(params.get("UserName")!);
    const xml = new XmlBuilder().start("AttachedPolicies");
    for (const p of policies) {
      xml.start("member")
        .elem("PolicyName", p.policyName)
        .elem("PolicyArn", p.policyArn)
        .end("member");
    }
    xml.end("AttachedPolicies").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListAttachedUserPolicies", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Role extras ---

  private handleUpdateRole(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.updateRole(
      params.get("RoleName")!,
      params.get("Description") ?? undefined,
      params.has("MaxSessionDuration") ? parseInt(params.get("MaxSessionDuration")!) : undefined,
    );
    return xmlResponse(xmlEnvelopeNoResult("UpdateRole", ctx.requestId, NS), ctx.requestId);
  }

  private handleUpdateAssumeRolePolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.updateAssumeRolePolicy(params.get("RoleName")!, params.get("PolicyDocument") ?? "{}");
    return xmlResponse(xmlEnvelopeNoResult("UpdateAssumeRolePolicy", ctx.requestId, NS), ctx.requestId);
  }

  private handleGetRolePolicy(params: URLSearchParams, ctx: RequestContext): Response {
    const result = this.service.getRolePolicy(params.get("RoleName")!, params.get("PolicyName")!);
    const xml = new XmlBuilder()
      .elem("RoleName", result.roleName)
      .elem("PolicyName", result.policyName)
      .elem("PolicyDocument", encodeURIComponent(result.policyDocument));
    return xmlResponse(xmlEnvelope("GetRolePolicy", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private handleTagRole(params: URLSearchParams, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    let i = 1;
    while (params.has(`Tags.member.${i}.Key`)) {
      tags[params.get(`Tags.member.${i}.Key`)!] = params.get(`Tags.member.${i}.Value`)!;
      i++;
    }
    this.service.tagRole(params.get("RoleName")!, tags);
    return xmlResponse(xmlEnvelopeNoResult("TagRole", ctx.requestId, NS), ctx.requestId);
  }

  private handleUntagRole(params: URLSearchParams, ctx: RequestContext): Response {
    const tagKeys: string[] = [];
    let i = 1;
    while (params.has(`TagKeys.member.${i}`)) {
      tagKeys.push(params.get(`TagKeys.member.${i}`)!);
      i++;
    }
    this.service.untagRole(params.get("RoleName")!, tagKeys);
    return xmlResponse(xmlEnvelopeNoResult("UntagRole", ctx.requestId, NS), ctx.requestId);
  }

  private handleListRoleTags(params: URLSearchParams, ctx: RequestContext): Response {
    const tags = this.service.listRoleTags(params.get("RoleName")!);
    const xml = new XmlBuilder().start("Tags");
    for (const [k, v] of Object.entries(tags)) {
      xml.start("member").elem("Key", k).elem("Value", v).end("member");
    }
    xml.end("Tags").elem("IsTruncated", false);
    return xmlResponse(xmlEnvelope("ListRoleTags", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- User extras ---

  private handleUpdateUser(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.updateUser(
      params.get("UserName")!,
      params.get("NewUserName") ?? undefined,
      params.get("NewPath") ?? undefined,
    );
    return xmlResponse(xmlEnvelopeNoResult("UpdateUser", ctx.requestId, NS), ctx.requestId);
  }

  // --- Policy Versions ---

  private handleCreatePolicyVersion(params: URLSearchParams, ctx: RequestContext): Response {
    const version = this.service.createPolicyVersion(
      params.get("PolicyArn")!,
      params.get("PolicyDocument") ?? "{}",
      params.get("SetAsDefault") === "true",
    );
    const result = new XmlBuilder()
      .start("PolicyVersion")
        .elem("VersionId", version.versionId)
        .elem("IsDefaultVersion", String(version.isDefaultVersion))
        .elem("Document", encodeURIComponent(version.document))
        .elem("CreateDate", version.createDate)
      .end("PolicyVersion")
      .build();
    return xmlResponse(xmlEnvelope("CreatePolicyVersion", ctx.requestId, result, NS), ctx.requestId);
  }

  private handleDeletePolicyVersion(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deletePolicyVersion(params.get("PolicyArn")!, params.get("VersionId")!);
    return xmlResponse(xmlEnvelopeNoResult("DeletePolicyVersion", ctx.requestId, NS), ctx.requestId);
  }

  private handleSetDefaultPolicyVersion(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.setDefaultPolicyVersion(params.get("PolicyArn")!, params.get("VersionId")!);
    return xmlResponse(xmlEnvelopeNoResult("SetDefaultPolicyVersion", ctx.requestId, NS), ctx.requestId);
  }
}
