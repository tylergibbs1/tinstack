import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { OrganizationsService } from "./organizations-service";

export class OrganizationsHandler {
  constructor(private service: OrganizationsService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateOrganization": return this.createOrganization(body, ctx);
        case "DescribeOrganization": return this.describeOrganization(ctx);
        case "ListAccounts": return this.listAccounts(ctx);
        case "CreateAccount": return this.createAccount(body, ctx);
        case "DescribeAccount": return this.describeAccount(body, ctx);
        case "CreateOrganizationalUnit": return this.createOrganizationalUnit(body, ctx);
        case "ListOrganizationalUnitsForParent": return this.listOrganizationalUnitsForParent(body, ctx);
        case "MoveAccount": return this.moveAccount(body, ctx);
        case "ListRoots": return this.listRoots(ctx);
        case "CreatePolicy": return this.createPolicy(body, ctx);
        case "ListPolicies": return this.listPolicies(body, ctx);
        case "AttachPolicy":
          this.service.attachPolicy(body.PolicyId, body.TargetId);
          return this.json({}, ctx);
        case "DetachPolicy":
          this.service.detachPolicy(body.PolicyId, body.TargetId);
          return this.json({}, ctx);
        case "ListChildren": return this.listChildren(body, ctx);
        case "TagResource":
          this.service.tagResource(body.ResourceId, body.Tags ?? []);
          return this.json({}, ctx);
        case "UntagResource":
          this.service.untagResource(body.ResourceId, body.TagKeys ?? []);
          return this.json({}, ctx);
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
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

  private createOrganization(body: any, ctx: RequestContext): Response {
    const org = this.service.createOrganization(body.FeatureSet, ctx.region);
    return this.json({
      Organization: {
        Id: org.id, Arn: org.arn, FeatureSet: org.featureSet,
        MasterAccountArn: org.masterAccountArn, MasterAccountId: org.masterAccountId,
        MasterAccountEmail: org.masterAccountEmail,
        AvailablePolicyTypes: org.availablePolicyTypes,
      },
    }, ctx);
  }

  private describeOrganization(ctx: RequestContext): Response {
    const org = this.service.describeOrganization();
    return this.json({
      Organization: {
        Id: org.id, Arn: org.arn, FeatureSet: org.featureSet,
        MasterAccountArn: org.masterAccountArn, MasterAccountId: org.masterAccountId,
        MasterAccountEmail: org.masterAccountEmail,
        AvailablePolicyTypes: org.availablePolicyTypes,
      },
    }, ctx);
  }

  private listAccounts(ctx: RequestContext): Response {
    const accounts = this.service.listAccounts();
    return this.json({
      Accounts: accounts.map((a) => ({
        Id: a.id, Arn: a.arn, Name: a.name, Email: a.email,
        Status: a.status, JoinedMethod: a.joinedMethod, JoinedTimestamp: a.joinedTimestamp,
      })),
    }, ctx);
  }

  private createAccount(body: any, ctx: RequestContext): Response {
    const account = this.service.createAccount(body.AccountName, body.Email);
    return this.json({
      CreateAccountStatus: {
        Id: crypto.randomUUID(), AccountName: account.name,
        State: "SUCCEEDED", AccountId: account.id,
        RequestedTimestamp: account.joinedTimestamp, CompletedTimestamp: account.joinedTimestamp,
      },
    }, ctx);
  }

  private describeAccount(body: any, ctx: RequestContext): Response {
    const account = this.service.describeAccount(body.AccountId);
    return this.json({
      Account: {
        Id: account.id, Arn: account.arn, Name: account.name, Email: account.email,
        Status: account.status, JoinedMethod: account.joinedMethod, JoinedTimestamp: account.joinedTimestamp,
      },
    }, ctx);
  }

  private createOrganizationalUnit(body: any, ctx: RequestContext): Response {
    const ou = this.service.createOrganizationalUnit(body.ParentId, body.Name);
    return this.json({
      OrganizationalUnit: { Id: ou.id, Arn: ou.arn, Name: ou.name },
    }, ctx);
  }

  private listOrganizationalUnitsForParent(body: any, ctx: RequestContext): Response {
    const ous = this.service.listOrganizationalUnitsForParent(body.ParentId);
    return this.json({
      OrganizationalUnits: ous.map((ou) => ({ Id: ou.id, Arn: ou.arn, Name: ou.name })),
    }, ctx);
  }

  private moveAccount(body: any, ctx: RequestContext): Response {
    this.service.moveAccount(body.AccountId, body.SourceParentId, body.DestinationParentId);
    return this.json({}, ctx);
  }

  private listRoots(ctx: RequestContext): Response {
    const roots = this.service.listRoots();
    return this.json({
      Roots: roots.map((r) => ({ Id: r.id, Arn: r.arn, Name: r.name, PolicyTypes: r.policyTypes })),
    }, ctx);
  }

  private createPolicy(body: any, ctx: RequestContext): Response {
    const policy = this.service.createPolicy(body.Name, body.Description, body.Content, body.Type);
    return this.json({
      Policy: {
        PolicySummary: {
          Id: policy.id, Arn: policy.arn, Name: policy.name,
          Description: policy.description, Type: policy.type, AwsManaged: policy.awsManaged,
        },
        Content: policy.content,
      },
    }, ctx);
  }

  private listPolicies(body: any, ctx: RequestContext): Response {
    const policies = this.service.listPolicies(body.Filter);
    return this.json({
      Policies: policies.map((p) => ({
        Id: p.id, Arn: p.arn, Name: p.name, Description: p.description,
        Type: p.type, AwsManaged: p.awsManaged,
      })),
    }, ctx);
  }

  private listChildren(body: any, ctx: RequestContext): Response {
    const children = this.service.listChildren(body.ParentId, body.ChildType);
    return this.json({ Children: children }, ctx);
  }
}
