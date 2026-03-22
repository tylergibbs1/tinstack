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

export interface ApiDeployment {
  deploymentId: string;
  description?: string;
  createdDate: string;
  deploymentStatus: string;
  autoDeployed: boolean;
}

export interface ApiAuthorizer {
  authorizerId: string;
  authorizerType: string;
  name: string;
  authorizerUri?: string;
  identitySource?: string;
  authorizerResultTtlInSeconds?: number;
  jwtConfiguration?: { audience?: string[]; issuer?: string };
}

export class ApiGatewayService {
  private apis: StorageBackend<string, HttpApi>;
  private deployments: Map<string, ApiDeployment[]> = new Map(); // regionKey(apiId) -> deployments
  private authorizers: Map<string, ApiAuthorizer[]> = new Map(); // regionKey(apiId) -> authorizers
  private resourceTags: Map<string, Record<string, string>> = new Map(); // arn -> tags
  private routeCounter = 0;
  private integrationCounter = 0;
  private deploymentCounter = 0;
  private authorizerCounter = 0;

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

  updateIntegration(apiId: string, integrationId: string, updates: Partial<ApiIntegration>, region: string): ApiIntegration {
    const integration = this.getIntegration(apiId, integrationId, region);
    if (updates.integrationType !== undefined) integration.integrationType = updates.integrationType;
    if (updates.integrationUri !== undefined) integration.integrationUri = updates.integrationUri;
    if (updates.integrationMethod !== undefined) integration.integrationMethod = updates.integrationMethod;
    if (updates.payloadFormatVersion !== undefined) integration.payloadFormatVersion = updates.payloadFormatVersion;
    if (updates.description !== undefined) integration.description = updates.description;
    if (updates.connectionType !== undefined) integration.connectionType = updates.connectionType;
    return integration;
  }

  updateStage(apiId: string, stageName: string, updates: Partial<ApiStage>, region: string): ApiStage {
    const stage = this.getStage(apiId, stageName, region);
    if (updates.description !== undefined) stage.description = updates.description;
    if (updates.autoDeploy !== undefined) stage.autoDeploy = updates.autoDeploy;
    if (updates.deploymentId !== undefined) stage.deploymentId = updates.deploymentId;
    return stage;
  }

  // Deployments
  createDeployment(apiId: string, description: string | undefined, region: string): ApiDeployment {
    this.getApi(apiId, region);
    const key = this.regionKey(region, apiId);
    const deploymentId = `d${++this.deploymentCounter}`;
    const deployment: ApiDeployment = {
      deploymentId,
      description,
      createdDate: new Date().toISOString(),
      deploymentStatus: "DEPLOYED",
      autoDeployed: false,
    };
    if (!this.deployments.has(key)) this.deployments.set(key, []);
    this.deployments.get(key)!.push(deployment);
    return deployment;
  }

  getDeployments(apiId: string, region: string): ApiDeployment[] {
    this.getApi(apiId, region);
    return this.deployments.get(this.regionKey(region, apiId)) ?? [];
  }

  // Authorizers
  createAuthorizer(apiId: string, name: string, authorizerType: string, authorizerUri: string | undefined, identitySource: string | undefined, jwtConfiguration: any | undefined, region: string): ApiAuthorizer {
    this.getApi(apiId, region);
    const key = this.regionKey(region, apiId);
    const authorizerId = `a${++this.authorizerCounter}`;
    const authorizer: ApiAuthorizer = {
      authorizerId,
      authorizerType,
      name,
      authorizerUri,
      identitySource,
      jwtConfiguration,
    };
    if (!this.authorizers.has(key)) this.authorizers.set(key, []);
    this.authorizers.get(key)!.push(authorizer);
    return authorizer;
  }

  getAuthorizers(apiId: string, region: string): ApiAuthorizer[] {
    this.getApi(apiId, region);
    return this.authorizers.get(this.regionKey(region, apiId)) ?? [];
  }

  getAuthorizer(apiId: string, authorizerId: string, region: string): ApiAuthorizer {
    const authorizers = this.getAuthorizers(apiId, region);
    const authorizer = authorizers.find((a) => a.authorizerId === authorizerId);
    if (!authorizer) throw new AwsError("NotFoundException", `Authorizer ${authorizerId} not found.`, 404);
    return authorizer;
  }

  deleteAuthorizer(apiId: string, authorizerId: string, region: string): void {
    const key = this.regionKey(region, apiId);
    const authorizers = this.authorizers.get(key) ?? [];
    this.authorizers.set(key, authorizers.filter((a) => a.authorizerId !== authorizerId));
  }

  // Tags
  getTags(arn: string): Record<string, string> {
    return this.resourceTags.get(arn) ?? {};
  }

  tagResource(arn: string, tags: Record<string, string>): void {
    const existing = this.resourceTags.get(arn) ?? {};
    Object.assign(existing, tags);
    this.resourceTags.set(arn, existing);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(arn);
    if (existing) {
      for (const key of tagKeys) delete existing[key];
    }
  }
}
