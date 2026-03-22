import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const client = new SageMakerRuntimeClient({
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SageMaker Runtime", () => {
  test("InvokeEndpoint", async () => {
    const res = await client.send(new InvokeEndpointCommand({
      EndpointName: "test-endpoint",
      Body: new TextEncoder().encode(JSON.stringify({ instances: [{ features: [1, 2, 3] }] })),
      ContentType: "application/json",
    }));
    expect(res.Body).toBeDefined();
    const body = JSON.parse(new TextDecoder().decode(res.Body));
    expect(body.predictions).toBeDefined();
    expect(body.predictions[0].score).toBe(0.95);
  });

  test("InvokeEndpoint - different endpoint", async () => {
    const res = await client.send(new InvokeEndpointCommand({
      EndpointName: "another-endpoint",
      Body: new TextEncoder().encode("test"),
      ContentType: "text/plain",
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });
});
