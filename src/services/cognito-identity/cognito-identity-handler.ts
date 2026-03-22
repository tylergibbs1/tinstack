import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CognitoIdentityService } from "./cognito-identity-service";

export class CognitoIdentityHandler {
  constructor(private service: CognitoIdentityService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateIdentityPool": return this.createIdentityPool(body, ctx);
        case "DescribeIdentityPool": return this.describeIdentityPool(body, ctx);
        case "ListIdentityPools": return this.listIdentityPools(body, ctx);
        case "DeleteIdentityPool": return this.deleteIdentityPool(body, ctx);
        case "GetId": return this.getId(body, ctx);
        case "GetCredentialsForIdentity": return this.getCredentialsForIdentity(body, ctx);
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

  private createIdentityPool(body: any, ctx: RequestContext): Response {
    const pool = this.service.createIdentityPool(
      body.IdentityPoolName, body.AllowUnauthenticatedIdentities,
      body.SupportedLoginProviders, body.DeveloperProviderName,
      body.AllowClassicFlow, body.IdentityPoolTags, ctx.region,
    );
    return this.json(this.poolToJson(pool), ctx);
  }

  private describeIdentityPool(body: any, ctx: RequestContext): Response {
    return this.json(this.poolToJson(this.service.describeIdentityPool(body.IdentityPoolId)), ctx);
  }

  private listIdentityPools(body: any, ctx: RequestContext): Response {
    const pools = this.service.listIdentityPools(body.MaxResults ?? 60);
    return this.json({ IdentityPools: pools.map((p) => ({ IdentityPoolId: p.identityPoolId, IdentityPoolName: p.identityPoolName })) }, ctx);
  }

  private deleteIdentityPool(body: any, ctx: RequestContext): Response {
    this.service.deleteIdentityPool(body.IdentityPoolId);
    return this.json({}, ctx);
  }

  private getId(body: any, ctx: RequestContext): Response {
    const identityId = this.service.getId(body.IdentityPoolId, body.Logins);
    return this.json({ IdentityId: identityId }, ctx);
  }

  private getCredentialsForIdentity(body: any, ctx: RequestContext): Response {
    const result = this.service.getCredentialsForIdentity(body.IdentityId);
    return this.json({
      IdentityId: result.identityId,
      Credentials: {
        AccessKeyId: result.credentials.accessKeyId,
        SecretKey: result.credentials.secretKey,
        SessionToken: result.credentials.sessionToken,
        Expiration: result.credentials.expiration,
      },
    }, ctx);
  }

  private poolToJson(pool: any): any {
    return {
      IdentityPoolId: pool.identityPoolId,
      IdentityPoolName: pool.identityPoolName,
      AllowUnauthenticatedIdentities: pool.allowUnauthenticatedIdentities,
      AllowClassicFlow: pool.allowClassicFlow,
      SupportedLoginProviders: pool.supportedLoginProviders,
      DeveloperProviderName: pool.developerProviderName,
      IdentityPoolTags: pool.identityPoolTags,
    };
  }
}
