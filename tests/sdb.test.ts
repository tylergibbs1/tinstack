import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer, ENDPOINT } from "./helpers";

// SimpleDB has no official v3 SDK package, so we test with raw HTTP requests
const sdbRequest = async (action: string, params: Record<string, string> = {}) => {
  const body = new URLSearchParams({ Action: action, ...params });
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "AWS4-HMAC-SHA256 Credential=test/20260101/us-east-1/sdb/aws4_request, SignedHeaders=host, Signature=test",
    },
    body: body.toString(),
  });
  return { status: res.status, text: await res.text() };
};

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SimpleDB", () => {
  test("CreateDomain", async () => {
    const res = await sdbRequest("CreateDomain", { DomainName: "test-domain" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("CreateDomainResponse");
  });

  test("ListDomains", async () => {
    const res = await sdbRequest("ListDomains");
    expect(res.status).toBe(200);
    expect(res.text).toContain("test-domain");
  });

  test("PutAttributes and GetAttributes", async () => {
    const putRes = await sdbRequest("PutAttributes", {
      DomainName: "test-domain",
      ItemName: "item1",
      "Attribute.1.Name": "color",
      "Attribute.1.Value": "red",
    });
    expect(putRes.status).toBe(200);

    const getRes = await sdbRequest("GetAttributes", {
      DomainName: "test-domain",
      ItemName: "item1",
    });
    expect(getRes.status).toBe(200);
    expect(getRes.text).toContain("color");
    expect(getRes.text).toContain("red");
  });

  test("Select", async () => {
    const res = await sdbRequest("Select", { SelectExpression: "select * from test-domain" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("SelectResult");
  });

  test("DeleteDomain", async () => {
    const res = await sdbRequest("DeleteDomain", { DomainName: "test-domain" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("DeleteDomainResponse");
  });
});
