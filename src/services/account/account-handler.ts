import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { AccountService } from "./account-service";

export class AccountHandler {
  constructor(private service: AccountService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      const body = await req.json().catch(() => ({}));

      switch (path) {
        case "/getContactInformation": {
          const info = this.service.getContactInformation();
          return this.json({ ContactInformation: this.contactToJson(info) }, ctx);
        }
        case "/putContactInformation": {
          this.service.putContactInformation(this.jsonToContact(body.ContactInformation ?? {}));
          return this.json({}, ctx);
        }
        case "/getAlternateContact": {
          const contact = this.service.getAlternateContact(body.AlternateContactType);
          return this.json({ AlternateContact: this.altContactToJson(contact) }, ctx);
        }
        case "/putAlternateContact": {
          this.service.putAlternateContact({
            alternateContactType: body.AlternateContactType,
            emailAddress: body.EmailAddress,
            name: body.Name,
            phoneNumber: body.PhoneNumber,
            title: body.Title,
          });
          return this.json({}, ctx);
        }
        case "/deleteAlternateContact": {
          this.service.deleteAlternateContact(body.AlternateContactType);
          return this.json({}, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown Account op: ${path}`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private contactToJson(c: any): any {
    return {
      FullName: c.fullName, AddressLine1: c.addressLine1, AddressLine2: c.addressLine2,
      AddressLine3: c.addressLine3, City: c.city, StateOrRegion: c.stateOrRegion,
      PostalCode: c.postalCode, CountryCode: c.countryCode, PhoneNumber: c.phoneNumber,
      CompanyName: c.companyName, WebsiteUrl: c.websiteUrl, DistrictOrCounty: c.districtOrCounty,
    };
  }

  private jsonToContact(c: any): any {
    return {
      fullName: c.FullName, addressLine1: c.AddressLine1, addressLine2: c.AddressLine2,
      addressLine3: c.AddressLine3, city: c.City, stateOrRegion: c.StateOrRegion,
      postalCode: c.PostalCode, countryCode: c.CountryCode, phoneNumber: c.PhoneNumber,
      companyName: c.CompanyName, websiteUrl: c.WebsiteUrl, districtOrCounty: c.DistrictOrCounty,
    };
  }

  private altContactToJson(c: any): any {
    return {
      AlternateContactType: c.alternateContactType,
      EmailAddress: c.emailAddress, Name: c.name,
      PhoneNumber: c.phoneNumber, Title: c.title,
    };
  }
}
