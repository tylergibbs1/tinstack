import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  APIGatewayClient,
  CreateRestApiCommand,
  GetRestApiCommand,
  GetRestApisCommand,
  DeleteRestApiCommand,
  CreateResourceCommand,
  GetResourcesCommand,
  PutMethodCommand,
  CreateDeploymentCommand,
  CreateStageCommand,
  GetStagesCommand,
} from "@aws-sdk/client-api-gateway";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new APIGatewayClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("API Gateway v1", () => {
  let apiId: string;
  let rootResourceId: string;
  let childResourceId: string;
  let deploymentId: string;

  test("CreateRestApi", async () => {
    const res = await client.send(new CreateRestApiCommand({
      name: "test-api",
      description: "A test REST API",
    }));
    apiId = res.id!;
    expect(apiId).toBeDefined();
    expect(res.name).toBe("test-api");
    expect(res.description).toBe("A test REST API");
  });

  test("GetRestApi", async () => {
    const res = await client.send(new GetRestApiCommand({ restApiId: apiId }));
    expect(res.id).toBe(apiId);
    expect(res.name).toBe("test-api");
  });

  test("GetRestApis", async () => {
    const res = await client.send(new GetRestApisCommand({}));
    expect(res.items).toBeDefined();
    expect(res.items!.length).toBeGreaterThanOrEqual(1);
    const found = res.items!.find((a) => a.id === apiId);
    expect(found).toBeDefined();
  });

  test("GetResources - root", async () => {
    const res = await client.send(new GetResourcesCommand({ restApiId: apiId }));
    expect(res.items).toBeDefined();
    expect(res.items!.length).toBeGreaterThanOrEqual(1);
    const root = res.items!.find((r) => r.path === "/");
    expect(root).toBeDefined();
    rootResourceId = root!.id!;
  });

  test("CreateResource", async () => {
    const res = await client.send(new CreateResourceCommand({
      restApiId: apiId,
      parentId: rootResourceId,
      pathPart: "items",
    }));
    childResourceId = res.id!;
    expect(childResourceId).toBeDefined();
    expect(res.pathPart).toBe("items");
    expect(res.path).toBe("/items");
  });

  test("PutMethod", async () => {
    const res = await client.send(new PutMethodCommand({
      restApiId: apiId,
      resourceId: childResourceId,
      httpMethod: "GET",
      authorizationType: "NONE",
    }));
    expect(res.httpMethod).toBe("GET");
    expect(res.authorizationType).toBe("NONE");
  });

  test("CreateDeployment", async () => {
    const res = await client.send(new CreateDeploymentCommand({
      restApiId: apiId,
      description: "v1 deployment",
    }));
    deploymentId = res.id!;
    expect(deploymentId).toBeDefined();
  });

  test("CreateStage", async () => {
    const res = await client.send(new CreateStageCommand({
      restApiId: apiId,
      stageName: "prod",
      deploymentId,
    }));
    expect(res.stageName).toBe("prod");
    expect(res.deploymentId).toBe(deploymentId);
  });

  test("GetStages", async () => {
    const res = await client.send(new GetStagesCommand({ restApiId: apiId }));
    expect(res.item).toBeDefined();
    expect(res.item!.length).toBeGreaterThanOrEqual(1);
    const prod = res.item!.find((s) => s.stageName === "prod");
    expect(prod).toBeDefined();
  });

  test("DeleteRestApi", async () => {
    await client.send(new DeleteRestApiCommand({ restApiId: apiId }));
    const res = await client.send(new GetRestApisCommand({}));
    expect(res.items!.find((a) => a.id === apiId)).toBeUndefined();
  });
});
