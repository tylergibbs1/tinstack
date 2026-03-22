import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ConnectCampaignsService } from "./connect-campaigns-service";

export class ConnectCampaignsHandler {
  constructor(private service: ConnectCampaignsService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      if (path === "/campaigns" && method === "PUT") {
        const body = await req.json();
        const c = this.service.createCampaign(body.name, body.connectInstanceId);
        return this.json({ campaign: c }, ctx);
      }

      // POST /campaigns-list — ListCampaigns
      if (path === "/campaigns-list" && method === "POST") {
        return this.json({ campaignSummaryList: this.service.listCampaigns().map((c) => ({ id: c.id, arn: c.arn, name: c.name })) }, ctx);
      }

      const idMatch = path.match(/^\/campaigns\/([^/]+)$/);
      if (idMatch && method === "GET") {
        const c = this.service.getCampaign(idMatch[1]);
        return this.json({ campaign: c }, ctx);
      }
      if (idMatch && method === "DELETE") {
        this.service.deleteCampaign(idMatch[1]);
        return new Response(null, { status: 200, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // POST /campaigns/{id}/start
      const startMatch = path.match(/^\/campaigns\/([^/]+)\/start$/);
      if (startMatch && method === "POST") {
        this.service.startCampaign(startMatch[1]);
        return new Response(null, { status: 200, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // POST /campaigns/{id}/stop
      const stopMatch = path.match(/^\/campaigns\/([^/]+)\/stop$/);
      if (stopMatch && method === "POST") {
        this.service.stopCampaign(stopMatch[1]);
        return new Response(null, { status: 200, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      return jsonErrorResponse(new AwsError("NotFound", "Route not found", 404), ctx.requestId);
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
}
