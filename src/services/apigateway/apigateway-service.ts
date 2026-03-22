import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface HttpApi {
  apiId: string;
  name: string;
  description?: string;
  protocolType: string;
  apiEndpoint: string;
  createdDate: string;
  routes: ApiRoute[];
  integrations: ApiIntegration[];
  stages: ApiStage[];
  tags: Record<string, string>;
}

export interface ApiRoute {
  routeId: string;
  routeKey: string; // "GET /items", "POST /items/{id}", "$default"
  target?: string; // "integrations/{integrationId}"
  authorizationType?: string;
}

export interface ApiIntegration {
  integrationId: string;
  integrationType: string; // AWS_PROXY, HTTP_PROXY, MOCK
  integrationUri?: string; // Lambda ARN or HTTP URL
  integrationMethod?: string;
  payloadFormatVersion?: string;
  connectionType?: string;
  description?: string;
}

export interface ApiStage {
  stageName: string;
  description?: string;
  autoDeploy: boolean;
  createdDate: string;
  deploymentId?: string;
}

export class ApiGatewayService {
  private apis: StorageBackend<string, HttpApi>;
  private routeCounter = 0;
  private integrationCounter = 0;

  constructor(
    private accountId: string,
    private baseUrl: string,
  ) {
    this.apis = new InMemoryStorage();
  }

  private regionKey(region: string, id: string): string {
    return `${region}#${id}`;
  }

  createApi(name: string, protocolType: string, description: string | undefined, tags: Record<string, string>, region: string): HttpApi {
    const apiId = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const api: HttpApi = {
      apiId,
      name,
      description,
      protocolType: protocolType || "HTTP",
      apiEndpoint: `${this.baseUrl}/restapis/${apiId}`,
      createdDate: new Date().toISOString(),
      routes: [],
      integrations: [],
      stages: [{ stageName: "$default", autoDeploy: true, createdDate: new Date().toISOString() }],
      tags,
    };
    this.apis.set(this.regionKey(region, apiId), api);
    return api;
  }

  getApi(apiId: string, region: string): HttpApi {
    const api = this.apis.get(this.regionKey(region, apiId));
    if (!api) throw new AwsError("NotFoundException", `API ${apiId} not found.`, 404);
    return api;
  }

  deleteApi(apiId: string, region: string): void {
    const key = this.regionKey(region, apiId);
    if (!this.apis.has(key)) throw new AwsError("NotFoundException", `API ${apiId} not found.`, 404);
    this.apis.delete(key);
  }

  listApis(region: string): HttpApi[] {
    return this.apis.values().filter((a) => this.apis.has(this.regionKey(region, a.apiId)));
  }

  updateApi(apiId: string, name: string | undefined, description: string | undefined, region: string): HttpApi {
    const api = this.getApi(apiId, region);
    if (name) api.name = name;
    if (description !== undefined) api.description = description;
    return api;
  }

  // Routes
  createRoute(apiId: string, routeKey: string, target: string | undefined, authorizationType: string | undefined, region: string): ApiRoute {
    const api = this.getApi(apiId, region);
    const routeId = `r${++this.routeCounter}`;
    const route: ApiRoute = { routeId, routeKey, target, authorizationType: authorizationType ?? "NONE" };
    api.routes.push(route);
    return route;
  }

  getRoute(apiId: string, routeId: string, region: string): ApiRoute {
    const api = this.getApi(apiId, region);
    const route = api.routes.find((r) => r.routeId === routeId);
    if (!route) throw new AwsError("NotFoundException", `Route ${routeId} not found.`, 404);
    return route;
  }

  deleteRoute(apiId: string, routeId: string, region: string): void {
    const api = this.getApi(apiId, region);
    api.routes = api.routes.filter((r) => r.routeId !== routeId);
  }

  getRoutes(apiId: string, region: string): ApiRoute[] {
    return this.getApi(apiId, region).routes;
  }

  updateRoute(apiId: string, routeId: string, target: string | undefined, region: string): ApiRoute {
    const route = this.getRoute(apiId, routeId, region);
    if (target !== undefined) route.target = target;
    return route;
  }

  // Integrations
  createIntegration(apiId: string, integrationType: string, integrationUri: string | undefined, integrationMethod: string | undefined, payloadFormatVersion: string | undefined, region: string): ApiIntegration {
    const api = this.getApi(apiId, region);
    const integrationId = `i${++this.integrationCounter}`;
    const integration: ApiIntegration = {
      integrationId,
      integrationType,
      integrationUri,
      integrationMethod,
      payloadFormatVersion: payloadFormatVersion ?? "2.0",
    };
    api.integrations.push(integration);
    return integration;
  }

  getIntegration(apiId: string, integrationId: string, region: string): ApiIntegration {
    const api = this.getApi(apiId, region);
    const integration = api.integrations.find((i) => i.integrationId === integrationId);
    if (!integration) throw new AwsError("NotFoundException", `Integration ${integrationId} not found.`, 404);
    return integration;
  }

  deleteIntegration(apiId: string, integrationId: string, region: string): void {
    const api = this.getApi(apiId, region);
    api.integrations = api.integrations.filter((i) => i.integrationId !== integrationId);
  }

  getIntegrations(apiId: string, region: string): ApiIntegration[] {
    return this.getApi(apiId, region).integrations;
  }

  // Stages
  createStage(apiId: string, stageName: string, description: string | undefined, autoDeploy: boolean, region: string): ApiStage {
    const api = this.getApi(apiId, region);
    const stage: ApiStage = { stageName, description, autoDeploy, createdDate: new Date().toISOString() };
    api.stages.push(stage);
    return stage;
  }

  getStage(apiId: string, stageName: string, region: string): ApiStage {
    const api = this.getApi(apiId, region);
    const stage = api.stages.find((s) => s.stageName === stageName);
    if (!stage) throw new AwsError("NotFoundException", `Stage ${stageName} not found.`, 404);
    return stage;
  }

  deleteStage(apiId: string, stageName: string, region: string): void {
    const api = this.getApi(apiId, region);
    api.stages = api.stages.filter((s) => s.stageName !== stageName);
  }

  getStages(apiId: string, region: string): ApiStage[] {
    return this.getApi(apiId, region).stages;
  }
}
