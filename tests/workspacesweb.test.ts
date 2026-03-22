import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  WorkSpacesWebClient,
  CreatePortalCommand,
  GetPortalCommand,
  ListPortalsCommand,
  DeletePortalCommand,
  CreateBrowserSettingsCommand,
  CreateNetworkSettingsCommand,
} from "@aws-sdk/client-workspaces-web";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new WorkSpacesWebClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("WorkSpacesWeb", () => {
  let portalArn: string;

  test("CreatePortal", async () => {
    const res = await client.send(new CreatePortalCommand({ displayName: "test-portal" }));
    expect(res.portalArn).toBeDefined();
    expect(res.portalEndpoint).toBeDefined();
    portalArn = res.portalArn!;
  });

  test("GetPortal", async () => {
    const res = await client.send(new GetPortalCommand({ portalArn }));
    expect(res.portal).toBeDefined();
    expect(res.portal!.displayName).toBe("test-portal");
  });

  test("ListPortals", async () => {
    const res = await client.send(new ListPortalsCommand({}));
    expect(res.portals).toBeDefined();
    expect(res.portals!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateBrowserSettings + CreateNetworkSettings", async () => {
    const bsRes = await client.send(new CreateBrowserSettingsCommand({ browserPolicy: "{}" }));
    expect(bsRes.browserSettingsArn).toBeDefined();

    const nsRes = await client.send(new CreateNetworkSettingsCommand({
      vpcId: "vpc-123",
      subnetIds: ["subnet-123"],
      securityGroupIds: ["sg-123"],
    }));
    expect(nsRes.networkSettingsArn).toBeDefined();
  });

  test("DeletePortal", async () => {
    await client.send(new DeletePortalCommand({ portalArn }));
    const res = await client.send(new ListPortalsCommand({}));
    expect(res.portals!.some((p: any) => p.portalArn === portalArn)).toBe(false);
  });
});
