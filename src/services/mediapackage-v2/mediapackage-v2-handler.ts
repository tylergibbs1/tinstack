import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { MediaPackageV2Service } from "./mediapackage-v2-service";

export class MediaPackageV2Handler {
  constructor(private service: MediaPackageV2Service) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      if (path === "/channelGroup" && method === "POST") {
        const body = await req.json();
        const cg = this.service.createChannelGroup(body.ChannelGroupName, body.Description);
        return this.json({ ChannelGroupName: cg.channelGroupName, Arn: cg.arn, Description: cg.description, CreatedAt: cg.createdAt, ModifiedAt: cg.createdAt }, ctx);
      }
      if (path === "/channelGroup" && method === "GET") {
        return this.json({ Items: this.service.listChannelGroups().map((cg) => ({ ChannelGroupName: cg.channelGroupName, Arn: cg.arn })) }, ctx);
      }

      const cgMatch = path.match(/^\/channelGroup\/([^/]+)$/);
      if (cgMatch && method === "GET") {
        const cg = this.service.getChannelGroup(cgMatch[1]);
        return this.json({ ChannelGroupName: cg.channelGroupName, Arn: cg.arn, Description: cg.description, CreatedAt: cg.createdAt }, ctx);
      }
      if (cgMatch && method === "DELETE") {
        this.service.deleteChannelGroup(cgMatch[1]);
        return new Response(null, { status: 200, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      const chCreate = path.match(/^\/channelGroup\/([^/]+)\/channel$/);
      if (chCreate && method === "POST") {
        const body = await req.json();
        const ch = this.service.createChannel(chCreate[1], body.ChannelName, body.Description);
        return this.json({ ChannelName: ch.channelName, Arn: ch.arn, ChannelGroupName: ch.channelGroupName, Description: ch.description }, ctx);
      }
      if (chCreate && method === "GET") {
        return this.json({ Items: this.service.listChannels(chCreate[1]).map((ch) => ({ ChannelName: ch.channelName, Arn: ch.arn })) }, ctx);
      }

      const chGet = path.match(/^\/channelGroup\/([^/]+)\/channel\/([^/]+)$/);
      if (chGet && method === "GET") {
        const ch = this.service.getChannel(chGet[1], chGet[2]);
        return this.json({ ChannelName: ch.channelName, Arn: ch.arn, ChannelGroupName: ch.channelGroupName }, ctx);
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
