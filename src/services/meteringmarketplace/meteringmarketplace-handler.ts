import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { MeteringMarketplaceService } from "./meteringmarketplace-service";

export class MeteringMarketplaceHandler {
  constructor(private service: MeteringMarketplaceService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "MeterUsage": {
          const record = this.service.meterUsage(body.ProductCode, body.Timestamp, body.UsageDimension, body.UsageQuantity ?? 0);
          return this.json({ MeteringRecordId: record.meteringRecordId }, ctx);
        }
        case "BatchMeterUsage": {
          const result = this.service.batchMeterUsage(body.ProductCode, body.UsageRecords ?? []);
          return this.json({
            Results: result.results.map(r => ({
              UsageRecord: r.usageRecord,
              MeteringRecordId: r.meteringRecordId,
              Status: r.status,
            })),
            UnprocessedRecords: result.unprocessedRecords,
          }, ctx);
        }
        case "RegisterUsage": {
          const result = this.service.registerUsage(body.ProductCode, body.PublicKeyVersion ?? 1);
          return this.json({ Signature: result.signature, ExpirationDate: result.expirationDate }, ctx);
        }
        case "ResolveCustomer": {
          const result = this.service.resolveCustomer(body.RegistrationToken);
          return this.json({
            CustomerIdentifier: result.customerIdentifier,
            ProductCode: result.productCode,
            CustomerAWSAccountId: result.customerAWSAccountId,
          }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown MeteringMarketplace action: ${action}`, 400), ctx.requestId);
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
