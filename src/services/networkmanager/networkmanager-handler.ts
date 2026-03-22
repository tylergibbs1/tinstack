import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { NetworkManagerService } from "./networkmanager-service";

function toGlobalNetwork(gn: any) {
  return { GlobalNetworkId: gn.globalNetworkId, GlobalNetworkArn: gn.globalNetworkArn, Description: gn.description, State: gn.state };
}
function toSite(s: any) {
  return { SiteId: s.siteId, SiteArn: s.siteArn, GlobalNetworkId: s.globalNetworkId, Description: s.description };
}
function toDevice(d: any) {
  return { DeviceId: d.deviceId, DeviceArn: d.deviceArn, GlobalNetworkId: d.globalNetworkId, Description: d.description };
}

export class NetworkManagerHandler {
  constructor(private service: NetworkManagerService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      if (path === "/global-networks" && method === "POST") {
        const body = await req.json();
        const gn = this.service.createGlobalNetwork(body.Description);
        return this.json({ GlobalNetwork: toGlobalNetwork(gn) }, ctx);
      }
      if (path === "/global-networks" && method === "GET") {
        return this.json({ GlobalNetworks: this.service.listGlobalNetworks().map(toGlobalNetwork) }, ctx);
      }

      const gnMatch = path.match(/^\/global-networks\/([^/]+)$/);
      if (gnMatch && method === "GET") {
        return this.json({ GlobalNetwork: toGlobalNetwork(this.service.getGlobalNetwork(gnMatch[1])) }, ctx);
      }
      if (gnMatch && method === "DELETE") {
        this.service.deleteGlobalNetwork(gnMatch[1]);
        return this.json({ GlobalNetwork: { GlobalNetworkId: gnMatch[1], State: "DELETING" } }, ctx);
      }

      const sitesMatch = path.match(/^\/global-networks\/([^/]+)\/sites$/);
      if (sitesMatch && method === "POST") {
        const body = await req.json();
        const s = this.service.createSite(sitesMatch[1], body.Description);
        return this.json({ Site: toSite(s) }, ctx);
      }
      if (sitesMatch && method === "GET") {
        return this.json({ Sites: this.service.getSites(sitesMatch[1]).map(toSite) }, ctx);
      }

      const devMatch = path.match(/^\/global-networks\/([^/]+)\/devices$/);
      if (devMatch && method === "POST") {
        const body = await req.json();
        const d = this.service.createDevice(devMatch[1], body.Description);
        return this.json({ Device: toDevice(d) }, ctx);
      }
      if (devMatch && method === "GET") {
        return this.json({ Devices: this.service.getDevices(devMatch[1]).map(toDevice) }, ctx);
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
