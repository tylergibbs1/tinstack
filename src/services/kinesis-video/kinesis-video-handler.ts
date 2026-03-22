import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { KinesisVideoService } from "./kinesis-video-service";

export class KinesisVideoHandler {
  constructor(private service: KinesisVideoService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      const body = req.method === "POST" ? await req.json() : {};

      switch (path) {
        case "/createStream": {
          const arn = this.service.createStream(body.StreamName, body.MediaType, body.DataRetentionInHours, body.DeviceName, body.Tags, ctx.region);
          return this.json({ StreamARN: arn }, ctx);
        }
        case "/describeStream": {
          const s = this.service.describeStream(body.StreamName, body.StreamARN, ctx.region);
          return this.json({ StreamInfo: { StreamName: s.streamName, StreamARN: s.streamARN, Status: s.status, MediaType: s.mediaType, DataRetentionInHours: s.dataRetentionInHours, DeviceName: s.deviceName, KmsKeyId: s.kmsKeyId, Version: s.version, CreationTime: s.creationTime } }, ctx);
        }
        case "/listStreams": {
          const streams = this.service.listStreams(ctx.region);
          return this.json({ StreamInfoList: streams.map((s) => ({ StreamName: s.streamName, StreamARN: s.streamARN, Status: s.status, MediaType: s.mediaType, CreationTime: s.creationTime })) }, ctx);
        }
        case "/deleteStream":
          this.service.deleteStream(body.StreamARN, ctx.region);
          return this.json({}, ctx);
        case "/updateStream":
          this.service.updateStream(body.StreamName, body.StreamARN, body.MediaType, body.DeviceName, body.CurrentVersion, ctx.region);
          return this.json({}, ctx);
        case "/getDataEndpoint": {
          const endpoint = this.service.getDataEndpoint(body.StreamName, body.StreamARN, body.APIName, ctx.region);
          return this.json({ DataEndpoint: endpoint }, ctx);
        }
        case "/tagStream":
          this.service.tagStream(body.StreamARN, body.StreamName, body.Tags ?? {}, ctx.region);
          return this.json({}, ctx);
        case "/untagStream":
          this.service.untagStream(body.StreamARN, body.StreamName, body.TagKeyList ?? [], ctx.region);
          return this.json({}, ctx);
        case "/listTagsForStream": {
          const tags = this.service.listTagsForStream(body.StreamARN, body.StreamName, ctx.region);
          return this.json({ Tags: tags }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown Kinesis Video operation: ${path}`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }
}
