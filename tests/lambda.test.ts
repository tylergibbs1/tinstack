import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  ListFunctionsCommand,
  InvokeCommand,
  UpdateFunctionConfigurationCommand,
  DeleteFunctionCommand,
  CreateEventSourceMappingCommand,
  ListEventSourceMappingsCommand,
  DeleteEventSourceMappingCommand,
  PublishVersionCommand,
  ListVersionsByFunctionCommand,
  CreateAliasCommand,
  GetAliasCommand,
  ListAliasesCommand,
  UpdateAliasCommand,
  DeleteAliasCommand,
  PublishLayerVersionCommand,
  GetLayerVersionCommand,
  ListLayersCommand,
  ListLayerVersionsCommand,
  DeleteLayerVersionCommand,
  AddPermissionCommand,
  GetPolicyCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-lambda";
import { startServer, stopServer, clientConfig } from "./helpers";

const lambda = new LambdaClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

// Create a simple Lambda function as a ZIP
function createSimpleZip(): string {
  // Minimal ZIP containing index.js with a handler
  // We'll create a real ZIP using Bun
  const code = `exports.handler = async (event, context) => {
    return { statusCode: 200, body: JSON.stringify({ message: "hello", event }) };
  };`;
  // For test purposes, use base64 of a minimal valid ZIP would be complex,
  // so we test the mock invocation path
  return Buffer.from(code).toString("base64");
}

describe("Lambda", () => {
  const functionName = "test-function-" + Date.now();

  test("CreateFunction", async () => {
    const res = await lambda.send(new CreateFunctionCommand({
      FunctionName: functionName,
      Runtime: "nodejs20.x",
      Role: "arn:aws:iam::000000000000:role/lambda-role",
      Handler: "index.handler",
      Code: { ZipFile: Buffer.from("fake-zip-content") },
      Description: "Test function",
      Timeout: 3,
      MemorySize: 256,
      Environment: { Variables: { NODE_ENV: "test" } },
    }));
    expect(res.FunctionName).toBe(functionName);
    expect(res.Runtime).toBe("nodejs20.x");
    expect(res.Handler).toBe("index.handler");
    expect(res.Timeout).toBe(3);
    expect(res.MemorySize).toBe(256);
    expect(res.State).toBe("Active");
    expect(res.FunctionArn).toContain(functionName);
  });

  test("GetFunction", async () => {
    const res = await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    expect(res.Configuration?.FunctionName).toBe(functionName);
    expect(res.Configuration?.Description).toBe("Test function");
    expect(res.Configuration?.Environment?.Variables?.NODE_ENV).toBe("test");
  });

  test("ListFunctions", async () => {
    const res = await lambda.send(new ListFunctionsCommand({}));
    expect(res.Functions?.some((f) => f.FunctionName === functionName)).toBe(true);
  });

  test("Invoke", async () => {
    const res = await lambda.send(new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify({ key: "value" })),
    }));
    expect(res.StatusCode).toBe(200);
    expect(res.Payload).toBeDefined();
    const payloadStr = new TextDecoder().decode(res.Payload);
    expect(payloadStr.length).toBeGreaterThan(0);
  }, 15000);

  test("UpdateFunctionConfiguration", async () => {
    const res = await lambda.send(new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      Timeout: 60,
      Description: "Updated description",
    }));
    expect(res.Timeout).toBe(60);
    expect(res.Description).toBe("Updated description");
  });

  test("Event Source Mapping", async () => {
    const create = await lambda.send(new CreateEventSourceMappingCommand({
      FunctionName: functionName,
      EventSourceArn: "arn:aws:sqs:us-east-1:000000000000:test-queue",
      BatchSize: 5,
      Enabled: true,
    }));
    expect(create.UUID).toBeDefined();
    expect(create.BatchSize).toBe(5);

    const list = await lambda.send(new ListEventSourceMappingsCommand({
      FunctionName: functionName,
    }));
    expect(list.EventSourceMappings?.length).toBeGreaterThan(0);

    await lambda.send(new DeleteEventSourceMappingCommand({ UUID: create.UUID! }));
  });

  test("PublishVersion", async () => {
    const res = await lambda.send(new PublishVersionCommand({
      FunctionName: functionName,
      Description: "v1 release",
    }));
    expect(res.Version).toBe("1");
    expect(res.FunctionName).toBe(functionName);
  });

  test("ListVersionsByFunction", async () => {
    const res = await lambda.send(new ListVersionsByFunctionCommand({
      FunctionName: functionName,
    }));
    expect(res.Versions!.length).toBeGreaterThanOrEqual(2); // $LATEST + version 1
    expect(res.Versions!.some((v) => v.Version === "$LATEST")).toBe(true);
    expect(res.Versions!.some((v) => v.Version === "1")).toBe(true);
  });

  test("CreateAlias", async () => {
    const res = await lambda.send(new CreateAliasCommand({
      FunctionName: functionName,
      Name: "prod",
      FunctionVersion: "1",
      Description: "Production alias",
    }));
    expect(res.Name).toBe("prod");
    expect(res.FunctionVersion).toBe("1");
    expect(res.Description).toBe("Production alias");
    expect(res.AliasArn).toContain(functionName);
  });

  test("GetAlias", async () => {
    const res = await lambda.send(new GetAliasCommand({
      FunctionName: functionName,
      Name: "prod",
    }));
    expect(res.Name).toBe("prod");
    expect(res.FunctionVersion).toBe("1");
  });

  test("ListAliases", async () => {
    const res = await lambda.send(new ListAliasesCommand({
      FunctionName: functionName,
    }));
    expect(res.Aliases!.some((a) => a.Name === "prod")).toBe(true);
  });

  test("UpdateAlias", async () => {
    // Publish a second version to update alias to
    await lambda.send(new PublishVersionCommand({ FunctionName: functionName }));
    const res = await lambda.send(new UpdateAliasCommand({
      FunctionName: functionName,
      Name: "prod",
      FunctionVersion: "2",
      Description: "Updated prod",
    }));
    expect(res.FunctionVersion).toBe("2");
    expect(res.Description).toBe("Updated prod");
  });

  test("DeleteAlias", async () => {
    await lambda.send(new DeleteAliasCommand({
      FunctionName: functionName,
      Name: "prod",
    }));
    const res = await lambda.send(new ListAliasesCommand({
      FunctionName: functionName,
    }));
    expect(res.Aliases!.some((a) => a.Name === "prod")).toBe(false);
  });

  test("PublishLayerVersion", async () => {
    const res = await lambda.send(new PublishLayerVersionCommand({
      LayerName: "test-layer",
      Description: "A test layer",
      Content: { ZipFile: Buffer.from("fake-layer-content") },
      CompatibleRuntimes: ["nodejs20.x", "nodejs18.x"],
    }));
    expect(res.Version).toBe(1);
    expect(res.Description).toBe("A test layer");
    expect(res.CompatibleRuntimes).toContain("nodejs20.x");
    expect(res.LayerVersionArn).toContain("test-layer");
  });

  test("GetLayerVersion", async () => {
    const res = await lambda.send(new GetLayerVersionCommand({
      LayerName: "test-layer",
      VersionNumber: 1,
    }));
    expect(res.Version).toBe(1);
    expect(res.Description).toBe("A test layer");
  });

  test("ListLayers", async () => {
    const res = await lambda.send(new ListLayersCommand({}));
    expect(res.Layers!.some((l) => l.LayerName === "test-layer")).toBe(true);
  });

  test("ListLayerVersions", async () => {
    // Publish a second version
    await lambda.send(new PublishLayerVersionCommand({
      LayerName: "test-layer",
      Description: "v2",
      Content: { ZipFile: Buffer.from("fake-layer-v2") },
      CompatibleRuntimes: ["nodejs20.x"],
    }));
    const res = await lambda.send(new ListLayerVersionsCommand({
      LayerName: "test-layer",
    }));
    expect(res.LayerVersions!.length).toBe(2);
  });

  test("DeleteLayerVersion", async () => {
    await lambda.send(new DeleteLayerVersionCommand({
      LayerName: "test-layer",
      VersionNumber: 1,
    }));
    const res = await lambda.send(new ListLayerVersionsCommand({
      LayerName: "test-layer",
    }));
    expect(res.LayerVersions!.length).toBe(1);
    expect(res.LayerVersions![0].Version).toBe(2);
  });

  test("AddPermission and GetPolicy", async () => {
    await lambda.send(new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: "allow-s3",
      Action: "lambda:InvokeFunction",
      Principal: "s3.amazonaws.com",
      SourceArn: "arn:aws:s3:::my-bucket",
    }));

    const res = await lambda.send(new GetPolicyCommand({
      FunctionName: functionName,
    }));
    expect(res.Policy).toBeDefined();
    const policy = JSON.parse(res.Policy!);
    expect(policy.Statement.some((s: any) => s.Sid === "allow-s3")).toBe(true);
  });

  test("RemovePermission", async () => {
    await lambda.send(new RemovePermissionCommand({
      FunctionName: functionName,
      StatementId: "allow-s3",
    }));
    // Policy should now be empty / not found
    try {
      await lambda.send(new GetPolicyCommand({ FunctionName: functionName }));
      expect(true).toBe(false); // should not reach here
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("DeleteFunction", async () => {
    await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }));
    const res = await lambda.send(new ListFunctionsCommand({}));
    expect(res.Functions?.some((f) => f.FunctionName === functionName)).toBeFalsy();
  });
});
