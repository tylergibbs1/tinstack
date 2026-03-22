import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ApiGatewayManagementService } from "./apigateway-management-service";

export class ApiGatewayManagementHandler {
  constructor(private service: ApiGatewayManagementService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /@connections/{connectionId} — PostToConnection
      // GET /@connections/{connectionId} — GetConnection
      // DELETE /@connections/{connectionId} — DeleteConnection
      const match = path.match(/^\/@connections\/(.+)$/);
      if (match) {
        const connectionId = decodeURIComponent(match[1]);
        if (method === "POST") {
          const data = await req.text();
          this.service.postToConnection(connectionId, data);
          return new Response(null, { status: 200, headers: { "x-amzn-RequestId": ctx.requestId } });
        }
        if (method === "GET") {
          const conn = this.service.getConnection(connectionId);
          return this.json({ connectedAt: conn.connectedAt, identity: conn.identity, lastActiveAt: conn.lastActiveAt }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteConnection(connectionId);
          return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
        }
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
