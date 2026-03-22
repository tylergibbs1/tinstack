import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  NetworkManagerClient,
  CreateGlobalNetworkCommand,
  DescribeGlobalNetworksCommand,
  DeleteGlobalNetworkCommand,
  CreateSiteCommand,
  GetSitesCommand,
} from "@aws-sdk/client-networkmanager";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const client = new NetworkManagerClient({
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Network Manager", () => {
  let globalNetworkId: string;

  test("CreateGlobalNetwork", async () => {
    const res = await client.send(new CreateGlobalNetworkCommand({ Description: "test-network" }));
    globalNetworkId = res.GlobalNetwork!.GlobalNetworkId!;
    expect(globalNetworkId).toBeDefined();
  });

  test("DescribeGlobalNetworks", async () => {
    const res = await client.send(new DescribeGlobalNetworksCommand({}));
    expect(res.GlobalNetworks!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateSite", async () => {
    const res = await client.send(new CreateSiteCommand({
      GlobalNetworkId: globalNetworkId,
      Description: "test-site",
    }));
    expect(res.Site!.SiteId).toBeDefined();
  });

  test("GetSites", async () => {
    const res = await client.send(new GetSitesCommand({ GlobalNetworkId: globalNetworkId }));
    expect(res.Sites!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteGlobalNetwork", async () => {
    const res = await client.send(new DeleteGlobalNetworkCommand({ GlobalNetworkId: globalNetworkId }));
    expect(res.GlobalNetwork!.State).toBe("DELETING");
  });
});
