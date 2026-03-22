import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SSOAdminService } from "./ssoadmin-service";

export class SSOAdminHandler {
  constructor(private service: SSOAdminService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "ListInstances": return this.listInstances(ctx);
        case "CreatePermissionSet": return this.createPermissionSet(body, ctx);
        case "DescribePermissionSet": return this.describePermissionSet(body, ctx);
        case "ListPermissionSets": return this.listPermissionSets(body, ctx);
        case "DeletePermissionSet": return this.deletePermissionSet(body, ctx);
        case "CreateAccountAssignment": return this.createAccountAssignment(body, ctx);
        case "ListAccountAssignments": return this.listAccountAssignments(body, ctx);
        case "DeleteAccountAssignment": return this.deleteAccountAssignment(body, ctx);
        case "AttachManagedPolicyToPermissionSet": return this.attachManagedPolicy(body, ctx);
        case "ListManagedPoliciesInPermissionSet": return this.listManagedPolicies(body, ctx);
        case "DetachManagedPolicyFromPermissionSet": return this.detachManagedPolicy(body, ctx);
        case "TagResource": return this.tagResourceHandler(body, ctx);
        case "UntagResource": return this.untagResourceHandler(body, ctx);
        case "ListTagsForResource": return this.listTagsForResourceHandler(body, ctx);
        default:
          return jsonErrorResponse(new AwsError("InvalidOperationException", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private listInstances(ctx: RequestContext): Response {
    const instances = this.service.listInstances();
    return this.json({
      Instances: instances.map((i) => ({
        InstanceArn: i.instanceArn,
        IdentityStoreId: i.identityStoreId,
        OwnerAccountId: i.ownerAccountId,
        Status: i.status,
        CreatedDate: i.createdDate,
      })),
    }, ctx);
  }

  private createPermissionSet(body: any, ctx: RequestContext): Response {
    const ps = this.service.createPermissionSet(
      body.InstanceArn,
      body.Name,
      body.Description,
      body.SessionDuration,
      body.RelayState,
      body.Tags,
    );
    return this.json({
      PermissionSet: {
        PermissionSetArn: ps.permissionSetArn,
        Name: ps.name,
        Description: ps.description,
        SessionDuration: ps.sessionDuration,
        RelayState: ps.relayState,
        CreatedDate: ps.createdDate,
      },
    }, ctx);
  }

  private describePermissionSet(body: any, ctx: RequestContext): Response {
    const ps = this.service.describePermissionSet(body.InstanceArn, body.PermissionSetArn);
    return this.json({
      PermissionSet: {
        PermissionSetArn: ps.permissionSetArn,
        Name: ps.name,
        Description: ps.description,
        SessionDuration: ps.sessionDuration,
        RelayState: ps.relayState,
        CreatedDate: ps.createdDate,
      },
    }, ctx);
  }

  private listPermissionSets(body: any, ctx: RequestContext): Response {
    const arns = this.service.listPermissionSets(body.InstanceArn);
    return this.json({ PermissionSets: arns }, ctx);
  }

  private deletePermissionSet(body: any, ctx: RequestContext): Response {
    this.service.deletePermissionSet(body.InstanceArn, body.PermissionSetArn);
    return this.json({}, ctx);
  }

  private createAccountAssignment(body: any, ctx: RequestContext): Response {
    const assignment = this.service.createAccountAssignment(
      body.InstanceArn,
      body.TargetId,
      body.TargetType,
      body.PermissionSetArn,
      body.PrincipalType,
      body.PrincipalId,
    );
    return this.json({
      AccountAssignmentCreationStatus: {
        Status: "SUCCEEDED",
        RequestId: assignment.requestId,
        TargetId: assignment.targetId,
        TargetType: assignment.targetType,
        PermissionSetArn: assignment.permissionSetArn,
        PrincipalType: assignment.principalType,
        PrincipalId: assignment.principalId,
        CreatedDate: assignment.createdDate,
      },
    }, ctx);
  }

  private listAccountAssignments(body: any, ctx: RequestContext): Response {
    const assignments = this.service.listAccountAssignments(
      body.InstanceArn,
      body.AccountId,
      body.PermissionSetArn,
    );
    return this.json({
      AccountAssignments: assignments.map((a) => ({
        AccountId: a.targetId,
        PermissionSetArn: a.permissionSetArn,
        PrincipalType: a.principalType,
        PrincipalId: a.principalId,
      })),
    }, ctx);
  }

  private deleteAccountAssignment(body: any, ctx: RequestContext): Response {
    const assignment = this.service.deleteAccountAssignment(
      body.InstanceArn,
      body.TargetId,
      body.TargetType,
      body.PermissionSetArn,
      body.PrincipalType,
      body.PrincipalId,
    );
    return this.json({
      AccountAssignmentDeletionStatus: {
        Status: "SUCCEEDED",
        RequestId: assignment.requestId,
        TargetId: assignment.targetId,
        TargetType: assignment.targetType,
        PermissionSetArn: assignment.permissionSetArn,
        PrincipalType: assignment.principalType,
        PrincipalId: assignment.principalId,
      },
    }, ctx);
  }

  private attachManagedPolicy(body: any, ctx: RequestContext): Response {
    this.service.attachManagedPolicyToPermissionSet(
      body.InstanceArn,
      body.PermissionSetArn,
      body.ManagedPolicyArn,
    );
    return this.json({}, ctx);
  }

  private listManagedPolicies(body: any, ctx: RequestContext): Response {
    const policies = this.service.listManagedPoliciesInPermissionSet(
      body.InstanceArn,
      body.PermissionSetArn,
    );
    return this.json({
      AttachedManagedPolicies: policies.map((p) => ({
        Arn: p.arn,
        Name: p.name,
      })),
    }, ctx);
  }

  private detachManagedPolicy(body: any, ctx: RequestContext): Response {
    this.service.detachManagedPolicyFromPermissionSet(
      body.InstanceArn,
      body.PermissionSetArn,
      body.ManagedPolicyArn,
    );
    return this.json({}, ctx);
  }

  private tagResourceHandler(body: any, ctx: RequestContext): Response {
    this.service.tagResource(body.ResourceARN ?? body.InstanceArn, body.Tags);
    return this.json({}, ctx);
  }

  private untagResourceHandler(body: any, ctx: RequestContext): Response {
    this.service.untagResource(body.ResourceARN ?? body.InstanceArn, body.TagKeys);
    return this.json({}, ctx);
  }

  private listTagsForResourceHandler(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTagsForResource(body.ResourceARN ?? body.InstanceArn);
    return this.json({ Tags: tags }, ctx);
  }
}
