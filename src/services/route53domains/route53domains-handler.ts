import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { Route53DomainsService } from "./route53domains-service";

export class Route53DomainsHandler {
  constructor(private service: Route53DomainsService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "RegisterDomain": {
          const opId = this.service.registerDomain(body.DomainName, body.DurationInYears ?? 1, body.AdminContact, body.RegistrantContact, body.TechContact);
          return this.json({ OperationId: opId }, ctx);
        }
        case "GetDomainDetail": {
          const d = this.service.getDomainDetail(body.DomainName);
          return this.json({
            DomainName: d.domainName, AutoRenew: d.autoRenew,
            Nameservers: d.nameservers.map(n => ({ Name: n.name })),
            AdminContact: d.adminContact, RegistrantContact: d.registrantContact,
            TechContact: d.techContact, RegistrationDate: d.registrationDate,
            ExpirationDate: d.expirationDate, StatusList: d.status,
          }, ctx);
        }
        case "ListDomains": {
          const domains = this.service.listDomains();
          return this.json({
            Domains: domains.map(d => ({
              DomainName: d.domainName, AutoRenew: d.autoRenew,
              TransferLock: d.transferLock, Expiry: d.expiry,
            })),
          }, ctx);
        }
        case "CheckDomainAvailability": {
          const result = this.service.checkDomainAvailability(body.DomainName);
          return this.json({ Availability: result.availability }, ctx);
        }
        case "TransferDomain": {
          const opId = this.service.transferDomain(body.DomainName, body.DurationInYears ?? 1, body.Nameservers ?? [], body.AdminContact, body.RegistrantContact, body.TechContact, body.AuthCode ?? "");
          return this.json({ OperationId: opId }, ctx);
        }
        case "RenewDomain": {
          const opId = this.service.renewDomain(body.DomainName, body.DurationInYears ?? 1);
          return this.json({ OperationId: opId }, ctx);
        }
        case "UpdateDomainNameservers": {
          const opId = this.service.updateDomainNameservers(body.DomainName, (body.Nameservers ?? []).map((n: any) => ({ name: n.Name })));
          return this.json({ OperationId: opId }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown Route53Domains action: ${action}`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
