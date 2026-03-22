import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { WorkSpacesWebService } from "./workspacesweb-service";

export class WorkSpacesWebHandler {
  constructor(private service: WorkSpacesWebService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Portals
      const portalArnMatch = path.match(/^\/portals\/(.+)$/);
      if (portalArnMatch && !path.includes("/browserSettings") && !path.includes("/networkSettings") && !path.includes("/userSettings")) {
        const portalArn = decodeURIComponent(portalArnMatch[1]);
        if (method === "GET") return this.json({ portal: this.service.getPortal(portalArn) }, ctx);
        if (method === "DELETE") { this.service.deletePortal(portalArn); return this.json({}, ctx); }
      }

      if (path === "/portals") {
        if (method === "POST") {
          const body = await req.json().catch(() => ({}));
          const portal = this.service.createPortal(body.displayName ?? "", ctx.region);
          return this.json({ portalArn: portal.portalArn, portalEndpoint: portal.portalEndpoint }, ctx);
        }
        if (method === "GET") return this.json({ portals: this.service.listPortals() }, ctx);
      }

      // Browser Settings
      const bsArnMatch = path.match(/^\/browserSettings\/(.+)$/);
      if (bsArnMatch) {
        if (method === "GET") return this.json({ browserSettings: this.service.getBrowserSettings(decodeURIComponent(bsArnMatch[1])) }, ctx);
      }
      if (path === "/browserSettings" && method === "POST") {
        const body = await req.json().catch(() => ({}));
        const bs = this.service.createBrowserSettings(body.browserPolicy ?? "{}", ctx.region);
        return this.json({ browserSettingsArn: bs.browserSettingsArn }, ctx);
      }

      // Network Settings
      const nsArnMatch = path.match(/^\/networkSettings\/(.+)$/);
      if (nsArnMatch) {
        if (method === "GET") return this.json({ networkSettings: this.service.getNetworkSettings(decodeURIComponent(nsArnMatch[1])) }, ctx);
      }
      if (path === "/networkSettings" && method === "POST") {
        const body = await req.json().catch(() => ({}));
        const ns = this.service.createNetworkSettings(body.vpcId ?? "", body.subnetIds ?? [], body.securityGroupIds ?? [], ctx.region);
        return this.json({ networkSettingsArn: ns.networkSettingsArn }, ctx);
      }

      // User Settings
      const usArnMatch = path.match(/^\/userSettings\/(.+)$/);
      if (usArnMatch) {
        if (method === "GET") return this.json({ userSettings: this.service.getUserSettings(decodeURIComponent(usArnMatch[1])) }, ctx);
      }
      if (path === "/userSettings" && method === "POST") {
        const body = await req.json().catch(() => ({}));
        const us = this.service.createUserSettings(body, ctx.region);
        return this.json({ userSettingsArn: us.userSettingsArn }, ctx);
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown WorkSpacesWeb operation: ${method} ${path}`, 400), ctx.requestId);
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
