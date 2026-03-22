import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { IoTDataService } from "./iotdata-service";

export class IoTDataHandler {
  constructor(private service: IoTDataService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /topics/{topic} — Publish
      const topicMatch = path.match(/^\/topics\/(.+)$/);
      if (topicMatch && method === "POST") {
        const payload = await req.text();
        this.service.publish(decodeURIComponent(topicMatch[1]), payload);
        return new Response(null, { status: 200, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // GET /things/{thingName}/shadow — GetThingShadow
      const getShadow = path.match(/^\/things\/([^/]+)\/shadow$/);
      if (getShadow && method === "GET") {
        const shadowName = url.searchParams.get("name") ?? undefined;
        const shadow = this.service.getThingShadow(getShadow[1], shadowName);
        return new Response(shadow.payload, { headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
      }

      // POST /things/{thingName}/shadow — UpdateThingShadow
      if (getShadow && method === "POST") {
        const payload = await req.text();
        const shadowName = url.searchParams.get("name") ?? undefined;
        const shadow = this.service.updateThingShadow(getShadow[1], payload, shadowName);
        return new Response(shadow.payload, { headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
      }

      // DELETE /things/{thingName}/shadow — DeleteThingShadow
      if (getShadow && method === "DELETE") {
        const shadowName = url.searchParams.get("name") ?? undefined;
        const shadow = this.service.deleteThingShadow(getShadow[1], shadowName);
        return new Response(shadow.payload, { headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
      }

      // GET /api/things/shadow/ListNamedShadowsForThing/{thingName}
      const listShadows = path.match(/^\/api\/things\/shadow\/ListNamedShadowsForThing\/(.+)$/);
      if (listShadows && method === "GET") {
        const results = this.service.listNamedShadowsForThing(listShadows[1]);
        return this.json({ results, timestamp: Date.now() }, ctx);
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
