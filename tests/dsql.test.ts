import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  DSQLClient,
  CreateClusterCommand,
  GetClusterCommand,
  ListClustersCommand,
  DeleteClusterCommand,
  UpdateClusterCommand,
} from "@aws-sdk/client-dsql";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new DSQLClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("DSQL", () => {
  let clusterId: string;

  test("CreateCluster", async () => {
    const res = await client.send(new CreateClusterCommand({
      deletionProtectionEnabled: false,
    }));
    expect(res.identifier).toBeDefined();
    expect(res.status).toBe("ACTIVE");
    expect(res.endpoint).toBeDefined();
    clusterId = res.identifier!;
  });

  test("GetCluster", async () => {
    const res = await client.send(new GetClusterCommand({ identifier: clusterId }));
    expect(res.identifier).toBe(clusterId);
    expect(res.status).toBe("ACTIVE");
  });

  test("ListClusters", async () => {
    const res = await client.send(new ListClustersCommand({}));
    expect(res.clusters).toBeDefined();
    expect(res.clusters!.length).toBeGreaterThanOrEqual(1);
  });

  test("UpdateCluster", async () => {
    const res = await client.send(new UpdateClusterCommand({
      identifier: clusterId,
      deletionProtectionEnabled: false,
    }));
    expect(res.identifier).toBe(clusterId);
  });

  test("DeleteCluster", async () => {
    const res = await client.send(new DeleteClusterCommand({ identifier: clusterId }));
    expect(res.identifier).toBe(clusterId);
    expect(res.status).toBe("DELETING");
  });
});
