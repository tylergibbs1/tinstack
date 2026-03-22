import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ServiceCatalogService } from "./servicecatalog-service";

export class ServiceCatalogHandler {
  constructor(private service: ServiceCatalogService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreatePortfolio": {
          const p = this.service.createPortfolio(body.DisplayName, body.ProviderName);
          return this.json({ PortfolioDetail: { Id: p.id, ARN: p.arn, DisplayName: p.displayName, ProviderName: p.providerName, CreatedTime: p.createdTime } }, ctx);
        }
        case "DescribePortfolio": {
          const p = this.service.describePortfolio(body.Id);
          return this.json({ PortfolioDetail: { Id: p.id, ARN: p.arn, DisplayName: p.displayName, ProviderName: p.providerName } }, ctx);
        }
        case "ListPortfolios":
          return this.json({ PortfolioDetails: this.service.listPortfolios().map((p) => ({ Id: p.id, ARN: p.arn, DisplayName: p.displayName, ProviderName: p.providerName })) }, ctx);
        case "DeletePortfolio":
          this.service.deletePortfolio(body.Id);
          return this.json({}, ctx);
        case "CreateProduct": {
          const p = this.service.createProduct(body.Name, body.Owner, body.ProductType);
          return this.json({ ProductViewDetail: { ProductViewSummary: { ProductId: p.id, Name: p.name, Owner: p.owner, Type: p.type } } }, ctx);
        }
        case "DescribeProduct": {
          const p = this.service.describeProduct(body.Id);
          return this.json({ ProductViewSummary: { ProductId: p.id, Name: p.name, Owner: p.owner, Type: p.type } }, ctx);
        }
        case "SearchProducts":
          return this.json({ ProductViewSummaries: this.service.searchProducts().map((p) => ({ ProductId: p.id, Name: p.name, Owner: p.owner })) }, ctx);
        default:
          return jsonErrorResponse(new AwsError("InvalidAction", `Unknown action ${action}`, 400), ctx.requestId);
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
}
