import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockClient,
  ListFoundationModelsCommand,
} from "@aws-sdk/client-bedrock";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { startServer, stopServer, clientConfig } from "./helpers";

const httpHandler = new NodeHttpHandler();
const bedrockRuntime = new BedrockRuntimeClient({ ...clientConfig, requestHandler: httpHandler });
const bedrock = new BedrockClient({ ...clientConfig, requestHandler: httpHandler });

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Bedrock Runtime", () => {
  test("InvokeModel - Claude messages format", async () => {
    const body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 256,
      messages: [{ role: "user", content: "Hello" }],
    });

    const res = await bedrockRuntime.send(new InvokeModelCommand({
      modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(body),
    }));

    const result = JSON.parse(new TextDecoder().decode(res.body));
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThanOrEqual(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Mock response");
    expect(result.model).toBe("anthropic.claude-3-sonnet-20240229-v1:0");
    expect(result.stop_reason).toBe("end_turn");
    expect(result.usage).toBeDefined();
    expect(result.usage.input_tokens).toBeGreaterThan(0);
  });

  test("InvokeModel - Titan format", async () => {
    const body = JSON.stringify({
      inputText: "Tell me a story",
      textGenerationConfig: { maxTokenCount: 100 },
    });

    const res = await bedrockRuntime.send(new InvokeModelCommand({
      modelId: "amazon.titan-text-express-v1",
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(body),
    }));

    const result = JSON.parse(new TextDecoder().decode(res.body));
    expect(result.results).toBeDefined();
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.results[0].outputText).toContain("Mock response");
    expect(result.results[0].completionReason).toBe("FINISH");
  });

  test("InvokeModel - generic format", async () => {
    const body = JSON.stringify({ prompt: "Hello" });

    const res = await bedrockRuntime.send(new InvokeModelCommand({
      modelId: "meta.llama3-8b-instruct-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(body),
    }));

    const result = JSON.parse(new TextDecoder().decode(res.body));
    expect(result.completion).toContain("Mock response");
  });
});

describe("Bedrock Control Plane", () => {
  test("ListFoundationModels", async () => {
    const res = await bedrock.send(new ListFoundationModelsCommand({}));
    expect(res.modelSummaries).toBeDefined();
    expect(res.modelSummaries!.length).toBeGreaterThanOrEqual(3);

    const claude = res.modelSummaries!.find((m) => m.modelId?.includes("claude-3-sonnet"));
    expect(claude).toBeDefined();
    expect(claude!.providerName).toBe("Anthropic");
    expect(claude!.inputModalities).toContain("TEXT");
    expect(claude!.outputModalities).toContain("TEXT");

    const titan = res.modelSummaries!.find((m) => m.modelId?.includes("titan-text"));
    expect(titan).toBeDefined();
    expect(titan!.providerName).toBe("Amazon");
  });
});
