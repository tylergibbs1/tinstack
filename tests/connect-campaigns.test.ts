import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const ccRequest = async (method: string, path: string, body?: any) => {
  const res = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "AWS4-HMAC-SHA256 Credential=test/20260101/us-east-1/connect-campaigns/aws4_request, SignedHeaders=host, Signature=test",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
};

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Connect Campaigns", () => {
  let campaignId: string;

  test("CreateCampaign", async () => {
    const res = await ccRequest("PUT", "/campaigns", { name: "test-campaign", connectInstanceId: "instance-123" });
    expect(res.status).toBe(200);
    const body = await res.json();
    campaignId = body.campaign.id;
    expect(campaignId).toBeDefined();
  });

  test("GetCampaign", async () => {
    const res = await ccRequest("GET", `/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.campaign.name).toBe("test-campaign");
  });

  test("StartCampaign", async () => {
    const res = await ccRequest("POST", `/campaigns/${campaignId}/start`);
    expect(res.status).toBe(200);
  });

  test("StopCampaign", async () => {
    const res = await ccRequest("POST", `/campaigns/${campaignId}/stop`);
    expect(res.status).toBe(200);
  });

  test("DeleteCampaign", async () => {
    const res = await ccRequest("DELETE", `/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
  });
});
