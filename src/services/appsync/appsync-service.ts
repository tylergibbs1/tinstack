import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface GraphqlApi {
  apiId: string;
  name: string;
  authenticationType: string;
  arn: string;
  uris: { GRAPHQL: string; REALTIME: string };
  logConfig?: LogConfig;
  createdAt: number;
  updatedAt: number;
  apiKeys: ApiKey[];
  dataSources: DataSource[];
  resolvers: Resolver[];
  schema?: SchemaRecord;
}

export interface LogConfig {
  cloudWatchLogsRoleArn?: string;
  fieldLogLevel?: string;
}

export interface ApiKey {
  id: string;
  description?: string;
  expires: number;
}

export interface DataSource {
  name: string;
  type: string;
  description?: string;
  serviceRoleArn?: string;
  dynamodbConfig?: Record<string, any>;
  lambdaConfig?: Record<string, any>;
  httpConfig?: Record<string, any>;
}

export interface Resolver {
  typeName: string;
  fieldName: string;
  dataSourceName?: string;
  requestMappingTemplate?: string;
  responseMappingTemplate?: string;
  kind?: string;
  pipelineConfig?: Record<string, any>;
}

export interface SchemaRecord {
  definition: string; // base64-encoded
  status: "PROCESSING" | "ACTIVE" | "DELETING" | "FAILED" | "NOT_APPLICABLE";
  details?: string;
}

export interface ApiCache {
  apiId: string;
  ttl: number;
  apiCachingBehavior: string;
  type: string;
  transitEncryptionEnabled: boolean;
  atRestEncryptionEnabled: boolean;
  status: string;
}

export interface AppSyncType {
  apiId: string;
  name: string;
  description?: string;
  definition?: string;
  format: string;
  arn: string;
}

export class AppSyncService {
  private apis: StorageBackend<string, GraphqlApi>;
  private apiCaches: StorageBackend<string, ApiCache>;
  private types: StorageBackend<string, AppSyncType>;

  constructor(private accountId: string) {
    this.apis = new InMemoryStorage();
    this.apiCaches = new InMemoryStorage();
    this.types = new InMemoryStorage();
  }

  private regionKey(region: string, apiId: string): string {
    return `${region}#${apiId}`;
  }

  private buildArn(region: string, apiId: string): string {
    return `arn:aws:appsync:${region}:${this.accountId}:apis/${apiId}`;
  }

  private buildUris(region: string, apiId: string): { GRAPHQL: string; REALTIME: string } {
    return {
      GRAPHQL: `https://${apiId}.appsync-api.${region}.amazonaws.com/graphql`,
      REALTIME: `https://${apiId}.appsync-realtime-api.${region}.amazonaws.com/graphql`,
    };
  }

  // --- GraphQL API ---

  createApi(
    name: string,
    authenticationType: string,
    logConfig: LogConfig | undefined,
    region: string,
  ): GraphqlApi {
    if (!name) {
      throw new AwsError("BadRequestException", "Name is required.", 400);
    }

    const apiId = crypto.randomUUID().replace(/-/g, "").substring(0, 26);
    const now = Date.now() / 1000;
    const api: GraphqlApi = {
      apiId,
      name,
      authenticationType: authenticationType ?? "API_KEY",
      arn: this.buildArn(region, apiId),
      uris: this.buildUris(region, apiId),
      logConfig,
      createdAt: now,
      updatedAt: now,
      apiKeys: [],
      dataSources: [],
      resolvers: [],
    };

    this.apis.set(this.regionKey(region, apiId), api);
    return api;
  }

  getApi(apiId: string, region: string): GraphqlApi {
    const api = this.apis.get(this.regionKey(region, apiId));
    if (!api) {
      throw new AwsError("NotFoundException", `GraphQL API '${apiId}' not found.`, 404);
    }
    return api;
  }

  listApis(region: string): GraphqlApi[] {
    return this.apis.values().filter((api) => api.arn.includes(`:${region}:`));
  }

  updateApi(
    apiId: string,
    name: string | undefined,
    authenticationType: string | undefined,
    logConfig: LogConfig | undefined,
    region: string,
  ): GraphqlApi {
    const api = this.getApi(apiId, region);
    if (name !== undefined) api.name = name;
    if (authenticationType !== undefined) api.authenticationType = authenticationType;
    if (logConfig !== undefined) api.logConfig = logConfig;
    api.updatedAt = Date.now() / 1000;
    this.apis.set(this.regionKey(region, apiId), api);
    return api;
  }

  deleteApi(apiId: string, region: string): void {
    if (!this.apis.has(this.regionKey(region, apiId))) {
      throw new AwsError("NotFoundException", `GraphQL API '${apiId}' not found.`, 404);
    }
    this.apis.delete(this.regionKey(region, apiId));
  }

  // --- API Keys ---

  createApiKey(apiId: string, description: string | undefined, expires: number | undefined, region: string): ApiKey {
    const api = this.getApi(apiId, region);
    const id = `da2-${crypto.randomUUID().replace(/-/g, "").substring(0, 26)}`;
    const key: ApiKey = {
      id,
      description,
      expires: expires ?? Math.floor(Date.now() / 1000) + 7 * 86400,
    };
    api.apiKeys.push(key);
    this.apis.set(this.regionKey(region, apiId), api);
    return key;
  }

  listApiKeys(apiId: string, region: string): ApiKey[] {
    return this.getApi(apiId, region).apiKeys;
  }

  deleteApiKey(apiId: string, keyId: string, region: string): void {
    const api = this.getApi(apiId, region);
    const idx = api.apiKeys.findIndex((k) => k.id === keyId);
    if (idx === -1) {
      throw new AwsError("NotFoundException", `API key '${keyId}' not found.`, 404);
    }
    api.apiKeys.splice(idx, 1);
    this.apis.set(this.regionKey(region, apiId), api);
  }

  // --- Schema ---

  startSchemaCreation(apiId: string, definition: string, region: string): SchemaRecord {
    const api = this.getApi(apiId, region);
    api.schema = {
      definition,
      status: "ACTIVE",
    };
    this.apis.set(this.regionKey(region, apiId), api);
    return api.schema;
  }

  getSchemaCreationStatus(apiId: string, region: string): SchemaRecord {
    const api = this.getApi(apiId, region);
    if (!api.schema) {
      return { definition: "", status: "NOT_APPLICABLE" };
    }
    return api.schema;
  }

  // --- Data Sources ---

  createDataSource(
    apiId: string,
    name: string,
    type: string,
    description: string | undefined,
    serviceRoleArn: string | undefined,
    dynamodbConfig: Record<string, any> | undefined,
    lambdaConfig: Record<string, any> | undefined,
    httpConfig: Record<string, any> | undefined,
    region: string,
  ): DataSource {
    const api = this.getApi(apiId, region);

    if (api.dataSources.some((ds) => ds.name === name)) {
      throw new AwsError("BadRequestException", `Data source '${name}' already exists.`, 400);
    }

    const ds: DataSource = {
      name,
      type: type ?? "NONE",
      description,
      serviceRoleArn,
      dynamodbConfig,
      lambdaConfig,
      httpConfig,
    };
    api.dataSources.push(ds);
    this.apis.set(this.regionKey(region, apiId), api);
    return ds;
  }

  getDataSource(apiId: string, name: string, region: string): DataSource {
    const api = this.getApi(apiId, region);
    const ds = api.dataSources.find((d) => d.name === name);
    if (!ds) {
      throw new AwsError("NotFoundException", `Data source '${name}' not found.`, 404);
    }
    return ds;
  }

  listDataSources(apiId: string, region: string): DataSource[] {
    return this.getApi(apiId, region).dataSources;
  }

  deleteDataSource(apiId: string, name: string, region: string): void {
    const api = this.getApi(apiId, region);
    const idx = api.dataSources.findIndex((d) => d.name === name);
    if (idx === -1) {
      throw new AwsError("NotFoundException", `Data source '${name}' not found.`, 404);
    }
    api.dataSources.splice(idx, 1);
    this.apis.set(this.regionKey(region, apiId), api);
  }

  // --- Resolvers ---

  createResolver(
    apiId: string,
    typeName: string,
    fieldName: string,
    dataSourceName: string | undefined,
    requestMappingTemplate: string | undefined,
    responseMappingTemplate: string | undefined,
    kind: string | undefined,
    pipelineConfig: Record<string, any> | undefined,
    region: string,
  ): Resolver {
    const api = this.getApi(apiId, region);

    if (api.resolvers.some((r) => r.typeName === typeName && r.fieldName === fieldName)) {
      throw new AwsError("BadRequestException", `Resolver for '${typeName}.${fieldName}' already exists.`, 400);
    }

    const resolver: Resolver = {
      typeName,
      fieldName,
      dataSourceName,
      requestMappingTemplate,
      responseMappingTemplate,
      kind: kind ?? "UNIT",
      pipelineConfig,
    };
    api.resolvers.push(resolver);
    this.apis.set(this.regionKey(region, apiId), api);
    return resolver;
  }

  getResolver(apiId: string, typeName: string, fieldName: string, region: string): Resolver {
    const api = this.getApi(apiId, region);
    const resolver = api.resolvers.find((r) => r.typeName === typeName && r.fieldName === fieldName);
    if (!resolver) {
      throw new AwsError("NotFoundException", `Resolver '${typeName}.${fieldName}' not found.`, 404);
    }
    return resolver;
  }

  listResolvers(apiId: string, typeName: string, region: string): Resolver[] {
    return this.getApi(apiId, region).resolvers.filter((r) => r.typeName === typeName);
  }

  // --- API Cache ---

  createApiCache(
    apiId: string,
    ttl: number,
    apiCachingBehavior: string,
    type: string,
    transitEncryptionEnabled: boolean,
    atRestEncryptionEnabled: boolean,
    region: string,
  ): ApiCache {
    this.getApi(apiId, region); // validate api exists
    const key = this.regionKey(region, apiId);
    if (this.apiCaches.has(key)) {
      throw new AwsError("BadRequestException", `API cache already exists for API '${apiId}'.`, 400);
    }
    const cache: ApiCache = {
      apiId,
      ttl,
      apiCachingBehavior: apiCachingBehavior ?? "FULL_REQUEST_CACHING",
      type: type ?? "T2_SMALL",
      transitEncryptionEnabled: transitEncryptionEnabled ?? false,
      atRestEncryptionEnabled: atRestEncryptionEnabled ?? false,
      status: "AVAILABLE",
    };
    this.apiCaches.set(key, cache);
    return cache;
  }

  getApiCache(apiId: string, region: string): ApiCache {
    this.getApi(apiId, region);
    const cache = this.apiCaches.get(this.regionKey(region, apiId));
    if (!cache) {
      throw new AwsError("NotFoundException", `API cache not found for API '${apiId}'.`, 404);
    }
    return cache;
  }

  updateApiCache(
    apiId: string,
    ttl: number | undefined,
    apiCachingBehavior: string | undefined,
    type: string | undefined,
    transitEncryptionEnabled: boolean | undefined,
    atRestEncryptionEnabled: boolean | undefined,
    region: string,
  ): ApiCache {
    const cache = this.getApiCache(apiId, region);
    if (ttl !== undefined) cache.ttl = ttl;
    if (apiCachingBehavior !== undefined) cache.apiCachingBehavior = apiCachingBehavior;
    if (type !== undefined) cache.type = type;
    if (transitEncryptionEnabled !== undefined) cache.transitEncryptionEnabled = transitEncryptionEnabled;
    if (atRestEncryptionEnabled !== undefined) cache.atRestEncryptionEnabled = atRestEncryptionEnabled;
    this.apiCaches.set(this.regionKey(region, apiId), cache);
    return cache;
  }

  deleteApiCache(apiId: string, region: string): void {
    this.getApi(apiId, region);
    const key = this.regionKey(region, apiId);
    if (!this.apiCaches.has(key)) {
      throw new AwsError("NotFoundException", `API cache not found for API '${apiId}'.`, 404);
    }
    this.apiCaches.delete(key);
  }

  flushApiCache(apiId: string, region: string): void {
    this.getApi(apiId, region);
    // No-op mock, just validate the API exists
  }

  // --- Types ---

  createType(
    apiId: string,
    definition: string,
    format: string,
    region: string,
  ): AppSyncType {
    this.getApi(apiId, region);
    // Parse the type name from the definition (rough heuristic)
    const nameMatch = definition.match(/type\s+(\w+)/);
    const name = nameMatch ? nameMatch[1] : `Type_${crypto.randomUUID().substring(0, 8)}`;
    const key = `${this.regionKey(region, apiId)}#type#${name}`;
    const t: AppSyncType = {
      apiId,
      name,
      definition,
      format: format ?? "SDL",
      arn: `${this.buildArn(region, apiId)}/types/${name}`,
    };
    this.types.set(key, t);
    return t;
  }

  getType(apiId: string, typeName: string, format: string, region: string): AppSyncType {
    this.getApi(apiId, region);
    const key = `${this.regionKey(region, apiId)}#type#${typeName}`;
    const t = this.types.get(key);
    if (!t) {
      throw new AwsError("NotFoundException", `Type '${typeName}' not found.`, 404);
    }
    return t;
  }

  listTypes(apiId: string, format: string, region: string): AppSyncType[] {
    this.getApi(apiId, region);
    const prefix = `${this.regionKey(region, apiId)}#type#`;
    return this.types.values().filter((t) => {
      const key = `${this.regionKey(region, t.apiId)}#type#${t.name}`;
      return key.startsWith(prefix);
    });
  }

  deleteType(apiId: string, typeName: string, region: string): void {
    this.getApi(apiId, region);
    const key = `${this.regionKey(region, apiId)}#type#${typeName}`;
    if (!this.types.has(key)) {
      throw new AwsError("NotFoundException", `Type '${typeName}' not found.`, 404);
    }
    this.types.delete(key);
  }
}
