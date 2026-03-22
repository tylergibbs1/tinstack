import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ApiGatewayV2Client,
  CreateApiCommand,
  GetApiCommand,
  GetApisCommand,
  CreateRouteCommand,
  GetRoutesCommand,
  CreateIntegrationCommand,
  GetIntegrationsCommand,
  CreateStageCommand,
  GetStagesCommand,
  DeleteRouteCommand,
  DeleteIntegrationCommand,
  DeleteStageCommand,
  DeleteApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import { startServer, stopServer, clientConfig } from "./helpers";

const apigw = new ApiGatewayV2Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("API Gateway v2", () => {
  let apiId: string;
  let routeId: string;
  let integrationId: string;

  test("CreateApi", async () => {
    const res = await apigw.send(new CreateApiCommand({
      Name: "test-api",
      ProtocolType: "HTTP",
      Description: "Test HTTP API",
    }));
    apiId = res.ApiId!;
    expect(apiId).toBeDefined();
    expect(res.Name).toBe("test-api");
    expect(res.ProtocolType).toBe("HTTP");
  });

  test("GetApi", async () => {
    const res = await apigw.send(new GetApiCommand({ ApiId: apiId }));
    expect(res.Name).toBe("test-api");
  });

  test("GetApis", async () => {
    const res = await apigw.send(new GetApisCommand({}));
    expect(res.Items?.some((a) => a.ApiId === apiId)).toBe(true);
  });

  test("CreateIntegration", async () => {
    const res = await apigw.send(new CreateIntegrationCommand({
      ApiId: apiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: "arn:aws:lambda:us-east-1:000000000000:function:test-fn",
      IntegrationMethod: "POST",
      PayloadFormatVersion: "2.0",
    }));
    integrationId = res.IntegrationId!;
    expect(integrationId).toBeDefined();
    expect(res.IntegrationType).toBe("AWS_PROXY");
  });

  test("GetIntegrations", async () => {
    const res = await apigw.send(new GetIntegrationsCommand({ ApiId: apiId }));
    expect(res.Items?.some((i) => i.IntegrationId === integrationId)).toBe(true);
  });

  test("CreateRoute", async () => {
    const res = await apigw.send(new CreateRouteCommand({
      ApiId: apiId,
      RouteKey: "GET /items",
      Target: `integrations/${integrationId}`,
    }));
    routeId = res.RouteId!;
    expect(routeId).toBeDefined();
    expect(res.RouteKey).toBe("GET /items");
  });

  test("GetRoutes", async () => {
    const res = await apigw.send(new GetRoutesCommand({ ApiId: apiId }));
    expect(res.Items?.some((r) => r.RouteId === routeId)).toBe(true);
  });

  test("CreateStage", async () => {
    const res = await apigw.send(new CreateStageCommand({
      ApiId: apiId,
      StageName: "prod",
      AutoDeploy: true,
    }));
    expect(res.StageName).toBe("prod");
    expect(res.AutoDeploy).toBe(true);
  });

  test("GetStages", async () => {
    const res = await apigw.send(new GetStagesCommand({ ApiId: apiId }));
    expect(res.Items?.some((s) => s.StageName === "prod")).toBe(true);
  });

  test("Cleanup", async () => {
    await apigw.send(new DeleteRouteCommand({ ApiId: apiId, RouteId: routeId }));
    await apigw.send(new DeleteIntegrationCommand({ ApiId: apiId, IntegrationId: integrationId }));
    await apigw.send(new DeleteStageCommand({ ApiId: apiId, StageName: "prod" }));
    await apigw.send(new DeleteApiCommand({ ApiId: apiId }));

    const res = await apigw.send(new GetApisCommand({}));
    expect(res.Items?.some((a) => a.ApiId === apiId)).toBeFalsy();
  });
});
