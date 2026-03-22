import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { AppSyncService } from "./appsync-service";

export class AppSyncHandler {
  constructor(private service: AppSyncService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- GraphQL APIs ---
      if (path === "/v1/apis" && method === "POST") {
        const body = await req.json();
        const api = this.service.createApi(
          body.name,
          body.authenticationType,
          body.logConfig,
          ctx.region,
        );
        return this.json({ graphqlApi: apiToJson(api) }, ctx, 200);
      }

      if (path === "/v1/apis" && method === "GET") {
        const apis = this.service.listApis(ctx.region);
        return this.json({ graphqlApis: apis.map(apiToJson) }, ctx);
      }

      // --- Schema creation ---
      const schemaMatch = path.match(/^\/v1\/apis\/([^/]+)\/schemacreation$/);
      if (schemaMatch) {
        const apiId = schemaMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const schema = this.service.startSchemaCreation(apiId, body.definition, ctx.region);
          return this.json({ status: schema.status }, ctx);
        }
        if (method === "GET") {
          const schema = this.service.getSchemaCreationStatus(apiId, ctx.region);
          return this.json({ status: schema.status, details: schema.details }, ctx);
        }
      }

      // --- API Keys ---
      const apiKeysMatch = path.match(/^\/v1\/apis\/([^/]+)\/apikeys$/);
      if (apiKeysMatch) {
        const apiId = apiKeysMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const key = this.service.createApiKey(apiId, body.description, body.expires, ctx.region);
          return this.json({ apiKey: apiKeyToJson(key) }, ctx);
        }
        if (method === "GET") {
          const keys = this.service.listApiKeys(apiId, ctx.region);
          return this.json({ apiKeys: keys.map(apiKeyToJson) }, ctx);
        }
      }

      const apiKeyMatch = path.match(/^\/v1\/apis\/([^/]+)\/apikeys\/([^/]+)$/);
      if (apiKeyMatch) {
        const [, apiId, keyId] = apiKeyMatch;
        if (method === "DELETE") {
          this.service.deleteApiKey(apiId, keyId, ctx.region);
          return this.empty(ctx);
        }
      }

      // --- Data Sources ---
      const dataSourcesMatch = path.match(/^\/v1\/apis\/([^/]+)\/datasources$/);
      if (dataSourcesMatch) {
        const apiId = dataSourcesMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const ds = this.service.createDataSource(
            apiId,
            body.name,
            body.type,
            body.description,
            body.serviceRoleArn,
            body.dynamodbConfig,
            body.lambdaConfig,
            body.httpConfig,
            ctx.region,
          );
          return this.json({ dataSource: dataSourceToJson(ds) }, ctx);
        }
        if (method === "GET") {
          const dataSources = this.service.listDataSources(apiId, ctx.region);
          return this.json({ dataSources: dataSources.map(dataSourceToJson) }, ctx);
        }
      }

      const dataSourceMatch = path.match(/^\/v1\/apis\/([^/]+)\/datasources\/([^/]+)$/);
      if (dataSourceMatch) {
        const [, apiId, name] = dataSourceMatch;
        const decodedName = decodeURIComponent(name);
        if (method === "GET") {
          const ds = this.service.getDataSource(apiId, decodedName, ctx.region);
          return this.json({ dataSource: dataSourceToJson(ds) }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteDataSource(apiId, decodedName, ctx.region);
          return this.empty(ctx);
        }
      }

      // --- Resolvers ---
      const resolversMatch = path.match(/^\/v1\/apis\/([^/]+)\/types\/([^/]+)\/resolvers$/);
      if (resolversMatch) {
        const [, apiId, typeName] = resolversMatch;
        const decodedTypeName = decodeURIComponent(typeName);
        if (method === "POST") {
          const body = await req.json();
          const resolver = this.service.createResolver(
            apiId,
            decodedTypeName,
            body.fieldName,
            body.dataSourceName,
            body.requestMappingTemplate,
            body.responseMappingTemplate,
            body.kind,
            body.pipelineConfig,
            ctx.region,
          );
          return this.json({ resolver: resolverToJson(resolver) }, ctx);
        }
        if (method === "GET") {
          const resolvers = this.service.listResolvers(apiId, decodedTypeName, ctx.region);
          return this.json({ resolvers: resolvers.map(resolverToJson) }, ctx);
        }
      }

      const resolverMatch = path.match(/^\/v1\/apis\/([^/]+)\/types\/([^/]+)\/resolvers\/([^/]+)$/);
      if (resolverMatch) {
        const [, apiId, typeName, fieldName] = resolverMatch;
        if (method === "GET") {
          const resolver = this.service.getResolver(apiId, decodeURIComponent(typeName), decodeURIComponent(fieldName), ctx.region);
          return this.json({ resolver: resolverToJson(resolver) }, ctx);
        }
      }

      // --- API Cache ---
      const apiCacheMatch = path.match(/^\/v1\/apis\/([^/]+)\/ApiCaches$/);
      if (apiCacheMatch) {
        const apiId = apiCacheMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const cache = this.service.createApiCache(
            apiId, body.ttl, body.apiCachingBehavior, body.type,
            body.transitEncryptionEnabled, body.atRestEncryptionEnabled, ctx.region,
          );
          return this.json({ apiCache: cache }, ctx);
        }
        if (method === "GET") {
          const cache = this.service.getApiCache(apiId, ctx.region);
          return this.json({ apiCache: cache }, ctx);
        }
        if (method === "PUT") {
          const body = await req.json();
          const cache = this.service.updateApiCache(
            apiId, body.ttl, body.apiCachingBehavior, body.type,
            body.transitEncryptionEnabled, body.atRestEncryptionEnabled, ctx.region,
          );
          return this.json({ apiCache: cache }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteApiCache(apiId, ctx.region);
          return this.empty(ctx);
        }
      }

      // --- Update API Cache (SDK sends POST to /ApiCaches/update) ---
      const apiCacheUpdateMatch = path.match(/^\/v1\/apis\/([^/]+)\/ApiCaches\/update$/);
      if (apiCacheUpdateMatch && method === "POST") {
        const apiId = apiCacheUpdateMatch[1];
        const body = await req.json();
        const cache = this.service.updateApiCache(
          apiId, body.ttl, body.apiCachingBehavior, body.type,
          body.transitEncryptionEnabled, body.atRestEncryptionEnabled, ctx.region,
        );
        return this.json({ apiCache: cache }, ctx);
      }

      // --- Flush API Cache ---
      const flushCacheMatch = path.match(/^\/v1\/apis\/([^/]+)\/FlushCache$/);
      if (flushCacheMatch && method === "DELETE") {
        this.service.flushApiCache(flushCacheMatch[1], ctx.region);
        return this.empty(ctx);
      }

      // --- Types ---
      const typesMatch = path.match(/^\/v1\/apis\/([^/]+)\/types$/);
      if (typesMatch) {
        const apiId = typesMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const t = this.service.createType(apiId, body.definition, body.format, ctx.region);
          return this.json({ type: t }, ctx);
        }
        if (method === "GET") {
          const format = new URL(req.url).searchParams.get("format") ?? "SDL";
          const types = this.service.listTypes(apiId, format, ctx.region);
          return this.json({ types }, ctx);
        }
      }

      const typeMatch = path.match(/^\/v1\/apis\/([^/]+)\/types\/([^/]+)$/);
      if (typeMatch) {
        const [, apiId, typeName] = typeMatch;
        const decodedTypeName = decodeURIComponent(typeName);
        if (method === "GET") {
          const format = new URL(req.url).searchParams.get("format") ?? "SDL";
          const t = this.service.getType(apiId, decodedTypeName, format, ctx.region);
          return this.json({ type: t }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteType(apiId, decodedTypeName, ctx.region);
          return this.empty(ctx);
        }
      }

      // --- Single API operations (must be after sub-resource routes) ---
      const apiMatch = path.match(/^\/v1\/apis\/([^/]+)$/);
      if (apiMatch) {
        const apiId = apiMatch[1];
        if (method === "GET") {
          return this.json({ graphqlApi: apiToJson(this.service.getApi(apiId, ctx.region)) }, ctx);
        }
        if (method === "POST" || method === "PUT") {
          const body = await req.json();
          const api = this.service.updateApi(apiId, body.name, body.authenticationType, body.logConfig, ctx.region);
          return this.json({ graphqlApi: apiToJson(api) }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteApi(apiId, ctx.region);
          return this.empty(ctx);
        }
      }

      return jsonErrorResponse(new AwsError("NotFoundException", `Unknown AppSync operation: ${method} ${path}`, 404), ctx.requestId);
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

function apiToJson(api: any) {
  return {
    apiId: api.apiId,
    name: api.name,
    authenticationType: api.authenticationType,
    arn: api.arn,
    uris: api.uris,
    logConfig: api.logConfig,
  };
}

function apiKeyToJson(key: any) {
  return {
    id: key.id,
    description: key.description,
    expires: key.expires,
  };
}

function dataSourceToJson(ds: any) {
  return {
    name: ds.name,
    type: ds.type,
    description: ds.description,
    serviceRoleArn: ds.serviceRoleArn,
    dynamodbConfig: ds.dynamodbConfig,
    lambdaConfig: ds.lambdaConfig,
    httpConfig: ds.httpConfig,
  };
}

function resolverToJson(r: any) {
  return {
    typeName: r.typeName,
    fieldName: r.fieldName,
    dataSourceName: r.dataSourceName,
    requestMappingTemplate: r.requestMappingTemplate,
    responseMappingTemplate: r.responseMappingTemplate,
    kind: r.kind,
    pipelineConfig: r.pipelineConfig,
  };
}
