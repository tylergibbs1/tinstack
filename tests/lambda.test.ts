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

  test("DeleteFunction", async () => {
    await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }));
    const res = await lambda.send(new ListFunctionsCommand({}));
    expect(res.Functions?.some((f) => f.FunctionName === functionName)).toBeFalsy();
  });
});
