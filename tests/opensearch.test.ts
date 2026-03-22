import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  OpenSearchClient,
  CreateDomainCommand,
  DescribeDomainCommand,
  ListDomainNamesCommand,
  UpdateDomainConfigCommand,
  DescribeDomainConfigCommand,
  DeleteDomainCommand,
  AddTagsCommand,
  ListTagsCommand,
  RemoveTagsCommand,
} from "@aws-sdk/client-opensearch";
import { startServer, stopServer, clientConfig } from "./helpers";

const os = new OpenSearchClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("OpenSearch", () => {
  let domainArn: string;

  test("CreateDomain", async () => {
    const res = await os.send(new CreateDomainCommand({
      DomainName: "test-domain",
      EngineVersion: "OpenSearch_2.5",
      ClusterConfig: {
        InstanceType: "t3.small.search",
        InstanceCount: 1,
      },
      EBSOptions: {
        EBSEnabled: true,
        VolumeType: "gp2",
        VolumeSize: 10,
      },
    }));
    expect(res.DomainStatus).toBeDefined();
    expect(res.DomainStatus!.DomainName).toBe("test-domain");
    expect(res.DomainStatus!.EngineVersion).toBe("OpenSearch_2.5");
    expect(res.DomainStatus!.Created).toBe(true);
    expect(res.DomainStatus!.Endpoint).toBeDefined();
    domainArn = res.DomainStatus!.ARN!;
  });

  test("DescribeDomain", async () => {
    const res = await os.send(new DescribeDomainCommand({
      DomainName: "test-domain",
    }));
    expect(res.DomainStatus).toBeDefined();
    expect(res.DomainStatus!.DomainName).toBe("test-domain");
    expect(res.DomainStatus!.ClusterConfig!.InstanceType).toBe("t3.small.search");
    expect(res.DomainStatus!.EBSOptions!.EBSEnabled).toBe(true);
  });

  test("ListDomainNames", async () => {
    const res = await os.send(new ListDomainNamesCommand({}));
    expect(res.DomainNames!.length).toBeGreaterThanOrEqual(1);
    const found = res.DomainNames!.find((d) => d.DomainName === "test-domain");
    expect(found).toBeDefined();
    expect(found!.EngineType).toBe("OpenSearch");
  });

  test("UpdateDomainConfig", async () => {
    const res = await os.send(new UpdateDomainConfigCommand({
      DomainName: "test-domain",
      ClusterConfig: {
        InstanceType: "m5.large.search",
        InstanceCount: 2,
      },
    }));
    expect(res.DomainConfig).toBeDefined();
    expect(res.DomainConfig!.ClusterConfig!.Options!.InstanceType).toBe("m5.large.search");
    expect(res.DomainConfig!.ClusterConfig!.Options!.InstanceCount).toBe(2);
  });

  test("DescribeDomainConfig", async () => {
    const res = await os.send(new DescribeDomainConfigCommand({
      DomainName: "test-domain",
    }));
    expect(res.DomainConfig).toBeDefined();
    expect(res.DomainConfig!.EngineVersion!.Options).toBe("OpenSearch_2.5");
  });

  // Verify the update persisted
  test("DescribeDomain - verify update", async () => {
    const res = await os.send(new DescribeDomainCommand({
      DomainName: "test-domain",
    }));
    expect(res.DomainStatus!.ClusterConfig!.InstanceType).toBe("m5.large.search");
    expect(res.DomainStatus!.ClusterConfig!.InstanceCount).toBe(2);
  });

  // --- Tags ---

  test("AddTags", async () => {
    await os.send(new AddTagsCommand({
      ARN: domainArn,
      TagList: [
        { Key: "env", Value: "test" },
        { Key: "team", Value: "search" },
      ],
    }));
  });

  test("ListTags", async () => {
    const res = await os.send(new ListTagsCommand({
      ARN: domainArn,
    }));
    expect(res.TagList!.length).toBe(2);
    expect(res.TagList!.find((t) => t.Key === "env")!.Value).toBe("test");
  });

  test("RemoveTags", async () => {
    await os.send(new RemoveTagsCommand({
      ARN: domainArn,
      TagKeys: ["team"],
    }));
    const res = await os.send(new ListTagsCommand({
      ARN: domainArn,
    }));
    expect(res.TagList!.length).toBe(1);
    expect(res.TagList![0].Key).toBe("env");
  });

  // --- Cleanup ---

  test("DeleteDomain", async () => {
    const res = await os.send(new DeleteDomainCommand({
      DomainName: "test-domain",
    }));
    expect(res.DomainStatus!.Deleted).toBe(true);

    // Verify it's gone
    const list = await os.send(new ListDomainNamesCommand({}));
    const found = list.DomainNames!.find((d) => d.DomainName === "test-domain");
    expect(found).toBeUndefined();
  });
});
