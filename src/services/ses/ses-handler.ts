import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SesService } from "./ses-service";

export class SesHandler {
  constructor(private service: SesService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // GET /v2/email/account
      if (path === "/v2/email/account" && method === "GET") {
        return this.json(this.service.getAccount(), ctx);
      }

      // POST /v2/email/outbound-emails — SendEmail
      if (path === "/v2/email/outbound-emails" && method === "POST") {
        const body = await req.json();
        return this.sendEmail(body, ctx);
      }

      // Single identity: GET/DELETE /v2/email/identities/{identity}
      const identityMatch = path.match(/^\/v2\/email\/identities\/(.+)$/);
      if (identityMatch) {
        const identity = decodeURIComponent(identityMatch[1]);
        if (method === "GET") {
          return this.getEmailIdentity(identity, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteEmailIdentity(identity);
          return this.json({}, ctx);
        }
      }

      // List/Create identities: GET/POST /v2/email/identities
      if (path === "/v2/email/identities" && method === "POST") {
        const body = await req.json();
        return this.createEmailIdentity(body, ctx);
      }

      if (path === "/v2/email/identities" && method === "GET") {
        return this.listEmailIdentities(ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown SES operation: ${method} ${path}`, 400),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private createEmailIdentity(body: any, ctx: RequestContext): Response {
    const identity = this.service.createEmailIdentity(body.EmailIdentity);
    return this.json({
      IdentityType: identity.identityType,
      VerifiedForSendingStatus: identity.verifiedForSendingStatus,
    }, ctx);
  }

  private getEmailIdentity(emailIdentity: string, ctx: RequestContext): Response {
    const identity = this.service.getEmailIdentity(emailIdentity);
    return this.json({
      IdentityType: identity.identityType,
      VerifiedForSendingStatus: identity.verifiedForSendingStatus,
      FeedbackForwardingStatus: true,
    }, ctx);
  }

  private listEmailIdentities(ctx: RequestContext): Response {
    const identities = this.service.listEmailIdentities();
    return this.json({
      EmailIdentities: identities.map((i) => ({
        IdentityType: i.identityType,
        IdentityName: i.emailIdentity,
        SendingEnabled: i.verifiedForSendingStatus,
      })),
    }, ctx);
  }

  private sendEmail(body: any, ctx: RequestContext): Response {
    const from = body.FromEmailAddress ?? "";
    const destination = {
      toAddresses: body.Destination?.ToAddresses,
      ccAddresses: body.Destination?.CcAddresses,
      bccAddresses: body.Destination?.BccAddresses,
    };
    const subject = body.Content?.Simple?.Subject?.Data;
    const emailBody = body.Content?.Simple?.Body?.Text?.Data ?? body.Content?.Simple?.Body?.Html?.Data;

    const messageId = this.service.sendEmail(from, destination, subject, emailBody);
    return this.json({ MessageId: messageId }, ctx);
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
