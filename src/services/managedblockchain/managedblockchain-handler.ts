import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ManagedBlockchainService } from "./managedblockchain-service";

export class ManagedBlockchainHandler {
  constructor(private service: ManagedBlockchainService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // DELETE /networks/{networkId}/members/{memberId}/nodes/{nodeId}
      const nodeIdMatch = path.match(/^\/networks\/([^/]+)\/members\/([^/]+)\/nodes\/([^/]+)$/);
      if (nodeIdMatch) {
        const [, netId, memId, nodeId] = nodeIdMatch;
        if (method === "GET") return this.json({ node: this.service.getNode(netId, memId, nodeId) }, ctx);
        if (method === "DELETE") { this.service.deleteNode(netId, memId, nodeId); return this.json({}, ctx); }
      }

      // POST/GET /networks/{networkId}/members/{memberId}/nodes
      const nodesMatch = path.match(/^\/networks\/([^/]+)\/members\/([^/]+)\/nodes$/);
      if (nodesMatch) {
        const [, netId, memId] = nodesMatch;
        if (method === "POST") {
          const body = await req.json();
          const cfg = body.NodeConfiguration ?? {};
          const node = this.service.createNode(netId, memId, cfg.InstanceType ?? "bc.t3.small", cfg.AvailabilityZone ?? "us-east-1a");
          return this.json({ node }, ctx, 200);
        }
        if (method === "GET") return this.json({ nodes: this.service.listNodes(netId, memId) }, ctx);
      }

      // GET /networks/{networkId}/members/{memberId}
      const memberIdMatch = path.match(/^\/networks\/([^/]+)\/members\/([^/]+)$/);
      if (memberIdMatch) {
        const [, netId, memId] = memberIdMatch;
        if (method === "GET") return this.json({ member: this.service.getMember(netId, memId) }, ctx);
      }

      // POST/GET /networks/{networkId}/members
      const membersMatch = path.match(/^\/networks\/([^/]+)\/members$/);
      if (membersMatch) {
        const netId = membersMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const cfg = body.MemberConfiguration ?? {};
          const member = this.service.createMember(netId, cfg.Name ?? "", cfg.Description ?? "");
          return this.json({ member }, ctx, 200);
        }
        if (method === "GET") return this.json({ members: this.service.listMembers(netId) }, ctx);
      }

      // GET /networks/{networkId}
      const networkIdMatch = path.match(/^\/networks\/([^/]+)$/);
      if (networkIdMatch && !path.includes("/members")) {
        if (method === "GET") {
          const n = this.service.getNetwork(networkIdMatch[1]);
          return this.json({ Network: { Id: n.id, Name: n.name, Description: n.description, Framework: n.framework, FrameworkVersion: n.frameworkVersion, Status: n.status, CreationDate: n.creationDate } }, ctx);
        }
      }

      // POST/GET /networks
      if (path === "/networks") {
        if (method === "POST") {
          const body = await req.json();
          const net = this.service.createNetwork(body.Name ?? "", body.Framework ?? "HYPERLEDGER_FABRIC", body.FrameworkVersion ?? "1.4", body.Description);
          return this.json({ NetworkId: net.id, MemberId: "" }, ctx, 200);
        }
        if (method === "GET") {
          const nets = this.service.listNetworks();
          return this.json({ Networks: nets.map(n => ({ Id: n.id, Name: n.name, Framework: n.framework, Status: n.status, CreationDate: n.creationDate })) }, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown ManagedBlockchain operation: ${method} ${path}`, 400), ctx.requestId);
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
