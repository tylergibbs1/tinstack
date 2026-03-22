import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer, ENDPOINT } from "./helpers";

// Use raw HTTP to set correct auth header for iot data plane
const iotDataRequest = async (method: string, path: string, body?: string) => {
  const res = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "AWS4-HMAC-SHA256 Credential=test/20260101/us-east-1/iotdata/aws4_request, SignedHeaders=host, Signature=test",
    },
    body: body ?? undefined,
  });
  return res;
};

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("IoT Data", () => {
  test("Publish", async () => {
    const res = await iotDataRequest("POST", "/topics/test%2Ftopic", "hello");
    expect(res.status).toBe(200);
  });

  test("UpdateThingShadow", async () => {
    const payload = JSON.stringify({ state: { desired: { temp: 72 } } });
    const res = await iotDataRequest("POST", "/things/test-thing/shadow", payload);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("GetThingShadow", async () => {
    const res = await iotDataRequest("GET", "/things/test-thing/shadow");
    expect(res.status).toBe(200);
  });

  test("ListNamedShadowsForThing", async () => {
    const res = await iotDataRequest("GET", "/api/things/shadow/ListNamedShadowsForThing/test-thing");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toBeDefined();
  });

  test("DeleteThingShadow", async () => {
    const res = await iotDataRequest("DELETE", "/things/test-thing/shadow");
    expect(res.status).toBe(200);
  });
});
