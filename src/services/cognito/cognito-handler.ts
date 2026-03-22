import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CognitoService } from "./cognito-service";

export class CognitoHandler {
  constructor(private service: CognitoService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateUserPool": return this.createUserPool(body, ctx);
        case "DescribeUserPool": return this.describeUserPool(body, ctx);
        case "DeleteUserPool": this.service.deleteUserPool(body.UserPoolId, ctx.region); return this.json({}, ctx);
        case "ListUserPools": return this.json({ UserPools: this.service.listUserPools(ctx.region, body.MaxResults).map(poolSummary) }, ctx);
        case "UpdateUserPool": this.service.updateUserPool(body.UserPoolId, body, ctx.region); return this.json({}, ctx);
        case "CreateUserPoolClient": return this.createUserPoolClient(body, ctx);
        case "DescribeUserPoolClient": {
          const c = this.service.describeUserPoolClient(body.UserPoolId, body.ClientId, ctx.region);
          return this.json({ UserPoolClient: clientToJson(c) }, ctx);
        }
        case "DeleteUserPoolClient": this.service.deleteUserPoolClient(body.UserPoolId, body.ClientId, ctx.region); return this.json({}, ctx);
        case "ListUserPoolClients": return this.json({ UserPoolClients: this.service.listUserPoolClients(body.UserPoolId, ctx.region).map(clientSummary) }, ctx);
        case "SignUp": return this.signUp(body, ctx);
        case "ConfirmSignUp": this.service.confirmSignUp(body.UserPoolId ?? this.extractPoolId(body), body.Username, ctx.region); return this.json({}, ctx);
        case "AdminCreateUser": return this.adminCreateUser(body, ctx);
        case "AdminGetUser": return this.adminGetUser(body, ctx);
        case "AdminDeleteUser": this.service.adminDeleteUser(body.UserPoolId, body.Username, ctx.region); return this.json({}, ctx);
        case "AdminDisableUser": this.service.adminDisableUser(body.UserPoolId, body.Username, ctx.region); return this.json({}, ctx);
        case "AdminEnableUser": this.service.adminEnableUser(body.UserPoolId, body.Username, ctx.region); return this.json({}, ctx);
        case "AdminUpdateUserAttributes": this.service.adminUpdateUserAttributes(body.UserPoolId, body.Username, body.UserAttributes, ctx.region); return this.json({}, ctx);
        case "ListUsers": return this.json({ Users: this.service.listUsers(body.UserPoolId, ctx.region, body.Limit, body.Filter).map(userToJson) }, ctx);
        case "InitiateAuth":
        case "AdminInitiateAuth":
          return this.initiateAuth(body, ctx);
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

  private createUserPool(body: any, ctx: RequestContext): Response {
    const pool = this.service.createUserPool(body.PoolName, body.Policies, body.Schema, body.AutoVerifiedAttributes, ctx.region);
    return this.json({ UserPool: poolToJson(pool) }, ctx);
  }

  private describeUserPool(body: any, ctx: RequestContext): Response {
    const pool = this.service.describeUserPool(body.UserPoolId, ctx.region);
    return this.json({ UserPool: poolToJson(pool) }, ctx);
  }

  private createUserPoolClient(body: any, ctx: RequestContext): Response {
    const client = this.service.createUserPoolClient(body.UserPoolId, body.ClientName, body.ExplicitAuthFlows, ctx.region);
    return this.json({ UserPoolClient: clientToJson(client) }, ctx);
  }

  private signUp(body: any, ctx: RequestContext): Response {
    const user = this.service.signUp(body.UserPoolId ?? this.extractPoolId(body), body.Username, body.Password, body.UserAttributes ?? [], ctx.region);
    return this.json({
      UserConfirmed: user.confirmed,
      UserSub: user.attributes.sub,
    }, ctx);
  }

  private adminCreateUser(body: any, ctx: RequestContext): Response {
    const user = this.service.adminCreateUser(body.UserPoolId, body.Username, body.TemporaryPassword, body.UserAttributes ?? [], ctx.region);
    return this.json({ User: userToJson(user) }, ctx);
  }

  private adminGetUser(body: any, ctx: RequestContext): Response {
    const user = this.service.adminGetUser(body.UserPoolId, body.Username, ctx.region);
    return this.json({
      Username: user.username,
      UserAttributes: Object.entries(user.attributes).map(([Name, Value]) => ({ Name, Value })),
      Enabled: user.enabled,
      UserStatus: user.userStatus,
      UserCreateDate: user.createdDate,
      UserLastModifiedDate: user.lastModifiedDate,
    }, ctx);
  }

  private initiateAuth(body: any, ctx: RequestContext): Response {
    const result = this.service.initiateAuth(
      body.UserPoolId ?? this.extractPoolId(body),
      body.ClientId ?? body.AuthParameters?.CLIENT_ID,
      body.AuthFlow,
      body.AuthParameters ?? {},
      ctx.region,
    );
    return this.json(result, ctx);
  }

  private extractPoolId(body: any): string {
    // Some SDK calls don't send UserPoolId directly
    return body.UserPoolId ?? "";
  }
}

function poolToJson(p: any) {
  return {
    Id: p.id, Name: p.name, Arn: p.arn,
    CreationDate: p.creationDate, LastModifiedDate: p.lastModifiedDate,
    Status: p.status, Policies: p.policies, Schema: p.schema,
    AutoVerifiedAttributes: p.autoVerifiedAttributes, MfaConfiguration: p.mfaConfiguration,
  };
}

function poolSummary(p: any) {
  return { Id: p.id, Name: p.name, CreationDate: p.creationDate, LastModifiedDate: p.lastModifiedDate, Status: p.status };
}

function clientToJson(c: any) {
  return {
    ClientId: c.clientId, ClientName: c.clientName, UserPoolId: c.userPoolId,
    ExplicitAuthFlows: c.explicitAuthFlows, CreationDate: c.creationDate, LastModifiedDate: c.lastModifiedDate,
  };
}

function clientSummary(c: any) {
  return { ClientId: c.clientId, ClientName: c.clientName, UserPoolId: c.userPoolId };
}

function userToJson(u: any) {
  return {
    Username: u.username, Enabled: u.enabled, UserStatus: u.userStatus,
    Attributes: Object.entries(u.attributes).map(([Name, Value]) => ({ Name, Value })),
    UserCreateDate: u.createdDate, UserLastModifiedDate: u.lastModifiedDate,
  };
}
