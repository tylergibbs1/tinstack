import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { MediaLiveService } from "./medialive-service";

export class MediaLiveHandler {
  constructor(private service: MediaLiveService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /prod/channels
      if (path === "/prod/channels" && method === "POST") {
        const body = await req.json();
        const ch = this.service.createChannel(body.name, body.channelClass, body.inputAttachments, body.roleArn, body.tags, ctx.region);
        return this.json({ channel: this.channelToJson(ch) }, ctx, 201);
      }
      // GET /prod/channels
      if (path === "/prod/channels" && method === "GET") {
        return this.json({ channels: this.service.listChannels().map((c) => this.channelToJson(c)) }, ctx);
      }

      // Channel actions: start/stop
      const startMatch = path.match(/^\/prod\/channels\/([^/]+)\/start$/);
      if (startMatch && method === "POST") { this.service.startChannel(startMatch[1]); return this.json({}, ctx); }
      const stopMatch = path.match(/^\/prod\/channels\/([^/]+)\/stop$/);
      if (stopMatch && method === "POST") { this.service.stopChannel(stopMatch[1]); return this.json({}, ctx); }

      // Single channel: GET/DELETE /prod/channels/{id}
      const channelMatch = path.match(/^\/prod\/channels\/([^/]+)$/);
      if (channelMatch) {
        if (method === "GET") return this.json(this.channelToJson(this.service.describeChannel(channelMatch[1])), ctx);
        if (method === "DELETE") return this.json(this.channelToJson(this.service.deleteChannel(channelMatch[1])), ctx);
      }

      // POST /prod/inputs
      if (path === "/prod/inputs" && method === "POST") {
        const body = await req.json();
        const input = this.service.createInput(body.name, body.type, body.sources, body.destinations, body.tags, ctx.region);
        return this.json({ input: this.inputToJson(input) }, ctx, 201);
      }
      // GET /prod/inputs
      if (path === "/prod/inputs" && method === "GET") {
        return this.json({ inputs: this.service.listInputs().map((i) => this.inputToJson(i)) }, ctx);
      }

      // Single input: GET/DELETE /prod/inputs/{id}
      const inputMatch = path.match(/^\/prod\/inputs\/([^/]+)$/);
      if (inputMatch) {
        if (method === "GET") return this.json(this.inputToJson(this.service.describeInput(inputMatch[1])), ctx);
        if (method === "DELETE") { this.service.deleteInput(inputMatch[1]); return this.json({}, ctx); }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown MediaLive op: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }

  private channelToJson(c: any): any {
    return { id: c.id, arn: c.arn, name: c.name, state: c.state, channelClass: c.channelClass, inputAttachments: c.inputAttachments, pipelinesRunningCount: c.pipelinesRunningCount, tags: c.tags };
  }

  private inputToJson(i: any): any {
    return { id: i.id, arn: i.arn, name: i.name, type: i.type, state: i.state, attachedChannels: i.attachedChannels, sources: i.sources, destinations: i.destinations, tags: i.tags };
  }
}
