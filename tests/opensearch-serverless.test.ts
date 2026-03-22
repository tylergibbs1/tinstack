import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  OpenSearchServerlessClient,
  CreateCollectionCommand,
  BatchGetCollectionCommand,
  ListCollectionsCommand,
  DeleteCollectionCommand,
  CreateSecurityPolicyCommand,
} from "@aws-sdk/client-opensearchserverless";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new OpenSearchServerlessClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("OpenSearch Serverless", () => {
  let collectionId: string;

  test("CreateCollection", async () => {
    const res = await client.send(new CreateCollectionCommand({ name: "test-collection", type: "SEARCH" }));
    collectionId = res.createCollectionDetail!.id!;
    expect(collectionId).toBeDefined();
  });

  test("BatchGetCollection", async () => {
    const res = await client.send(new BatchGetCollectionCommand({ ids: [collectionId] }));
    expect(res.collectionDetails!.length).toBe(1);
    expect(res.collectionDetails![0].name).toBe("test-collection");
  });

  test("ListCollections", async () => {
    const res = await client.send(new ListCollectionsCommand({}));
    expect(res.collectionSummaries!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateSecurityPolicy", async () => {
    const res = await client.send(new CreateSecurityPolicyCommand({
      name: "test-policy",
      type: "encryption",
      policy: JSON.stringify({ Rules: [{ Resource: ["collection/test-collection"], ResourceType: "collection" }] }),
    }));
    expect(res.securityPolicyDetail!.name).toBe("test-policy");
  });

  test("DeleteCollection", async () => {
    const res = await client.send(new DeleteCollectionCommand({ id: collectionId }));
    expect(res.deleteCollectionDetail!.status).toBe("DELETING");
  });
});
