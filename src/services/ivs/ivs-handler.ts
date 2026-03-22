import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { IvsService } from "./ivs-service";

export class IvsHandler {
  constructor(private service: IvsService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      if (method !== "POST") {
        return jsonErrorResponse(new AwsError("UnknownOperationException", `IVS uses POST for all operations.`, 400), ctx.requestId);
      }

      const body = await req.json().catch(() => ({}));

      switch (path) {
        case "/CreateChannel": {
          const { channel, streamKey } = this.service.createChannel(body.name, body.latencyMode, body.type, body.tags, ctx.region);
          return this.json({ channel: this.channelToJson(channel), streamKey: this.streamKeyToJson(streamKey) }, ctx);
        }
        case "/GetChannel":
          return this.json({ channel: this.channelToJson(this.service.getChannel(body.arn)) }, ctx);
        case "/ListChannels":
          return this.json({ channels: this.service.listChannels().map((c) => ({ arn: c.arn, name: c.name, latencyMode: c.latencyMode, authorized: c.authorized, tags: c.tags })) }, ctx);
        case "/DeleteChannel":
          this.service.deleteChannel(body.arn);
          return this.json({}, ctx);
        case "/CreateStreamKey": {
          const sk = this.service.createStreamKey(body.channelArn, body.tags, ctx.region);
          return this.json({ streamKey: this.streamKeyToJson(sk) }, ctx);
        }
        case "/GetStreamKey":
          return this.json({ streamKey: this.streamKeyToJson(this.service.getStreamKey(body.arn)) }, ctx);
        case "/ListStreamKeys":
          return this.json({ streamKeys: this.service.listStreamKeys(body.channelArn).map((sk) => ({ arn: sk.arn, channelArn: sk.channelArn, tags: sk.tags })) }, ctx);
        case "/DeleteStreamKey":
          this.service.deleteStreamKey(body.arn);
          return this.json({}, ctx);
        case "/GetStream":
          return this.json({ stream: this.service.getStream(body.channelArn) }, ctx);
        case "/ListStreams":
          return this.json({ streams: this.service.listStreams() }, ctx);
        default:
          return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown IVS op: ${path}`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }

  private channelToJson(c: any): any {
    return { arn: c.arn, name: c.name, latencyMode: c.latencyMode, type: c.type, authorized: c.authorized, playbackUrl: c.playbackUrl, ingestEndpoint: c.ingestEndpoint, tags: c.tags };
  }

  private streamKeyToJson(sk: any): any {
    return { arn: sk.arn, channelArn: sk.channelArn, value: sk.value, tags: sk.tags };
  }
}
