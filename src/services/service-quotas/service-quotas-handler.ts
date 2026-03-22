import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ServiceQuotasService } from "./service-quotas-service";

export class ServiceQuotasHandler {
  constructor(private service: ServiceQuotasService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "GetServiceQuota": {
          const q = this.service.getServiceQuota(body.ServiceCode, body.QuotaCode);
          return this.json({ Quota: this.quotaToJson(q) }, ctx);
        }
        case "GetAWSDefaultServiceQuota": {
          const q = this.service.getAWSDefaultServiceQuota(body.ServiceCode, body.QuotaCode);
          return this.json({ Quota: this.quotaToJson(q) }, ctx);
        }
        case "ListServiceQuotas": {
          const quotas = this.service.listServiceQuotas(body.ServiceCode);
          return this.json({ Quotas: quotas.map((q) => this.quotaToJson(q)) }, ctx);
        }
        case "RequestServiceQuotaIncrease": {
          const req = this.service.requestServiceQuotaIncrease(body.ServiceCode, body.QuotaCode, body.DesiredValue);
          return this.json({ RequestedQuota: { Id: req.id, ServiceCode: req.serviceCode, QuotaCode: req.quotaCode, DesiredValue: req.desiredValue, Status: req.status, Created: req.created } }, ctx);
        }
        case "ListRequestedServiceQuotaChangeHistory": {
          const reqs = this.service.listRequestedServiceQuotaChangeHistory(body.ServiceCode);
          return this.json({ RequestedQuotas: reqs.map((r) => ({ Id: r.id, ServiceCode: r.serviceCode, QuotaCode: r.quotaCode, DesiredValue: r.desiredValue, Status: r.status, Created: r.created })) }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId } });
  }

  private quotaToJson(q: any): any {
    return { ServiceCode: q.serviceCode, ServiceName: q.serviceName, QuotaCode: q.quotaCode, QuotaName: q.quotaName, Value: q.value, Unit: q.unit, Adjustable: q.adjustable, GlobalQuota: q.globalQuota };
  }
}
