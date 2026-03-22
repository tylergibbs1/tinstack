import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ApiGatewayService } from "./apigateway-service";

export class ApiGatewayHandler {
  constructor(private service: ApiGatewayService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- APIs ---
      if (path === "/v2/apis" && method === "POST") {
        const body = await req.json();
        const api = this.service.createApi(body.name ?? body.Name, body.protocolType ?? body.ProtocolType, body.description ?? body.Description, body.tags ?? body.Tags ?? {}, ctx.region);
        return this.json(apiToJson(api), ctx, 201);
      }
      if (path === "/v2/apis" && method === "GET") {
        return this.json({ items: this.service.listApis(ctx.region).map(apiToJson) }, ctx);
      }

      const apiMatch = path.match(/^\/v2\/apis\/([^/]+)$/);
      if (apiMatch) {
        const apiId = apiMatch[1];
        if (method === "GET") return this.json(apiToJson(this.service.getApi(apiId, ctx.region)), ctx);
        if (method === "PATCH") {
          const body = await req.json();
          return this.json(apiToJson(this.service.updateApi(apiId, body.name ?? body.Name, body.description ?? body.Description, ctx.region)), ctx);
        }
        if (method === "DELETE") { this.service.deleteApi(apiId, ctx.region); return this.empty(ctx); }
      }

      // --- Routes ---
      const routesMatch = path.match(/^\/v2\/apis\/([^/]+)\/routes$/);
      if (routesMatch) {
        const apiId = routesMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const route = this.service.createRoute(apiId, body.routeKey ?? body.RouteKey, body.target ?? body.Target, body.authorizationType ?? body.AuthorizationType, ctx.region);
          return this.json(routeToJson(route, apiId), ctx, 201);
        }
        if (method === "GET") {
          return this.json({ items: this.service.getRoutes(apiId, ctx.region).map(r => routeToJson(r, apiId)) }, ctx);
        }
      }

      const routeMatch = path.match(/^\/v2\/apis\/([^/]+)\/routes\/([^/]+)$/);
      if (routeMatch) {
        const [, apiId, routeId] = routeMatch;
        if (method === "GET") return this.json(routeToJson(this.service.getRoute(apiId, routeId, ctx.region), apiId), ctx);
        if (method === "PATCH") {
          const body = await req.json();
          return this.json(routeToJson(this.service.updateRoute(apiId, routeId, body.target ?? body.Target, ctx.region), apiId), ctx);
        }
        if (method === "DELETE") { this.service.deleteRoute(apiId, routeId, ctx.region); return this.empty(ctx); }
      }

      // --- Integrations ---
      const integrationsMatch = path.match(/^\/v2\/apis\/([^/]+)\/integrations$/);
      if (integrationsMatch) {
        const apiId = integrationsMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const integration = this.service.createIntegration(apiId, body.integrationType ?? body.IntegrationType, body.integrationUri ?? body.IntegrationUri, body.integrationMethod ?? body.IntegrationMethod, body.payloadFormatVersion ?? body.PayloadFormatVersion, ctx.region);
          return this.json(integrationToJson(integration, apiId), ctx, 201);
        }
        if (method === "GET") {
          return this.json({ items: this.service.getIntegrations(apiId, ctx.region).map(i => integrationToJson(i, apiId)) }, ctx);
        }
      }

      const integrationMatch = path.match(/^\/v2\/apis\/([^/]+)\/integrations\/([^/]+)$/);
      if (integrationMatch) {
        const [, apiId, integrationId] = integrationMatch;
        if (method === "GET") return this.json(integrationToJson(this.service.getIntegration(apiId, integrationId, ctx.region), apiId), ctx);
        if (method === "PATCH") {
          const body = await req.json();
          const updated = this.service.updateIntegration(apiId, integrationId, {
            integrationType: body.integrationType ?? body.IntegrationType,
            integrationUri: body.integrationUri ?? body.IntegrationUri,
            integrationMethod: body.integrationMethod ?? body.IntegrationMethod,
            payloadFormatVersion: body.payloadFormatVersion ?? body.PayloadFormatVersion,
            description: body.description ?? body.Description,
            connectionType: body.connectionType ?? body.ConnectionType,
          }, ctx.region);
          return this.json(integrationToJson(updated, apiId), ctx);
        }
        if (method === "DELETE") { this.service.deleteIntegration(apiId, integrationId, ctx.region); return this.empty(ctx); }
      }

      // --- Stages ---
      const stagesMatch = path.match(/^\/v2\/apis\/([^/]+)\/stages$/);
      if (stagesMatch) {
        const apiId = stagesMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const stage = this.service.createStage(apiId, body.stageName ?? body.StageName, body.description ?? body.Description, body.autoDeploy ?? body.AutoDeploy ?? false, ctx.region);
          return this.json(stageToJson(stage, apiId), ctx, 201);
        }
        if (method === "GET") {
          return this.json({ items: this.service.getStages(apiId, ctx.region).map(s => stageToJson(s, apiId)) }, ctx);
        }
      }

      const stageMatch = path.match(/^\/v2\/apis\/([^/]+)\/stages\/(.+)$/);
      if (stageMatch) {
        const [, apiId, rawStageName] = stageMatch;
        const stageName = decodeURIComponent(rawStageName);
        if (method === "GET") return this.json(stageToJson(this.service.getStage(apiId, stageName, ctx.region), apiId), ctx);
        if (method === "PATCH") {
          const body = await req.json();
          const updated = this.service.updateStage(apiId, stageName, {
            description: body.description ?? body.Description,
            autoDeploy: body.autoDeploy ?? body.AutoDeploy,
            deploymentId: body.deploymentId ?? body.DeploymentId,
          }, ctx.region);
          return this.json(stageToJson(updated, apiId), ctx);
        }
        if (method === "DELETE") { this.service.deleteStage(apiId, stageName, ctx.region); return this.empty(ctx); }
      }

      // --- Deployments ---
      const deploymentsMatch = path.match(/^\/v2\/apis\/([^/]+)\/deployments$/);
      if (deploymentsMatch) {
        const apiId = deploymentsMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const deployment = this.service.createDeployment(apiId, body.description ?? body.Description, ctx.region);
          return this.json(deploymentToJson(deployment, apiId), ctx, 201);
        }
        if (method === "GET") {
          return this.json({ items: this.service.getDeployments(apiId, ctx.region).map(d => deploymentToJson(d, apiId)) }, ctx);
        }
      }

      // --- Authorizers ---
      const authorizersMatch = path.match(/^\/v2\/apis\/([^/]+)\/authorizers$/);
      if (authorizersMatch) {
        const apiId = authorizersMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const authorizer = this.service.createAuthorizer(
            apiId,
            body.name ?? body.Name,
            body.authorizerType ?? body.AuthorizerType,
            body.authorizerUri ?? body.AuthorizerUri,
            body.identitySource ?? body.IdentitySource,
            body.jwtConfiguration ?? body.JwtConfiguration,
            ctx.region,
          );
          return this.json(authorizerToJson(authorizer, apiId), ctx, 201);
        }
        if (method === "GET") {
          return this.json({ items: this.service.getAuthorizers(apiId, ctx.region).map(a => authorizerToJson(a, apiId)) }, ctx);
        }
      }

      const authorizerMatch = path.match(/^\/v2\/apis\/([^/]+)\/authorizers\/([^/]+)$/);
      if (authorizerMatch) {
        const [, apiId, authorizerId] = authorizerMatch;
        if (method === "GET") return this.json(authorizerToJson(this.service.getAuthorizer(apiId, authorizerId, ctx.region), apiId), ctx);
        if (method === "DELETE") { this.service.deleteAuthorizer(apiId, authorizerId, ctx.region); return this.empty(ctx); }
      }

      // --- Tags ---
      const tagsMatch = path.match(/^\/v2\/tags\/(.+)$/);
      if (tagsMatch) {
        const arn = decodeURIComponent(tagsMatch[1]);
        if (method === "GET") {
          return this.json({ tags: this.service.getTags(arn) }, ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          this.service.tagResource(arn, body.tags ?? body.Tags ?? {});
          return this.json({}, ctx);
        }
        if (method === "DELETE") {
          const tagKeys = url.searchParams.getAll("tagKeys");
          this.service.untagResource(arn, tagKeys);
          return this.empty(ctx);
        }
      }

      return jsonErrorResponse(new AwsError("NotFoundException", `Unknown API Gateway operation: ${method} ${path}`, 404), ctx.requestId);
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
    return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
  }
}

function apiToJson(a: any) {
  return {
    apiId: a.apiId, name: a.name, description: a.description,
    protocolType: a.protocolType, apiEndpoint: a.apiEndpoint,
    createdDate: a.createdDate, tags: a.tags,
  };
}

function routeToJson(r: any, apiId: string) {
  return { apiId, routeId: r.routeId, routeKey: r.routeKey, target: r.target, authorizationType: r.authorizationType };
}

function integrationToJson(i: any, apiId: string) {
  return {
    apiId, integrationId: i.integrationId, integrationType: i.integrationType,
    integrationUri: i.integrationUri, integrationMethod: i.integrationMethod,
    payloadFormatVersion: i.payloadFormatVersion,
  };
}

function stageToJson(s: any, apiId: string) {
  return { apiId, stageName: s.stageName, description: s.description, autoDeploy: s.autoDeploy, createdDate: s.createdDate, deploymentId: s.deploymentId };
}

function deploymentToJson(d: any, apiId: string) {
  return { apiId, deploymentId: d.deploymentId, description: d.description, createdDate: d.createdDate, deploymentStatus: d.deploymentStatus, autoDeployed: d.autoDeployed };
}

function authorizerToJson(a: any, apiId: string) {
  return {
    apiId, authorizerId: a.authorizerId, authorizerType: a.authorizerType, name: a.name,
    authorizerUri: a.authorizerUri, identitySource: a.identitySource, jwtConfiguration: a.jwtConfiguration,
  };
}
