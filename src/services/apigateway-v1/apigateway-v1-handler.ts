import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ApiGatewayV1Service } from "./apigateway-v1-service";

export class ApiGatewayV1Handler {
  constructor(private service: ApiGatewayV1Service) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /restapis — CreateRestApi
      if (path === "/restapis" && method === "POST") {
        const body = await req.json();
        const api = this.service.createRestApi(body.name, body.description, body.endpointConfiguration?.types);
        return this.json(this.apiToJson(api), ctx, 201);
      }

      // GET /restapis — GetRestApis
      if (path === "/restapis" && method === "GET") {
        return this.json({ item: this.service.getRestApis().map((a) => this.apiToJson(a)) }, ctx);
      }

      // Stages: GET/POST /restapis/{id}/stages
      const stagesMatch = path.match(/^\/restapis\/([^/]+)\/stages$/);
      if (stagesMatch) {
        const apiId = stagesMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const stage = this.service.createStage(apiId, body.stageName, body.deploymentId, body.description);
          return this.json({ stageName: stage.stageName, deploymentId: stage.deploymentId, description: stage.description, createdDate: stage.createdDate }, ctx, 201);
        }
        if (method === "GET") {
          const stages = this.service.getStages(apiId);
          return this.json({ item: stages.map((s) => ({ stageName: s.stageName, deploymentId: s.deploymentId, description: s.description, createdDate: s.createdDate })) }, ctx);
        }
      }

      // Deployments: POST /restapis/{id}/deployments
      const deploymentsMatch = path.match(/^\/restapis\/([^/]+)\/deployments$/);
      if (deploymentsMatch && method === "POST") {
        const body = await req.json();
        const deployment = this.service.createDeployment(deploymentsMatch[1], body.description);
        return this.json({ id: deployment.id, description: deployment.description, createdDate: deployment.createdDate }, ctx, 201);
      }

      // PutMethod: PUT /restapis/{id}/resources/{resourceId}/methods/{httpMethod}
      const methodMatch = path.match(/^\/restapis\/([^/]+)\/resources\/([^/]+)\/methods\/([^/]+)$/);
      if (methodMatch && method === "PUT") {
        const body = await req.json();
        const m = this.service.putMethod(methodMatch[1], methodMatch[2], methodMatch[3], body.authorizationType);
        return this.json({ httpMethod: m.httpMethod, authorizationType: m.authorizationType, apiKeyRequired: m.apiKeyRequired }, ctx, 201);
      }

      // Resources: POST/GET /restapis/{id}/resources or /restapis/{id}/resources/{parentId}
      const resourcesMatch = path.match(/^\/restapis\/([^/]+)\/resources$/);
      if (resourcesMatch && method === "GET") {
        const resources = this.service.getResources(resourcesMatch[1]);
        return this.json({ item: resources.map((r) => this.resourceToJson(r)) }, ctx);
      }

      const createResourceMatch = path.match(/^\/restapis\/([^/]+)\/resources\/([^/]+)$/);
      if (createResourceMatch && method === "POST") {
        const body = await req.json();
        const resource = this.service.createResource(createResourceMatch[1], createResourceMatch[2], body.pathPart);
        return this.json(this.resourceToJson(resource), ctx, 201);
      }

      // Single API: GET/DELETE /restapis/{id}
      const apiMatch = path.match(/^\/restapis\/([^/]+)$/);
      if (apiMatch) {
        const apiId = apiMatch[1];
        if (method === "GET") return this.json(this.apiToJson(this.service.getRestApi(apiId)), ctx);
        if (method === "DELETE") { this.service.deleteRestApi(apiId); return this.empty(ctx); }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown API Gateway v1 operation: ${method} ${path}`, 400), ctx.requestId);
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

  private empty(ctx: RequestContext): Response {
    return new Response(null, { status: 202, headers: { "x-amzn-RequestId": ctx.requestId } });
  }

  private apiToJson(api: any): any {
    return {
      id: api.id, name: api.name, description: api.description,
      createdDate: api.createdDate,
      endpointConfiguration: api.endpointConfiguration,
    };
  }

  private resourceToJson(r: any): any {
    return {
      id: r.id, parentId: r.parentId, pathPart: r.pathPart, path: r.path,
      resourceMethods: Object.keys(r.methods).length > 0
        ? Object.fromEntries(Object.entries(r.methods).map(([k, v]: any) => [k, { httpMethod: v.httpMethod, authorizationType: v.authorizationType }]))
        : undefined,
    };
  }
}
