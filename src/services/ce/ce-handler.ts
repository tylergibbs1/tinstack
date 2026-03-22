import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CostExplorerService } from "./ce-service";

export class CostExplorerHandler {
  constructor(private service: CostExplorerService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "GetCostAndUsage":
          return this.json(this.service.getCostAndUsage(body), ctx);

        case "GetCostForecast":
          return this.json(this.service.getCostForecast(body), ctx);

        case "GetDimensionValues":
          return this.json(this.service.getDimensionValues(body), ctx);

        case "GetTags":
          return this.json(this.service.getTags(body), ctx);

        case "CreateCostCategoryDefinition":
          return this.json(this.service.createCostCategoryDefinition(body), ctx);

        case "DescribeCostCategoryDefinition":
          return this.json(this.service.describeCostCategoryDefinition(body.CostCategoryArn), ctx);

        case "ListCostCategoryDefinitions":
          return this.json({ CostCategoryReferences: this.service.listCostCategoryDefinitions() }, ctx);

        case "DeleteCostCategoryDefinition":
          return this.json(this.service.deleteCostCategoryDefinition(body.CostCategoryArn), ctx);

        case "UpdateCostCategoryDefinition":
          return this.json(this.service.updateCostCategoryDefinition(body.CostCategoryArn, body), ctx);

        default:
          return jsonErrorResponse(
            new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400),
            ctx.requestId,
          );
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
