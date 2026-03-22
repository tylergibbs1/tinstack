import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { GreengrassService } from "./greengrass-service";

export class GreengrassHandler {
  constructor(private service: GreengrassService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Groups
      if (path === "/greengrass/groups" && method === "POST") {
        const body = await req.json();
        const g = this.service.createGroup(body.Name);
        return this.json({ Id: g.id, Arn: g.arn, Name: g.name, CreationTimestamp: g.creationTimestamp }, ctx);
      }
      if (path === "/greengrass/groups" && method === "GET") {
        return this.json({ Groups: this.service.listGroups().map((g) => ({ Id: g.id, Arn: g.arn, Name: g.name })) }, ctx);
      }
      const gMatch = path.match(/^\/greengrass\/groups\/([^/]+)$/);
      if (gMatch && method === "GET") {
        const g = this.service.getGroup(gMatch[1]);
        return this.json({ Id: g.id, Arn: g.arn, Name: g.name }, ctx);
      }
      if (gMatch && method === "DELETE") {
        this.service.deleteGroup(gMatch[1]);
        return new Response(null, { status: 200, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // Core Definitions
      if (path === "/greengrass/definition/cores" && method === "POST") {
        const body = await req.json();
        const cd = this.service.createCoreDefinition(body.Name);
        return this.json({ Id: cd.id, Arn: cd.arn, Name: cd.name }, ctx);
      }
      if (path === "/greengrass/definition/cores" && method === "GET") {
        return this.json({ Definitions: this.service.listCoreDefinitions() }, ctx);
      }

      // Function Definitions
      if (path === "/greengrass/definition/functions" && method === "POST") {
        const body = await req.json();
        const fd = this.service.createFunctionDefinition(body.Name);
        return this.json({ Id: fd.id, Arn: fd.arn, Name: fd.name }, ctx);
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
