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

      // PUT /v2/email/account/sending — PutAccountSendingAttributes
      if (path === "/v2/email/account/sending" && method === "PUT") {
        const body = await req.json();
        this.service.putAccountSendingAttributes(body.SendingEnabled ?? true);
        return this.json({}, ctx);
      }

      // POST /v2/email/outbound-emails — SendEmail
      if (path === "/v2/email/outbound-emails" && method === "POST") {
        const body = await req.json();
        return this.sendEmail(body, ctx);
      }

      // POST /v2/email/outbound-bulk-emails — SendBulkEmail
      if (path === "/v2/email/outbound-bulk-emails" && method === "POST") {
        const body = await req.json();
        return this.sendBulkEmail(body, ctx);
      }

      // --- Email Templates ---
      // Single template: GET/PUT/DELETE /v2/email/templates/{name}
      const templateMatch = path.match(/^\/v2\/email\/templates\/(.+)$/);
      if (templateMatch) {
        const templateName = decodeURIComponent(templateMatch[1]);
        if (method === "GET") {
          return this.getEmailTemplate(templateName, ctx);
        }
        if (method === "PUT") {
          const body = await req.json();
          return this.updateEmailTemplate(templateName, body, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteEmailTemplate(templateName);
          return this.json({}, ctx);
        }
      }

      // List/Create templates: GET/POST /v2/email/templates
      if (path === "/v2/email/templates" && method === "POST") {
        const body = await req.json();
        return this.createEmailTemplate(body, ctx);
      }
      if (path === "/v2/email/templates" && method === "GET") {
        return this.listEmailTemplates(ctx);
      }

      // --- Configuration Sets ---
      // Single config set: GET/DELETE /v2/email/configuration-sets/{name}
      const configSetMatch = path.match(/^\/v2\/email\/configuration-sets\/(.+)$/);
      if (configSetMatch) {
        const name = decodeURIComponent(configSetMatch[1]);
        if (method === "GET") {
          return this.getConfigurationSet(name, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteConfigurationSet(name);
          return this.json({}, ctx);
        }
      }

      // List/Create configuration sets: GET/POST /v2/email/configuration-sets
      if (path === "/v2/email/configuration-sets" && method === "POST") {
        const body = await req.json();
        return this.createConfigurationSet(body, ctx);
      }
      if (path === "/v2/email/configuration-sets" && method === "GET") {
        return this.listConfigurationSets(ctx);
      }

      // --- Suppression List ---
      // Single suppressed destination: GET /v2/email/suppression/addresses/{email}
      const suppressionMatch = path.match(/^\/v2\/email\/suppression\/addresses\/(.+)$/);
      if (suppressionMatch) {
        const email = decodeURIComponent(suppressionMatch[1]);
        if (method === "GET") {
          return this.getSuppressedDestination(email, ctx);
        }
      }

      // List/Put suppressed destinations: GET/PUT /v2/email/suppression/addresses
      if (path === "/v2/email/suppression/addresses" && method === "PUT") {
        const body = await req.json();
        return this.putSuppressedDestination(body, ctx);
      }
      if (path === "/v2/email/suppression/addresses" && method === "GET") {
        return this.listSuppressedDestinations(ctx);
      }

      // --- Email Identities ---
      // DKIM attributes: PUT /v2/email/identities/{identity}/dkim
      const dkimMatch = path.match(/^\/v2\/email\/identities\/(.+)\/dkim$/);
      if (dkimMatch && method === "PUT") {
        const identity = decodeURIComponent(dkimMatch[1]);
        const body = await req.json();
        this.service.putEmailIdentityDkimAttributes(identity, body.SigningEnabled ?? false);
        return this.json({}, ctx);
      }

      // Single identity: GET/DELETE /v2/email/identities/{identity}
      const identityMatch = path.match(/^\/v2\/email\/identities\/([^/]+)$/);
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

  // --- Identity handlers ---

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
      DkimAttributes: {
        SigningEnabled: identity.dkimSigningEnabled,
      },
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

  // --- Send handlers ---

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

  private sendBulkEmail(body: any, ctx: RequestContext): Response {
    const defaultContent = {
      template: body.DefaultContent?.Template ? {
        templateName: body.DefaultContent.Template.TemplateName,
        templateData: body.DefaultContent.Template.TemplateData,
      } : undefined,
    };

    const entries = (body.BulkEmailEntries ?? []).map((e: any) => ({
      destination: {
        toAddresses: e.Destination?.ToAddresses,
        ccAddresses: e.Destination?.CcAddresses,
        bccAddresses: e.Destination?.BccAddresses,
      },
      replacementEmailContent: e.ReplacementEmailContent ? {
        replacementTemplate: e.ReplacementEmailContent.ReplacementTemplate ? {
          replacementTemplateData: e.ReplacementEmailContent.ReplacementTemplate.ReplacementTemplateData,
        } : undefined,
      } : undefined,
    }));

    const results = this.service.sendBulkEmail(
      defaultContent,
      entries,
      body.FromEmailAddress,
      body.ConfigurationSetName,
    );

    return this.json({
      BulkEmailEntryResults: results.map((r) => ({
        Status: r.status,
        MessageId: r.messageId,
        Error: r.error,
      })),
    }, ctx);
  }

  // --- Template handlers ---

  private createEmailTemplate(body: any, ctx: RequestContext): Response {
    this.service.createEmailTemplate(body.TemplateName, {
      subject: body.TemplateContent?.Subject,
      html: body.TemplateContent?.Html,
      text: body.TemplateContent?.Text,
    });
    return this.json({}, ctx);
  }

  private getEmailTemplate(templateName: string, ctx: RequestContext): Response {
    const template = this.service.getEmailTemplate(templateName);
    return this.json({
      TemplateName: template.templateName,
      TemplateContent: {
        Subject: template.templateContent.subject,
        Html: template.templateContent.html,
        Text: template.templateContent.text,
      },
    }, ctx);
  }

  private listEmailTemplates(ctx: RequestContext): Response {
    const templates = this.service.listEmailTemplates();
    return this.json({
      TemplatesMetadata: templates.map((t) => ({
        TemplateName: t.templateName,
        CreatedTimestamp: Math.floor(t.createdAt / 1000),
      })),
    }, ctx);
  }

  private updateEmailTemplate(templateName: string, body: any, ctx: RequestContext): Response {
    this.service.updateEmailTemplate(templateName, {
      subject: body.TemplateContent?.Subject,
      html: body.TemplateContent?.Html,
      text: body.TemplateContent?.Text,
    });
    return this.json({}, ctx);
  }

  // --- Configuration Set handlers ---

  private createConfigurationSet(body: any, ctx: RequestContext): Response {
    this.service.createConfigurationSet({
      configurationSetName: body.ConfigurationSetName,
      deliveryOptions: body.DeliveryOptions ? {
        sendingPoolName: body.DeliveryOptions.SendingPoolName,
        tlsPolicy: body.DeliveryOptions.TlsPolicy,
      } : undefined,
      reputationOptions: body.ReputationOptions ? {
        reputationMetricsEnabled: body.ReputationOptions.ReputationMetricsEnabled,
      } : undefined,
      sendingOptions: body.SendingOptions ? {
        sendingEnabled: body.SendingOptions.SendingEnabled,
      } : undefined,
      trackingOptions: body.TrackingOptions ? {
        customRedirectDomain: body.TrackingOptions.CustomRedirectDomain,
      } : undefined,
    });
    return this.json({}, ctx);
  }

  private getConfigurationSet(name: string, ctx: RequestContext): Response {
    const cs = this.service.getConfigurationSet(name);
    return this.json({
      ConfigurationSetName: cs.configurationSetName,
      DeliveryOptions: cs.deliveryOptions ? {
        SendingPoolName: cs.deliveryOptions.sendingPoolName,
        TlsPolicy: cs.deliveryOptions.tlsPolicy,
      } : undefined,
      ReputationOptions: cs.reputationOptions ? {
        ReputationMetricsEnabled: cs.reputationOptions.reputationMetricsEnabled,
      } : undefined,
      SendingOptions: cs.sendingOptions ? {
        SendingEnabled: cs.sendingOptions.sendingEnabled,
      } : undefined,
      TrackingOptions: cs.trackingOptions ? {
        CustomRedirectDomain: cs.trackingOptions.customRedirectDomain,
      } : undefined,
    }, ctx);
  }

  private listConfigurationSets(ctx: RequestContext): Response {
    const sets = this.service.listConfigurationSets();
    return this.json({
      ConfigurationSets: sets.map((cs) => cs.configurationSetName),
    }, ctx);
  }

  // --- Suppression handlers ---

  private putSuppressedDestination(body: any, ctx: RequestContext): Response {
    this.service.putSuppressedDestination(body.EmailAddress, body.Reason ?? "BOUNCE");
    return this.json({}, ctx);
  }

  private getSuppressedDestination(email: string, ctx: RequestContext): Response {
    const dest = this.service.getSuppressedDestination(email);
    return this.json({
      SuppressedDestination: {
        EmailAddress: dest.emailAddress,
        Reason: dest.reason,
        LastUpdateTime: Math.floor(dest.createdAt / 1000),
      },
    }, ctx);
  }

  private listSuppressedDestinations(ctx: RequestContext): Response {
    const destinations = this.service.listSuppressedDestinations();
    return this.json({
      SuppressedDestinationSummaries: destinations.map((d) => ({
        EmailAddress: d.emailAddress,
        Reason: d.reason,
        LastUpdateTime: Math.floor(d.createdAt / 1000),
      })),
    }, ctx);
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
