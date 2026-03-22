import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface RestApi {
  id: string;
  name: string;
  description?: string;
  createdDate: number;
  endpointConfiguration?: { types: string[] };
  resources: RestResource[];
  deployments: RestDeployment[];
  stages: RestStage[];
}

export interface RestResource {
  id: string;
  parentId?: string;
  pathPart: string;
  path: string;
  methods: Record<string, RestMethod>;
}

export interface RestMethod {
  httpMethod: string;
  authorizationType: string;
  apiKeyRequired: boolean;
}

export interface RestDeployment {
  id: string;
  description?: string;
  createdDate: number;
}

export interface RestStage {
  stageName: string;
  deploymentId: string;
  description?: string;
  createdDate: number;
}

export class ApiGatewayV1Service {
  private apis: StorageBackend<string, RestApi>;

  constructor(private accountId: string) {
    this.apis = new InMemoryStorage();
  }

  createRestApi(name: string, description?: string, endpointTypes?: string[]): RestApi {
    const id = Math.random().toString(36).substring(2, 12);
    const rootResource: RestResource = {
      id: Math.random().toString(36).substring(2, 12),
      pathPart: "",
      path: "/",
      methods: {},
    };
    const api: RestApi = {
      id, name, description,
      createdDate: Date.now() / 1000,
      endpointConfiguration: { types: endpointTypes ?? ["EDGE"] },
      resources: [rootResource],
      deployments: [],
      stages: [],
    };
    this.apis.set(id, api);
    return api;
  }

  getRestApi(id: string): RestApi {
    const api = this.apis.get(id);
    if (!api) throw new AwsError("NotFoundException", `REST API ${id} not found.`, 404);
    return api;
  }

  getRestApis(): RestApi[] {
    return this.apis.values();
  }

  deleteRestApi(id: string): void {
    if (!this.apis.get(id)) throw new AwsError("NotFoundException", `REST API ${id} not found.`, 404);
    this.apis.delete(id);
  }

  createResource(apiId: string, parentId: string, pathPart: string): RestResource {
    const api = this.getRestApi(apiId);
    const parent = api.resources.find((r) => r.id === parentId);
    if (!parent) throw new AwsError("NotFoundException", `Resource ${parentId} not found.`, 404);
    const resource: RestResource = {
      id: Math.random().toString(36).substring(2, 12),
      parentId,
      pathPart,
      path: parent.path === "/" ? `/${pathPart}` : `${parent.path}/${pathPart}`,
      methods: {},
    };
    api.resources.push(resource);
    return resource;
  }

  getResources(apiId: string): RestResource[] {
    return this.getRestApi(apiId).resources;
  }

  putMethod(apiId: string, resourceId: string, httpMethod: string, authType: string): RestMethod {
    const api = this.getRestApi(apiId);
    const resource = api.resources.find((r) => r.id === resourceId);
    if (!resource) throw new AwsError("NotFoundException", `Resource ${resourceId} not found.`, 404);
    const method: RestMethod = { httpMethod, authorizationType: authType ?? "NONE", apiKeyRequired: false };
    resource.methods[httpMethod] = method;
    return method;
  }

  createDeployment(apiId: string, description?: string): RestDeployment {
    const api = this.getRestApi(apiId);
    const deployment: RestDeployment = {
      id: Math.random().toString(36).substring(2, 12),
      description,
      createdDate: Date.now() / 1000,
    };
    api.deployments.push(deployment);
    return deployment;
  }

  createStage(apiId: string, stageName: string, deploymentId: string, description?: string): RestStage {
    const api = this.getRestApi(apiId);
    const stage: RestStage = {
      stageName, deploymentId, description,
      createdDate: Date.now() / 1000,
    };
    api.stages.push(stage);
    return stage;
  }

  getStages(apiId: string): RestStage[] {
    return this.getRestApi(apiId).stages;
  }
}
