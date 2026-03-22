import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer, ENDPOINT } from "./helpers";

// Use raw HTTP since MediaStore Data paths conflict with S3 unless we set the right auth header
const msDataRequest = async (method: string, path: string, body?: any) => {
  const headers: Record<string, string> = {
    "Authorization": "AWS4-HMAC-SHA256 Credential=test/20260101/us-east-1/mediastore/aws4_request, SignedHeaders=host, Signature=test",
    "Content-Type": body instanceof Uint8Array ? "video/mp4" : "application/json",
  };
  const res = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers,
    body: body ?? undefined,
  });
  return res;
};

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("MediaStore Data", () => {
  test("PutObject", async () => {
    const res = await msDataRequest("PUT", "/test/video.mp4", new Uint8Array([1, 2, 3, 4]));
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBeDefined();
  });

  test("GetObject", async () => {
    const res = await msDataRequest("GET", "/test/video.mp4");
    expect(res.status).toBe(200);
    const data = new Uint8Array(await res.arrayBuffer());
    expect(data.length).toBe(4);
  });

  test("DescribeObject (HEAD)", async () => {
    const res = await msDataRequest("HEAD", "/test/video.mp4");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("4");
  });

  test("DeleteObject", async () => {
    const res = await msDataRequest("DELETE", "/test/video.mp4");
    expect(res.status).toBe(200);
  });

  test("GetObject - not found after delete", async () => {
    const res = await msDataRequest("GET", "/test/video.mp4");
    expect(res.status).toBe(404);
  });
});
