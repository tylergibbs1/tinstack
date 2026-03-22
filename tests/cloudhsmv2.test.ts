import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CloudHSMV2Client,
  CreateClusterCommand,
  DescribeClustersCommand,
  DeleteClusterCommand,
  CreateHsmCommand,
  DeleteHsmCommand,
} from "@aws-sdk/client-cloudhsm-v2";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new CloudHSMV2Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("CloudHSMv2", () => {
  let clusterId: string;

  test("CreateCluster", async () => {
    const res = await client.send(new CreateClusterCommand({
      HsmType: "hsm1.medium",
      SubnetIds: ["subnet-abc123"],
    }));
    expect(res.Cluster).toBeDefined();
    expect(res.Cluster!.ClusterId).toBeDefined();
    expect(res.Cluster!.State).toBe("UNINITIALIZED");
    clusterId = res.Cluster!.ClusterId!;
  });

  test("DescribeClusters", async () => {
    const res = await client.send(new DescribeClustersCommand({}));
    expect(res.Clusters).toBeDefined();
    expect(res.Clusters!.length).toBeGreaterThanOrEqual(1);
    expect(res.Clusters!.some(c => c.ClusterId === clusterId)).toBe(true);
  });

  test("CreateHsm + DeleteHsm", async () => {
    const createRes = await client.send(new CreateHsmCommand({
      ClusterId: clusterId,
      AvailabilityZone: "us-east-1a",
    }));
    expect(createRes.Hsm).toBeDefined();
    expect(createRes.Hsm!.State).toBe("ACTIVE");

    await client.send(new DeleteHsmCommand({
      ClusterId: clusterId,
      HsmId: createRes.Hsm!.HsmId,
    }));
  });

  test("DeleteCluster", async () => {
    const res = await client.send(new DeleteClusterCommand({ ClusterId: clusterId }));
    expect(res.Cluster).toBeDefined();
    expect(res.Cluster!.State).toBe("DELETED");
  });
});
