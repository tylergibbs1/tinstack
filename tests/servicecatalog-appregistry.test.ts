import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const appRegRequest = async (method: string, path: string, body?: any) => {
  const res = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "AWS4-HMAC-SHA256 Credential=test/20260101/us-east-1/servicecatalog/aws4_request, SignedHeaders=host, Signature=test",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
};

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Service Catalog AppRegistry", () => {
  let appId: string;

  test("CreateApplication", async () => {
    const res = await appRegRequest("POST", "/applications", { name: "test-app", description: "A test app", clientToken: "tok1" });
    expect(res.status).toBe(201);
    const body = await res.json();
    appId = body.application.id;
    expect(appId).toBeDefined();
  });

  test("GetApplication", async () => {
    const res = await appRegRequest("GET", `/applications/${appId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("test-app");
  });

  test("ListApplications", async () => {
    const res = await appRegRequest("GET", "/applications");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applications.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteApplication", async () => {
    const res = await appRegRequest("DELETE", `/applications/${appId}`);
    expect(res.status).toBe(200);
  });
});
