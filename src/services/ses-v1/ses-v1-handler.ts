import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlResponse } from "../../core/xml";
import type { SesService } from "../ses/ses-service";

const NS = "http://ses.amazonaws.com/doc/2010-12-01/";

export class SesV1QueryHandler {
  constructor(private service: SesService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "VerifyEmailIdentity": return this.verifyEmailIdentity(params, ctx);
        case "ListIdentities": return this.listIdentities(params, ctx);
        case "GetIdentityVerificationAttributes": return this.getIdentityVerificationAttributes(params, ctx);
        case "SendEmail": return this.sendEmail(params, ctx);
        case "DeleteIdentity": return this.deleteIdentity(params, ctx);
        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private verifyEmailIdentity(params: URLSearchParams, ctx: RequestContext): Response {
    const identity = params.get("EmailAddress")!;
    try {
      this.service.createEmailIdentity(identity);
    } catch {
      // Already exists, that's fine for v1
    }
    return xmlResponse(xmlEnvelope("VerifyEmailIdentity", ctx.requestId, "", NS), ctx.requestId);
  }

  private listIdentities(params: URLSearchParams, ctx: RequestContext): Response {
    const identities = this.service.listEmailIdentities();
    const identityType = params.get("IdentityType");
    const filtered = identityType
      ? identities.filter((i) => identityType === "EmailAddress" ? i.identityType === "EMAIL_ADDRESS" : i.identityType === "DOMAIN")
      : identities;
    const xml = new XmlBuilder().start("Identities");
    for (const identity of filtered) {
      xml.raw(`<member>${identity.emailIdentity}</member>`);
    }
    xml.end("Identities");
    return xmlResponse(xmlEnvelope("ListIdentities", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private getIdentityVerificationAttributes(params: URLSearchParams, ctx: RequestContext): Response {
    const xml = new XmlBuilder().start("VerificationAttributes");
    for (let i = 1; i <= 100; i++) {
      const identity = params.get(`Identities.member.${i}`);
      if (!identity) break;
      try {
        this.service.getEmailIdentity(identity);
        xml.start("entry")
          .elem("key", identity)
          .start("value")
            .elem("VerificationStatus", "Success")
          .end("value")
          .end("entry");
      } catch {
        xml.start("entry")
          .elem("key", identity)
          .start("value")
            .elem("VerificationStatus", "NotStarted")
          .end("value")
          .end("entry");
      }
    }
    xml.end("VerificationAttributes");
    return xmlResponse(xmlEnvelope("GetIdentityVerificationAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private sendEmail(params: URLSearchParams, ctx: RequestContext): Response {
    const from = params.get("Source") ?? "";
    const toAddresses: string[] = [];
    for (let i = 1; i <= 50; i++) {
      const addr = params.get(`Destination.ToAddresses.member.${i}`);
      if (!addr) break;
      toAddresses.push(addr);
    }
    const subject = params.get("Message.Subject.Data") ?? "";
    const body = params.get("Message.Body.Text.Data") ?? params.get("Message.Body.Html.Data") ?? "";

    const messageId = this.service.sendEmail(from, { toAddresses }, subject, body);
    const result = new XmlBuilder().elem("MessageId", messageId).build();
    return xmlResponse(xmlEnvelope("SendEmail", ctx.requestId, result, NS), ctx.requestId);
  }

  private deleteIdentity(params: URLSearchParams, ctx: RequestContext): Response {
    const identity = params.get("Identity")!;
    try {
      this.service.deleteEmailIdentity(identity);
    } catch {
      // Not found is OK in v1
    }
    return xmlResponse(xmlEnvelope("DeleteIdentity", ctx.requestId, "", NS), ctx.requestId);
  }
}
