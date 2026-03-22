import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  AppSyncClient,
  CreateGraphqlApiCommand,
  GetGraphqlApiCommand,
  ListGraphqlApisCommand,
  UpdateGraphqlApiCommand,
  DeleteGraphqlApiCommand,
  CreateApiKeyCommand,
  ListApiKeysCommand,
  DeleteApiKeyCommand,
  StartSchemaCreationCommand,
  GetSchemaCreationStatusCommand,
  CreateDataSourceCommand,
  GetDataSourceCommand,
  ListDataSourcesCommand,
  DeleteDataSourceCommand,
  CreateResolverCommand,
  GetResolverCommand,
  ListResolversCommand,
  CreateApiCacheCommand,
  GetApiCacheCommand,
  UpdateApiCacheCommand,
  DeleteApiCacheCommand,
  FlushApiCacheCommand,
  CreateTypeCommand,
  GetTypeCommand,
  ListTypesCommand,
  DeleteTypeCommand,
} from "@aws-sdk/client-appsync";
import { startServer, stopServer, clientConfig } from "./helpers";

const appsync = new AppSyncClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("AppSync", () => {
  let apiId: string;

  test("CreateGraphqlApi", async () => {
    const res = await appsync.send(new CreateGraphqlApiCommand({
      name: "test-api",
      authenticationType: "API_KEY",
    }));
    expect(res.graphqlApi).toBeDefined();
    expect(res.graphqlApi!.name).toBe("test-api");
    expect(res.graphqlApi!.authenticationType).toBe("API_KEY");
    apiId = res.graphqlApi!.apiId!;
    expect(apiId).toBeDefined();
    expect(res.graphqlApi!.arn).toContain("appsync");
    expect(res.graphqlApi!.uris!.GRAPHQL).toContain(apiId);
    expect(res.graphqlApi!.uris!.REALTIME).toContain(apiId);
  });

  test("GetGraphqlApi", async () => {
    const res = await appsync.send(new GetGraphqlApiCommand({ apiId }));
    expect(res.graphqlApi!.name).toBe("test-api");
    expect(res.graphqlApi!.apiId).toBe(apiId);
  });

  test("ListGraphqlApis", async () => {
    const res = await appsync.send(new ListGraphqlApisCommand({}));
    expect(res.graphqlApis!.some((a) => a.apiId === apiId)).toBe(true);
  });

  test("UpdateGraphqlApi", async () => {
    const res = await appsync.send(new UpdateGraphqlApiCommand({
      apiId,
      name: "updated-api",
      authenticationType: "IAM",
    }));
    expect(res.graphqlApi!.name).toBe("updated-api");
    expect(res.graphqlApi!.authenticationType).toBe("IAM");
  });

  // --- API Keys ---
  let apiKeyId: string;

  test("CreateApiKey", async () => {
    const res = await appsync.send(new CreateApiKeyCommand({
      apiId,
      description: "test key",
    }));
    expect(res.apiKey).toBeDefined();
    expect(res.apiKey!.id).toBeDefined();
    expect(res.apiKey!.description).toBe("test key");
    apiKeyId = res.apiKey!.id!;
  });

  test("ListApiKeys", async () => {
    const res = await appsync.send(new ListApiKeysCommand({ apiId }));
    expect(res.apiKeys!.length).toBeGreaterThanOrEqual(1);
    expect(res.apiKeys!.some((k) => k.id === apiKeyId)).toBe(true);
  });

  test("DeleteApiKey", async () => {
    await appsync.send(new DeleteApiKeyCommand({ apiId, id: apiKeyId }));
    const res = await appsync.send(new ListApiKeysCommand({ apiId }));
    expect(res.apiKeys!.some((k) => k.id === apiKeyId)).toBe(false);
  });

  // --- Schema ---
  test("StartSchemaCreation", async () => {
    const schema = Buffer.from("type Query { hello: String }").toString("base64");
    const res = await appsync.send(new StartSchemaCreationCommand({
      apiId,
      definition: new TextEncoder().encode(schema),
    }));
    expect(res.status).toBe("ACTIVE");
  });

  test("GetSchemaCreationStatus", async () => {
    const res = await appsync.send(new GetSchemaCreationStatusCommand({ apiId }));
    expect(res.status).toBe("ACTIVE");
  });

  // --- Data Sources ---
  test("CreateDataSource", async () => {
    const res = await appsync.send(new CreateDataSourceCommand({
      apiId,
      name: "test-ds",
      type: "NONE",
      description: "A test data source",
    }));
    expect(res.dataSource).toBeDefined();
    expect(res.dataSource!.name).toBe("test-ds");
    expect(res.dataSource!.type).toBe("NONE");
  });

  test("GetDataSource", async () => {
    const res = await appsync.send(new GetDataSourceCommand({
      apiId,
      name: "test-ds",
    }));
    expect(res.dataSource!.name).toBe("test-ds");
    expect(res.dataSource!.description).toBe("A test data source");
  });

  test("ListDataSources", async () => {
    const res = await appsync.send(new ListDataSourcesCommand({ apiId }));
    expect(res.dataSources!.some((ds) => ds.name === "test-ds")).toBe(true);
  });

  test("CreateDataSource duplicate rejected", async () => {
    await expect(
      appsync.send(new CreateDataSourceCommand({
        apiId,
        name: "test-ds",
        type: "NONE",
      })),
    ).rejects.toThrow();
  });

  test("DeleteDataSource", async () => {
    await appsync.send(new DeleteDataSourceCommand({ apiId, name: "test-ds" }));
    const res = await appsync.send(new ListDataSourcesCommand({ apiId }));
    expect(res.dataSources!.some((ds) => ds.name === "test-ds")).toBe(false);
  });

  // --- Resolvers ---
  test("CreateResolver", async () => {
    // Re-create data source for resolver
    await appsync.send(new CreateDataSourceCommand({
      apiId,
      name: "resolver-ds",
      type: "NONE",
    }));

    const res = await appsync.send(new CreateResolverCommand({
      apiId,
      typeName: "Query",
      fieldName: "hello",
      dataSourceName: "resolver-ds",
      requestMappingTemplate: '{"version": "2017-02-28"}',
      responseMappingTemplate: "$util.toJson($ctx.result)",
    }));
    expect(res.resolver).toBeDefined();
    expect(res.resolver!.typeName).toBe("Query");
    expect(res.resolver!.fieldName).toBe("hello");
    expect(res.resolver!.dataSourceName).toBe("resolver-ds");
  });

  test("GetResolver", async () => {
    const res = await appsync.send(new GetResolverCommand({
      apiId,
      typeName: "Query",
      fieldName: "hello",
    }));
    expect(res.resolver!.fieldName).toBe("hello");
    expect(res.resolver!.kind).toBe("UNIT");
  });

  test("ListResolvers", async () => {
    const res = await appsync.send(new ListResolversCommand({
      apiId,
      typeName: "Query",
    }));
    expect(res.resolvers!.some((r) => r.fieldName === "hello")).toBe(true);
  });

  test("CreateResolver duplicate rejected", async () => {
    await expect(
      appsync.send(new CreateResolverCommand({
        apiId,
        typeName: "Query",
        fieldName: "hello",
        dataSourceName: "resolver-ds",
      })),
    ).rejects.toThrow();
  });

  // --- API Cache ---
  test("CreateApiCache", async () => {
    const res = await appsync.send(new CreateApiCacheCommand({
      apiId,
      ttl: 300,
      apiCachingBehavior: "FULL_REQUEST_CACHING",
      type: "T2_SMALL",
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: false,
    }));
    expect(res.apiCache).toBeDefined();
    expect(res.apiCache!.ttl).toBe(300);
    expect(res.apiCache!.apiCachingBehavior).toBe("FULL_REQUEST_CACHING");
    expect(res.apiCache!.type).toBe("T2_SMALL");
    expect(res.apiCache!.status).toBe("AVAILABLE");
    expect(res.apiCache!.transitEncryptionEnabled).toBe(true);
  });

  test("GetApiCache", async () => {
    const res = await appsync.send(new GetApiCacheCommand({ apiId }));
    expect(res.apiCache!.ttl).toBe(300);
    expect(res.apiCache!.status).toBe("AVAILABLE");
  });

  test("UpdateApiCache", async () => {
    const res = await appsync.send(new UpdateApiCacheCommand({
      apiId,
      ttl: 600,
      apiCachingBehavior: "PER_RESOLVER_CACHING",
      type: "T2_MEDIUM",
    }));
    expect(res.apiCache!.ttl).toBe(600);
    expect(res.apiCache!.apiCachingBehavior).toBe("PER_RESOLVER_CACHING");
    expect(res.apiCache!.type).toBe("T2_MEDIUM");
  });

  test("FlushApiCache", async () => {
    await appsync.send(new FlushApiCacheCommand({ apiId }));
    // Just verify it doesn't throw
  });

  test("DeleteApiCache", async () => {
    await appsync.send(new DeleteApiCacheCommand({ apiId }));
    await expect(
      appsync.send(new GetApiCacheCommand({ apiId })),
    ).rejects.toThrow();
  });

  test("CreateApiCache duplicate rejected", async () => {
    await appsync.send(new CreateApiCacheCommand({
      apiId, ttl: 100, apiCachingBehavior: "FULL_REQUEST_CACHING", type: "T2_SMALL",
    }));
    await expect(
      appsync.send(new CreateApiCacheCommand({
        apiId, ttl: 200, apiCachingBehavior: "FULL_REQUEST_CACHING", type: "T2_SMALL",
      })),
    ).rejects.toThrow();
    // Clean up for next tests
    await appsync.send(new DeleteApiCacheCommand({ apiId }));
  });

  // --- Types ---
  test("CreateType", async () => {
    const res = await appsync.send(new CreateTypeCommand({
      apiId,
      definition: "type Post { id: ID! title: String }",
      format: "SDL",
    }));
    expect(res.type).toBeDefined();
    expect(res.type!.name).toBe("Post");
    expect(res.type!.format).toBe("SDL");
  });

  test("GetType", async () => {
    const res = await appsync.send(new GetTypeCommand({
      apiId,
      typeName: "Post",
      format: "SDL",
    }));
    expect(res.type!.name).toBe("Post");
    expect(res.type!.definition).toContain("Post");
  });

  test("ListTypes", async () => {
    const res = await appsync.send(new ListTypesCommand({ apiId, format: "SDL" }));
    expect(res.types!.some((t) => t.name === "Post")).toBe(true);
  });

  test("DeleteType", async () => {
    await appsync.send(new DeleteTypeCommand({ apiId, typeName: "Post" }));
    await expect(
      appsync.send(new GetTypeCommand({ apiId, typeName: "Post", format: "SDL" })),
    ).rejects.toThrow();
  });

  // --- Cleanup ---
  test("DeleteGraphqlApi", async () => {
    await appsync.send(new DeleteGraphqlApiCommand({ apiId }));
    const res = await appsync.send(new ListGraphqlApisCommand({}));
    expect(res.graphqlApis!.some((a) => a.apiId === apiId)).toBe(false);
  });

  test("GetGraphqlApi not found", async () => {
    await expect(
      appsync.send(new GetGraphqlApiCommand({ apiId: "nonexistent" })),
    ).rejects.toThrow();
  });
});
