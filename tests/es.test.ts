import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ElasticsearchServiceClient,
  CreateElasticsearchDomainCommand,
  DescribeElasticsearchDomainCommand,
  ListDomainNamesCommand,
  DeleteElasticsearchDomainCommand,
} from "@aws-sdk/client-elasticsearch-service";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const client = new ElasticsearchServiceClient({
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Elasticsearch (legacy)", () => {
  test("CreateElasticsearchDomain", async () => {
    const res = await client.send(new CreateElasticsearchDomainCommand({
      DomainName: "test-es-domain",
      ElasticsearchVersion: "7.10",
    }));
    expect(res.DomainStatus!.DomainName).toBe("test-es-domain");
    expect(res.DomainStatus!.Created).toBe(true);
  });

  test("DescribeElasticsearchDomain", async () => {
    const res = await client.send(new DescribeElasticsearchDomainCommand({
      DomainName: "test-es-domain",
    }));
    expect(res.DomainStatus!.DomainName).toBe("test-es-domain");
    expect(res.DomainStatus!.Endpoint).toContain("test-es-domain");
  });

  test("ListDomainNames", async () => {
    const res = await client.send(new ListDomainNamesCommand({}));
    expect(res.DomainNames!.length).toBeGreaterThanOrEqual(1);
    expect(res.DomainNames!.find((d) => d.DomainName === "test-es-domain")).toBeDefined();
  });

  test("DeleteElasticsearchDomain", async () => {
    const res = await client.send(new DeleteElasticsearchDomainCommand({
      DomainName: "test-es-domain",
    }));
    expect(res.DomainStatus!.Deleted).toBe(true);
  });
});
