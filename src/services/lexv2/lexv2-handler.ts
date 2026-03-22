import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { LexV2Service } from "./lexv2-service";

export class LexV2Handler {
  constructor(private service: LexV2Service) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // DELETE /bots/{botId}
      const botMatch = path.match(/^\/bots\/([^/]+)\/?$/);
      if (botMatch && method === "DELETE") {
        this.service.deleteBot(botMatch[1]);
        return this.json({ botId: botMatch[1], botStatus: "Deleting" }, ctx);
      }
      // GET /bots/{botId} — DescribeBot
      if (botMatch && method === "GET") {
        const bot = this.service.describeBot(botMatch[1]);
        return this.json(bot, ctx);
      }

      // PUT /bots — CreateBot (no trailing slash matters)
      if ((path === "/bots" || path === "/bots/") && method === "PUT") {
        const body = await req.json();
        const bot = this.service.createBot(body.botName, body.description, body.roleArn);
        return this.json(bot, ctx);
      }

      // POST /bots — ListBots
      if ((path === "/bots" || path === "/bots/") && method === "POST") {
        const bots = this.service.listBots();
        return this.json({ botSummaries: bots.map((b) => ({ botId: b.botId, botName: b.botName, botStatus: b.botStatus })) }, ctx);
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
