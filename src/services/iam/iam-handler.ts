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
          const policy = this.service.getPolicy(policyArn);
          const xml = new XmlBuilder().start("Versions")
            .start("member")
            .elem("VersionId", "v1")
            .elem("IsDefaultVersion", "true")
            .elem("Document", encodeURIComponent(policy.policyDocument))
            .elem("CreateDate", policy.createDate)
            .end("member")
            .end("Versions")
            .elem("IsTruncated", "false");
          return xmlResponse(xmlEnvelope("ListPolicyVersions", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "ListInstanceProfilesForRole": {
          // Terraform checks this before deleting a role. Return empty list.
          const xml = new XmlBuilder().start("InstanceProfiles").end("InstanceProfiles").elem("IsTruncated", "false");
          return xmlResponse(xmlEnvelope("ListInstanceProfilesForRole", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
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
}
