import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { PinpointService } from "./pinpoint-service";

export class PinpointHandler {
  constructor(private service: PinpointService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // PUT /v1/apps/{appId}/events
      const eventsMatch = path.match(/^\/v1\/apps\/([^/]+)\/events$/);
      if (eventsMatch && method === "POST") {
        const appId = eventsMatch[1];
        const body = await req.json();
        const result = this.service.putEvents(appId, body.BatchItem ?? body);
        return this.json(result, ctx);
      }

      // POST /v1/apps/{appId}/messages
      const messagesMatch = path.match(/^\/v1\/apps\/([^/]+)\/messages$/);
      if (messagesMatch && method === "POST") {
        const appId = messagesMatch[1];
        const body = await req.json();
        const result = this.service.sendMessages(appId, body.MessageRequest ?? body);
        return this.json(result, ctx);
      }

      // --- Endpoints ---
      const endpointMatch = path.match(/^\/v1\/apps\/([^/]+)\/endpoints\/([^/]+)$/);
      if (endpointMatch) {
        const [, appId, endpointId] = endpointMatch;
        if (method === "PUT") {
          const body = await req.json();
          this.service.updateEndpoint(appId, endpointId, body);
          return this.json({ Message: "Accepted", RequestID: ctx.requestId }, ctx, 202);
        }
        if (method === "GET") {
          const endpoint = this.service.getEndpoint(appId, endpointId);
          return this.json(this.endpointToJson(endpoint), ctx);
        }
        if (method === "DELETE") {
          const endpoint = this.service.deleteEndpoint(appId, endpointId);
          return this.json(this.endpointToJson(endpoint), ctx);
        }
      }

      // --- Campaigns ---
      const campaignMatch = path.match(/^\/v1\/apps\/([^/]+)\/campaigns\/([^/]+)$/);
      if (campaignMatch) {
        const [, appId, campaignId] = campaignMatch;
        if (method === "GET") {
          const campaign = this.service.getCampaign(appId, campaignId);
          return this.json(this.campaignToJson(campaign), ctx);
        }
        if (method === "DELETE") {
          const campaign = this.service.deleteCampaign(appId, campaignId);
          return this.json(this.campaignToJson(campaign), ctx);
        }
      }

      const campaignsMatch = path.match(/^\/v1\/apps\/([^/]+)\/campaigns$/);
      if (campaignsMatch) {
        const appId = campaignsMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const campaign = this.service.createCampaign(appId, body.WriteCampaignRequest ?? body, ctx.region);
          return this.json(this.campaignToJson(campaign), ctx, 201);
        }
        if (method === "GET") {
          const campaigns = this.service.getCampaigns(appId);
          return this.json({ Item: campaigns.map((c) => this.campaignToJson(c)) }, ctx);
        }
      }

      // --- Segments ---
      const segmentMatch = path.match(/^\/v1\/apps\/([^/]+)\/segments\/([^/]+)$/);
      if (segmentMatch) {
        const [, appId, segmentId] = segmentMatch;
        if (method === "GET") {
          const segment = this.service.getSegment(appId, segmentId);
          return this.json(this.segmentToJson(segment), ctx);
        }
        if (method === "DELETE") {
          const segment = this.service.deleteSegment(appId, segmentId);
          return this.json(this.segmentToJson(segment), ctx);
        }
      }

      const segmentsMatch = path.match(/^\/v1\/apps\/([^/]+)\/segments$/);
      if (segmentsMatch) {
        const appId = segmentsMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const segment = this.service.createSegment(appId, body.WriteSegmentRequest ?? body, ctx.region);
          return this.json(this.segmentToJson(segment), ctx, 201);
        }
        if (method === "GET") {
          const segments = this.service.getSegments(appId);
          return this.json({ Item: segments.map((s) => this.segmentToJson(s)) }, ctx);
        }
      }

      // --- Apps ---
      const appMatch = path.match(/^\/v1\/apps\/([^/]+)$/);
      if (appMatch) {
        const appId = appMatch[1];
        if (method === "GET") {
          const app = this.service.getApp(appId);
          return this.json(this.appToJson(app), ctx);
        }
        if (method === "DELETE") {
          const app = this.service.deleteApp(appId);
          return this.json(this.appToJson(app), ctx);
        }
      }

      // POST /v1/apps
      if (path === "/v1/apps" && method === "POST") {
        const body = await req.json();
        const name = body.CreateApplicationRequest?.Name ?? body.Name;
        const app = this.service.createApp(name, ctx.region);
        return this.json(this.appToJson(app), ctx, 201);
      }

      // GET /v1/apps
      if (path === "/v1/apps" && method === "GET") {
        const apps = this.service.getApps();
        return this.json({ Item: apps.map((a) => this.appToJson(a)) }, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown Pinpoint operation: ${method} ${path}`, 400),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private appToJson(app: any): any {
    return { Arn: app.arn, Id: app.id, Name: app.name, CreationDate: app.creationDate };
  }

  private segmentToJson(segment: any): any {
    return {
      Id: segment.id,
      ApplicationId: segment.applicationId,
      Arn: segment.arn,
      Name: segment.name,
      SegmentType: segment.segmentType,
      CreationDate: segment.creationDate,
      Version: segment.version,
    };
  }

  private campaignToJson(campaign: any): any {
    return {
      Id: campaign.id,
      ApplicationId: campaign.applicationId,
      Arn: campaign.arn,
      Name: campaign.name,
      State: campaign.state,
      CreationDate: campaign.creationDate,
      SegmentId: campaign.segmentId,
      SegmentVersion: campaign.segmentVersion,
    };
  }

  private endpointToJson(endpoint: any): any {
    return {
      Id: endpoint.id,
      ApplicationId: endpoint.applicationId,
      ChannelType: endpoint.channelType,
      Address: endpoint.address,
      Attributes: endpoint.attributes,
      EndpointStatus: endpoint.endpointStatus,
      EffectiveDate: endpoint.effectiveDate,
    };
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
