import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { BedrockAgentService } from "./bedrockagent-service";

export class BedrockAgentHandler {
  constructor(private service: BedrockAgentService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    // Normalize trailing slashes
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method;

    try {
      // Data sources: /knowledgebases/{kbId}/datasources/{dsId}
      const dsIdMatch = path.match(/^\/knowledgebases\/([^/]+)\/datasources\/([^/]+)$/);
      if (dsIdMatch) {
        const [, kbId, dsId] = dsIdMatch;
        if (method === "GET") {
          const ds = this.service.getDataSource(kbId, dsId);
          return this.json({ dataSource: ds }, ctx);
        }
      }

      // Data sources list/create: /knowledgebases/{kbId}/datasources
      const dsListMatch = path.match(/^\/knowledgebases\/([^/]+)\/datasources$/);
      if (dsListMatch) {
        const kbId = dsListMatch[1];
        if (method === "PUT") {
          const body = await req.json();
          const ds = this.service.createDataSource(kbId, body.name, body.dataSourceConfiguration, body.description);
          return this.json({ dataSource: ds }, ctx);
        }
        if (method === "POST" || method === "GET") {
          return this.json({ dataSourceSummaries: this.service.listDataSources(kbId) }, ctx);
        }
      }

      // Knowledge bases: /knowledgebases/{id}
      const kbIdMatch = path.match(/^\/knowledgebases\/([^/]+)$/);
      if (kbIdMatch) {
        const id = kbIdMatch[1];
        if (method === "GET") return this.json({ knowledgeBase: this.service.getKnowledgeBase(id) }, ctx);
        if (method === "DELETE") { this.service.deleteKnowledgeBase(id); return this.json({ knowledgeBaseId: id, status: "DELETING" }, ctx); }
      }

      if (path === "/knowledgebases") {
        if (method === "PUT") {
          const body = await req.json();
          const kb = this.service.createKnowledgeBase(body.name, ctx.region, body.roleArn, body.knowledgeBaseConfiguration, body.storageConfiguration, body.description);
          return this.json({ knowledgeBase: kb }, ctx);
        }
        if (method === "POST" || method === "GET") {
          return this.json({ knowledgeBaseSummaries: this.service.listKnowledgeBases() }, ctx);
        }
      }

      // Agents: /agents/{agentId}
      const agentIdMatch = path.match(/^\/agents\/([^/]+)$/);
      if (agentIdMatch) {
        const id = agentIdMatch[1];
        if (method === "GET") return this.json({ agent: this.service.getAgent(id) }, ctx);
        if (method === "DELETE") { this.service.deleteAgent(id); return this.json({ agentId: id, agentStatus: "DELETING" }, ctx); }
      }

      if (path === "/agents") {
        if (method === "PUT") {
          const body = await req.json();
          const agent = this.service.createAgent(body.agentName, ctx.region, body.description, body.foundationModel, body.instruction);
          return this.json({ agent }, ctx);
        }
        if (method === "POST" || method === "GET") {
          return this.json({ agentSummaries: this.service.listAgents() }, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown BedrockAgent operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
