import type { RequestContext } from "../../core/context";
import { AwsError } from "../../core/errors";
import type { SimpleDBService } from "./sdb-service";

export class SimpleDBQueryHandler {
  constructor(private service: SimpleDBService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateDomain":
          this.service.createDomain(params.get("DomainName")!);
          return this.xml(`<CreateDomainResponse><ResponseMetadata><RequestId>${ctx.requestId}</RequestId></ResponseMetadata></CreateDomainResponse>`, ctx);
        case "ListDomains": {
          const domains = this.service.listDomains();
          const items = domains.map((d) => `<DomainName>${d}</DomainName>`).join("");
          return this.xml(`<ListDomainsResponse><ListDomainsResult>${items}</ListDomainsResult><ResponseMetadata><RequestId>${ctx.requestId}</RequestId></ResponseMetadata></ListDomainsResponse>`, ctx);
        }
        case "DeleteDomain":
          this.service.deleteDomain(params.get("DomainName")!);
          return this.xml(`<DeleteDomainResponse><ResponseMetadata><RequestId>${ctx.requestId}</RequestId></ResponseMetadata></DeleteDomainResponse>`, ctx);
        case "PutAttributes": {
          const domainName = params.get("DomainName")!;
          const itemName = params.get("ItemName")!;
          const attributes: { Name: string; Value: string }[] = [];
          for (let i = 0; ; i++) {
            const name = params.get(`Attribute.${i + 1}.Name`) ?? params.get(`Attribute.${i}.Name`);
            const value = params.get(`Attribute.${i + 1}.Value`) ?? params.get(`Attribute.${i}.Value`);
            if (!name) break;
            attributes.push({ Name: name, Value: value ?? "" });
          }
          this.service.putAttributes(domainName, itemName, attributes);
          return this.xml(`<PutAttributesResponse><ResponseMetadata><RequestId>${ctx.requestId}</RequestId></ResponseMetadata></PutAttributesResponse>`, ctx);
        }
        case "GetAttributes": {
          const attrs = this.service.getAttributes(params.get("DomainName")!, params.get("ItemName")!);
          const items = attrs.map((a) => `<Attribute><Name>${a.Name}</Name><Value>${a.Value}</Value></Attribute>`).join("");
          return this.xml(`<GetAttributesResponse><GetAttributesResult>${items}</GetAttributesResult><ResponseMetadata><RequestId>${ctx.requestId}</RequestId></ResponseMetadata></GetAttributesResponse>`, ctx);
        }
        case "Select": {
          const results = this.service.select(params.get("SelectExpression")!);
          const items = results.map((r) => {
            const attrs = r.Attributes.map((a) => `<Attribute><Name>${a.Name}</Name><Value>${a.Value}</Value></Attribute>`).join("");
            return `<Item><Name>${r.Name}</Name>${attrs}</Item>`;
          }).join("");
          return this.xml(`<SelectResponse><SelectResult>${items}</SelectResult><ResponseMetadata><RequestId>${ctx.requestId}</RequestId></ResponseMetadata></SelectResponse>`, ctx);
        }
        default:
          return this.xml(`<ErrorResponse><Error><Code>InvalidAction</Code><Message>Unknown action ${action}</Message></Error></ErrorResponse>`, ctx, 400);
      }
    } catch (e) {
      if (e instanceof AwsError) {
        return this.xml(`<ErrorResponse><Error><Code>${e.code}</Code><Message>${e.message}</Message></Error></ErrorResponse>`, ctx, e.statusCode);
      }
      throw e;
    }
  }

  private xml(body: string, ctx: RequestContext, status = 200): Response {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
      status,
      headers: { "Content-Type": "text/xml", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
