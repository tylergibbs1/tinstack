import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  BedrockAgentClient,
  CreateAgentCommand,
  GetAgentCommand,
  ListAgentsCommand,
  DeleteAgentCommand,
  CreateKnowledgeBaseCommand,
  ListKnowledgeBasesCommand,
} from "@aws-sdk/client-bedrock-agent";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new BedrockAgentClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("BedrockAgent", () => {
  let agentId: string;

  test("CreateAgent", async () => {
    const res = await client.send(new CreateAgentCommand({
      agentName: "test-agent",
      foundationModel: "anthropic.claude-v2",
      instruction: "You are a helpful assistant",
    }));
    expect(res.agent).toBeDefined();
    expect(res.agent!.agentName).toBe("test-agent");
    agentId = res.agent!.agentId!;
  });

  test("GetAgent", async () => {
    const res = await client.send(new GetAgentCommand({ agentId }));
    expect(res.agent).toBeDefined();
    expect(res.agent!.agentName).toBe("test-agent");
  });

  test("ListAgents", async () => {
    const res = await client.send(new ListAgentsCommand({}));
    expect(res.agentSummaries).toBeDefined();
    expect(res.agentSummaries!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateKnowledgeBase + List", async () => {
    const res = await client.send(new CreateKnowledgeBaseCommand({
      name: "test-kb",
      roleArn: "arn:aws:iam::123456789012:role/TestRole",
      knowledgeBaseConfiguration: { type: "VECTOR", vectorKnowledgeBaseConfiguration: { embeddingModelArn: "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1" } },
      storageConfiguration: { type: "OPENSEARCH_SERVERLESS", opensearchServerlessConfiguration: { collectionArn: "arn:aws:aoss:us-east-1:123456789012:collection/test", fieldMapping: { vectorField: "vec", textField: "text", metadataField: "meta" }, vectorIndexName: "test-index" } },
    }));
    expect(res.knowledgeBase).toBeDefined();
    expect(res.knowledgeBase!.name).toBe("test-kb");

    const list = await client.send(new ListKnowledgeBasesCommand({}));
    expect(list.knowledgeBaseSummaries!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteAgent", async () => {
    const res = await client.send(new DeleteAgentCommand({ agentId }));
    expect(res.agentId).toBe(agentId);
  });
});
