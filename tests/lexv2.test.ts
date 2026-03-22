import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const lexRequest = async (method: string, path: string, body?: any) => {
  const res = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "AWS4-HMAC-SHA256 Credential=test/20260101/us-east-1/models.lex.v2/aws4_request, SignedHeaders=host, Signature=test",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
};

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Lex V2 Models", () => {
  let botId: string;

  test("CreateBot", async () => {
    const res = await lexRequest("PUT", "/bots", {
      botName: "test-bot",
      description: "A test bot",
      roleArn: "arn:aws:iam::000000000000:role/LexRole",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    botId = body.botId;
    expect(botId).toBeDefined();
    expect(body.botName).toBe("test-bot");
  });

  test("DescribeBot", async () => {
    const res = await lexRequest("GET", `/bots/${botId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.botName).toBe("test-bot");
  });

  test("ListBots", async () => {
    const res = await lexRequest("POST", "/bots", {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.botSummaries.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteBot", async () => {
    const res = await lexRequest("DELETE", `/bots/${botId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.botStatus).toBe("Deleting");
  });
});
