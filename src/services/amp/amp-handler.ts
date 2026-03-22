import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { AmpService } from "./amp-service";

export class AmpHandler {
  constructor(private service: AmpService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Create/List workspaces
      if (path === "/workspaces" || path === "/workspaces/") {
        if (method === "GET") {
          const workspaces = this.service.listWorkspaces();
          return this.json({ workspaces: workspaces.map((w) => ({ workspaceId: w.workspaceId, arn: w.arn, alias: w.alias, status: w.status, createdAt: w.createdAt, tags: w.tags })) }, ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          const ws = this.service.createWorkspace(body.alias, body.tags, ctx.region);
          return this.json({ workspaceId: ws.workspaceId, arn: ws.arn, status: ws.status, tags: ws.tags }, ctx);
        }
      }

      // Single workspace
      const wsMatch = path.match(/^\/workspaces\/([^/]+)$/);
      if (wsMatch) {
        const id = wsMatch[1];
        if (method === "GET") {
          const ws = this.service.describeWorkspace(id);
          return this.json({ workspace: { workspaceId: ws.workspaceId, arn: ws.arn, alias: ws.alias, status: ws.status, prometheusEndpoint: ws.prometheusEndpoint, createdAt: ws.createdAt, tags: ws.tags } }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteWorkspace(id);
          return this.json({}, ctx);
        }
      }

      // Rule groups namespaces
      const rgListMatch = path.match(/^\/workspaces\/([^/]+)\/rulegroupsnamespaces$/);
      if (rgListMatch) {
        const wsId = rgListMatch[1];
        if (method === "GET") {
          const ns = this.service.listRuleGroupsNamespaces(wsId);
          return this.json({ ruleGroupsNamespaces: ns.map((n) => ({ name: n.name, arn: n.arn, status: n.status })) }, ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          const ns = this.service.createRuleGroupsNamespace(wsId, body.name, body.data ?? "", ctx.region);
          return this.json({ name: ns.name, arn: ns.arn, status: ns.status }, ctx);
        }
      }

      const rgMatch = path.match(/^\/workspaces\/([^/]+)\/rulegroupsnamespaces\/([^/]+)$/);
      if (rgMatch && method === "GET") {
        const ns = this.service.describeRuleGroupsNamespace(rgMatch[1], decodeURIComponent(rgMatch[2]));
        return this.json({ ruleGroupsNamespace: { name: ns.name, arn: ns.arn, data: ns.data, status: ns.status, createdAt: ns.createdAt, modifiedAt: ns.modifiedAt } }, ctx);
      }

      // Alert manager definition
      const amMatch = path.match(/^\/workspaces\/([^/]+)\/alertmanager\/definition$/);
      if (amMatch) {
        const wsId = amMatch[1];
        if (method === "GET") {
          const def = this.service.describeAlertManagerDefinition(wsId);
          return this.json({ alertManagerDefinition: { data: def.data, status: def.status, createdAt: def.createdAt, modifiedAt: def.modifiedAt } }, ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          const def = this.service.createAlertManagerDefinition(wsId, body.data ?? "");
          return this.json({ status: def.status }, ctx);
        }
      }

      // Tags
      if (path.startsWith("/tags/")) {
        const arn = decodeURIComponent(path.slice("/tags/".length));
        if (method === "POST") {
          const body = await req.json();
          this.service.tagResource(arn, body.tags ?? {});
          return this.json({}, ctx);
        }
        if (method === "DELETE") {
          const tagKeys = url.searchParams.getAll("tagKeys");
          this.service.untagResource(arn, tagKeys);
          return this.json({}, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown AMP operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }
}
