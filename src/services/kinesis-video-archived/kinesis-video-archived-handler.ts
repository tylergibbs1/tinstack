import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { KinesisVideoArchivedService } from "./kinesis-video-archived-service";

export class KinesisVideoArchivedHandler {
  constructor(private service: KinesisVideoArchivedService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      const body = await req.json();

      if (path === "/getMediaForFragmentList") {
        const result = this.service.getMediaForFragmentList(body.StreamName, body.Fragments ?? []);
        return new Response(result.payload, { headers: { "Content-Type": result.contentType, "x-amzn-RequestId": ctx.requestId } });
      }
      if (path === "/listFragments") {
        const fragments = this.service.listFragments(body.StreamName);
        return this.json({ Fragments: fragments }, ctx);
      }
      if (path === "/getHLSStreamingSessionURL") {
        const url = this.service.getHLSStreamingSessionURL(body.StreamName ?? body.StreamARN);
        return this.json({ HLSStreamingSessionURL: url }, ctx);
      }
      if (path === "/getDASHStreamingSessionURL") {
        const url = this.service.getDASHStreamingSessionURL(body.StreamName ?? body.StreamARN);
        return this.json({ DASHStreamingSessionURL: url }, ctx);
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
