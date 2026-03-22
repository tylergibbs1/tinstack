import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { VpcLatticeService } from "./vpc-lattice-service";

export class VpcLatticeHandler {
  constructor(private service: VpcLatticeService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Service networks
      if ((path === "/servicenetworks" || path === "/servicenetworks/") && method === "GET")
        return this.json({ items: this.service.listServiceNetworks().map((s) => ({ id: s.id, name: s.name, arn: s.arn, status: s.status, authType: s.authType, createdAt: new Date(s.createdAt * 1000).toISOString() })) }, ctx);
      if ((path === "/servicenetworks" || path === "/servicenetworks/") && method === "POST") {
        const body = await req.json();
        const sn = this.service.createServiceNetwork(body.name, body.authType, body.tags, ctx.region);
        return this.json({ id: sn.id, name: sn.name, arn: sn.arn, status: sn.status, authType: sn.authType }, ctx, 201);
      }
      const snMatch = path.match(/^\/servicenetworks\/([^/]+)$/);
      if (snMatch) {
        const id = decodeURIComponent(snMatch[1]);
        if (method === "GET") { const sn = this.service.getServiceNetwork(id); return this.json({ id: sn.id, name: sn.name, arn: sn.arn, status: sn.status, authType: sn.authType, createdAt: new Date(sn.createdAt * 1000).toISOString() }, ctx); }
        if (method === "DELETE") { this.service.deleteServiceNetwork(id); return this.json({}, ctx); }
      }

      // Services
      if ((path === "/services" || path === "/services/") && method === "GET")
        return this.json({ items: this.service.listServices().map((s) => ({ id: s.id, name: s.name, arn: s.arn, status: s.status, dnsEntry: s.dnsEntry, authType: s.authType, createdAt: new Date(s.createdAt * 1000).toISOString() })) }, ctx);
      if ((path === "/services" || path === "/services/") && method === "POST") {
        const body = await req.json();
        const svc = this.service.createService(body.name, body.authType, body.tags, ctx.region);
        return this.json({ id: svc.id, name: svc.name, arn: svc.arn, status: svc.status, dnsEntry: svc.dnsEntry, authType: svc.authType }, ctx, 201);
      }
      const svcMatch = path.match(/^\/services\/([^/]+)$/);
      if (svcMatch) {
        const id = decodeURIComponent(svcMatch[1]);
        if (method === "GET") { const svc = this.service.getService(id); return this.json({ id: svc.id, name: svc.name, arn: svc.arn, status: svc.status, dnsEntry: svc.dnsEntry, authType: svc.authType, createdAt: new Date(svc.createdAt * 1000).toISOString() }, ctx); }
        if (method === "DELETE") { this.service.deleteService(id); return this.json({}, ctx); }
      }

      // Target groups
      if ((path === "/targetgroups" || path === "/targetgroups/") && method === "GET")
        return this.json({ items: this.service.listTargetGroups().map((t) => ({ id: t.id, name: t.name, arn: t.arn, type: t.type, status: t.status, createdAt: new Date(t.createdAt * 1000).toISOString() })) }, ctx);
      if ((path === "/targetgroups" || path === "/targetgroups/") && method === "POST") {
        const body = await req.json();
        const tg = this.service.createTargetGroup(body.name, body.type, body.config, body.tags, ctx.region);
        return this.json({ id: tg.id, name: tg.name, arn: tg.arn, type: tg.type, status: tg.status, config: tg.config }, ctx, 201);
      }
      const tgMatch = path.match(/^\/targetgroups\/([^/]+)$/);
      if (tgMatch) {
        const id = decodeURIComponent(tgMatch[1]);
        if (method === "GET") { const tg = this.service.getTargetGroup(id); return this.json({ id: tg.id, name: tg.name, arn: tg.arn, type: tg.type, status: tg.status, config: tg.config, createdAt: new Date(tg.createdAt * 1000).toISOString() }, ctx); }
      }

      // Register/deregister/list targets
      const regMatch = path.match(/^\/targetgroups\/([^/]+)\/registertargets$/);
      if (regMatch && method === "POST") {
        const body = await req.json();
        const result = this.service.registerTargets(decodeURIComponent(regMatch[1]), body.targets);
        return this.json(result, ctx);
      }
      const deregMatch = path.match(/^\/targetgroups\/([^/]+)\/deregistertargets$/);
      if (deregMatch && method === "POST") {
        const body = await req.json();
        const result = this.service.deregisterTargets(decodeURIComponent(deregMatch[1]), body.targets);
        return this.json(result, ctx);
      }
      const listTargetsMatch = path.match(/^\/targetgroups\/([^/]+)\/listtargets$/);
      if (listTargetsMatch && method === "POST") {
        const items = this.service.listTargets(decodeURIComponent(listTargetsMatch[1]));
        return this.json({ items }, ctx);
      }

      // Tags
      if (path.startsWith("/tags/")) {
        const arn = decodeURIComponent(path.slice("/tags/".length));
        if (method === "POST") { const body = await req.json(); this.service.tagResource(arn, body.tags ?? {}); return this.json({}, ctx); }
        if (method === "DELETE") { const keys = url.searchParams.getAll("tagKeys"); this.service.untagResource(arn, keys); return this.json({}, ctx); }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown VPC Lattice operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }
}
