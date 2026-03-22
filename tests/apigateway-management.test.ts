import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GetConnectionCommand,
  DeleteConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const client = new ApiGatewayManagementApiClient({
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("API Gateway Management API", () => {
  const connectionId = "test-conn-123";

  test("PostToConnection", async () => {
    const res = await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: new TextEncoder().encode(JSON.stringify({ message: "hello" })),
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("GetConnection", async () => {
    const res = await client.send(new GetConnectionCommand({ ConnectionId: connectionId }));
    expect(res.ConnectedAt ?? (res as any).connectedAt).toBeDefined();
  });

  test("DeleteConnection", async () => {
    const res = await client.send(new DeleteConnectionCommand({ ConnectionId: connectionId }));
    expect(res.$metadata.httpStatusCode).toBe(204);
  });

  test("GetConnection - gone after delete", async () => {
    await expect(client.send(new GetConnectionCommand({ ConnectionId: connectionId }))).rejects.toThrow();
  });
});
