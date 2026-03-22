import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { MediaPackageService } from "./mediapackage-service";

export class MediaPackageHandler {
  constructor(private service: MediaPackageService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Origin endpoints: /origin_endpoints/{id}
      const epIdMatch = path.match(/^\/origin_endpoints\/(.+)$/);
      if (epIdMatch) {
        const id = decodeURIComponent(epIdMatch[1]);
        if (method === "GET") return this.json(this.service.describeOriginEndpoint(id), ctx);
        if (method === "DELETE") { this.service.deleteOriginEndpoint(id); return this.json({}, ctx); }
      }

      if (path === "/origin_endpoints") {
        if (method === "POST") {
          const body = await req.json();
          const ep = this.service.createOriginEndpoint(body.id ?? body.Id ?? "", body.channelId ?? body.ChannelId ?? "", body.description ?? body.Description ?? "", ctx.region);
          return this.json(ep, ctx, 200);
        }
        if (method === "GET") return this.json({ originEndpoints: this.service.listOriginEndpoints() }, ctx);
      }

      // Channels: /channels/{id}
      const chIdMatch = path.match(/^\/channels\/(.+)$/);
      if (chIdMatch) {
        const id = decodeURIComponent(chIdMatch[1]);
        if (method === "GET") return this.json(this.service.describeChannel(id), ctx);
        if (method === "DELETE") { this.service.deleteChannel(id); return this.json({}, ctx); }
      }

      if (path === "/channels") {
        if (method === "POST") {
          const body = await req.json();
          const ch = this.service.createChannel(body.id ?? body.Id ?? "", body.description ?? body.Description ?? "", ctx.region, body.tags ?? body.Tags);
          return this.json(ch, ctx, 200);
        }
        if (method === "GET") return this.json({ channels: this.service.listChannels() }, ctx);
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown MediaPackage operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
