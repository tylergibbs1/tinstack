import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlResponse, AWS_NAMESPACES } from "../../core/xml";
import type { StsService } from "./sts-service";

const NS = AWS_NAMESPACES.STS;

export class StsQueryHandler {
  constructor(private service: StsService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "GetCallerIdentity":
          return this.getCallerIdentity(ctx);
        case "AssumeRole":
          return this.assumeRole(params, ctx);
        case "GetSessionToken":
          return this.getSessionToken(params, ctx);
        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private getCallerIdentity(ctx: RequestContext): Response {
    const id = this.service.getCallerIdentity(ctx.region);
    const result = new XmlBuilder()
      .elem("Arn", id.arn)
      .elem("UserId", id.userId)
      .elem("Account", id.account)
      .build();
    return xmlResponse(xmlEnvelope("GetCallerIdentity", ctx.requestId, result, NS), ctx.requestId);
  }

  private assumeRole(params: URLSearchParams, ctx: RequestContext): Response {
    const role = this.service.assumeRole(
      params.get("RoleArn")!,
      params.get("RoleSessionName")!,
      parseInt(params.get("DurationSeconds") ?? "3600"),
      ctx.region,
    );
    const result = new XmlBuilder()
      .start("Credentials")
        .elem("AccessKeyId", role.credentials.accessKeyId)
        .elem("SecretAccessKey", role.credentials.secretAccessKey)
        .elem("SessionToken", role.credentials.sessionToken)
        .elem("Expiration", role.credentials.expiration)
      .end("Credentials")
      .start("AssumedRoleUser")
        .elem("AssumedRoleId", role.assumedRoleUser.assumedRoleId)
        .elem("Arn", role.assumedRoleUser.arn)
      .end("AssumedRoleUser")
      .build();
    return xmlResponse(xmlEnvelope("AssumeRole", ctx.requestId, result, NS), ctx.requestId);
  }

  private getSessionToken(params: URLSearchParams, ctx: RequestContext): Response {
    const creds = this.service.getSessionToken(parseInt(params.get("DurationSeconds") ?? "43200"));
    const result = new XmlBuilder()
      .start("Credentials")
        .elem("AccessKeyId", creds.accessKeyId)
        .elem("SecretAccessKey", creds.secretAccessKey)
        .elem("SessionToken", creds.sessionToken)
        .elem("Expiration", creds.expiration)
      .end("Credentials")
      .build();
    return xmlResponse(xmlEnvelope("GetSessionToken", ctx.requestId, result, NS), ctx.requestId);
  }
}
