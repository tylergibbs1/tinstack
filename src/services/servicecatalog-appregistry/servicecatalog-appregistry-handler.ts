import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ServiceCatalogAppRegistryService } from "./servicecatalog-appregistry-service";

export class ServiceCatalogAppRegistryHandler {
  constructor(private service: ServiceCatalogAppRegistryService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /applications — CreateApplication
      if (path === "/applications" && method === "POST") {
        const body = await req.json();
        const app = this.service.createApplication(body.name, body.description);
        return this.json({ application: { id: app.id, arn: app.arn, name: app.name, description: app.description, creationTime: app.creationTime } }, ctx, 201);
      }

      // GET /applications — ListApplications
      if (path === "/applications" && method === "GET") {
        const apps = this.service.listApplications();
        return this.json({ applications: apps.map((a) => ({ id: a.id, arn: a.arn, name: a.name })) }, ctx);
      }

      const appMatch = path.match(/^\/applications\/([^/]+)$/);
      if (appMatch && method === "GET") {
        const app = this.service.getApplication(appMatch[1]);
        return this.json({ id: app.id, arn: app.arn, name: app.name, description: app.description, creationTime: app.creationTime }, ctx);
      }
      if (appMatch && method === "DELETE") {
        this.service.deleteApplication(appMatch[1]);
        return this.json({ application: { id: appMatch[1] } }, ctx);
      }

      // PUT /applications/{id}/resources/{resourceType}/{resource}
      const assocMatch = path.match(/^\/applications\/([^/]+)\/resources\/([^/]+)\/(.+)$/);
      if (assocMatch && method === "PUT") {
        this.service.associateResource(assocMatch[1], assocMatch[2], decodeURIComponent(assocMatch[3]));
        return this.json({ applicationArn: this.service.getApplication(assocMatch[1]).arn, resourceArn: decodeURIComponent(assocMatch[3]) }, ctx);
      }

      // GET /applications/{id}/resources
      const listResMatch = path.match(/^\/applications\/([^/]+)\/resources$/);
      if (listResMatch && method === "GET") {
        const resources = this.service.listAssociatedResources(listResMatch[1]);
        return this.json({ resources }, ctx);
      }

      return jsonErrorResponse(new AwsError("NotFound", "Route not found", 404), ctx.requestId);
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
