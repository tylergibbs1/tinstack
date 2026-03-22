import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  DirectConnectClient,
  CreateConnectionCommand,
  DescribeConnectionsCommand,
  DeleteConnectionCommand,
  CreatePrivateVirtualInterfaceCommand,
  CreatePublicVirtualInterfaceCommand,
  DescribeVirtualInterfacesCommand,
  DeleteVirtualInterfaceCommand,
  CreateDirectConnectGatewayCommand,
  DescribeDirectConnectGatewaysCommand,
  DeleteDirectConnectGatewayCommand,
  CreateLagCommand,
  DescribeLagsCommand,
  DeleteLagCommand,
  TagResourceCommand,
  UntagResourceCommand,
  DescribeTagsCommand,
} from "@aws-sdk/client-direct-connect";
import { startServer, stopServer, clientConfig } from "./helpers";

const dx = new DirectConnectClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Direct Connect", () => {
  let connectionId: string;
  let viId: string;
  let gwId: string;
  let lagId: string;

  test("CreateConnection", async () => {
    const res = await dx.send(new CreateConnectionCommand({
      connectionName: "test-connection",
      bandwidth: "1Gbps",
      location: "EqDC2",
    }));
    expect(res.connectionId).toBeDefined();
    expect(res.connectionName).toBe("test-connection");
    expect(res.connectionState).toBe("available");
    connectionId = res.connectionId!;
  });

  test("DescribeConnections", async () => {
    const res = await dx.send(new DescribeConnectionsCommand({
      connectionId,
    }));
    expect(res.connections).toBeDefined();
    expect(res.connections!.length).toBe(1);
    expect(res.connections![0].connectionName).toBe("test-connection");
  });

  test("CreatePrivateVirtualInterface", async () => {
    const res = await dx.send(new CreatePrivateVirtualInterfaceCommand({
      connectionId,
      newPrivateVirtualInterface: {
        virtualInterfaceName: "test-private-vif",
        vlan: 100,
        asn: 65000,
      },
    }));
    expect(res.virtualInterfaceId).toBeDefined();
    expect(res.virtualInterfaceName).toBe("test-private-vif");
    expect(res.virtualInterfaceType).toBe("private");
    viId = res.virtualInterfaceId!;
  });

  test("CreatePublicVirtualInterface", async () => {
    const res = await dx.send(new CreatePublicVirtualInterfaceCommand({
      connectionId,
      newPublicVirtualInterface: {
        virtualInterfaceName: "test-public-vif",
        vlan: 200,
        asn: 65001,
        routeFilterPrefixes: [{ cidr: "203.0.113.0/24" }],
      },
    }));
    expect(res.virtualInterfaceId).toBeDefined();
    expect(res.virtualInterfaceType).toBe("public");
  });

  test("DescribeVirtualInterfaces", async () => {
    const res = await dx.send(new DescribeVirtualInterfacesCommand({
      connectionId,
    }));
    expect(res.virtualInterfaces).toBeDefined();
    expect(res.virtualInterfaces!.length).toBe(2);
  });

  test("DeleteVirtualInterface", async () => {
    const res = await dx.send(new DeleteVirtualInterfaceCommand({
      virtualInterfaceId: viId,
    }));
    expect(res.virtualInterfaceState).toBe("deleted");
  });

  test("CreateDirectConnectGateway", async () => {
    const res = await dx.send(new CreateDirectConnectGatewayCommand({
      directConnectGatewayName: "test-gateway",
      amazonSideAsn: 64512,
    }));
    expect(res.directConnectGateway).toBeDefined();
    expect(res.directConnectGateway!.directConnectGatewayName).toBe("test-gateway");
    gwId = res.directConnectGateway!.directConnectGatewayId!;
  });

  test("DescribeDirectConnectGateways", async () => {
    const res = await dx.send(new DescribeDirectConnectGatewaysCommand({
      directConnectGatewayId: gwId,
    }));
    expect(res.directConnectGateways!.length).toBe(1);
    expect(res.directConnectGateways![0].amazonSideAsn).toBe(64512);
  });

  test("DeleteDirectConnectGateway", async () => {
    const res = await dx.send(new DeleteDirectConnectGatewayCommand({
      directConnectGatewayId: gwId,
    }));
    expect(res.directConnectGateway!.directConnectGatewayState).toBe("deleted");
  });

  test("CreateLag", async () => {
    const res = await dx.send(new CreateLagCommand({
      lagName: "test-lag",
      connectionsBandwidth: "1Gbps",
      numberOfConnections: 2,
      location: "EqDC2",
    }));
    expect(res.lagId).toBeDefined();
    expect(res.lagName).toBe("test-lag");
    expect(res.numberOfConnections).toBe(2);
    expect(res.connections!.length).toBe(2);
    lagId = res.lagId!;
  });

  test("DescribeLags", async () => {
    const res = await dx.send(new DescribeLagsCommand({
      lagId,
    }));
    expect(res.lags!.length).toBe(1);
    expect(res.lags![0].lagName).toBe("test-lag");
  });

  test("TagResource + DescribeTags", async () => {
    await dx.send(new TagResourceCommand({
      resourceArn: connectionId,
      tags: [{ key: "env", value: "test" }],
    }));

    const res = await dx.send(new DescribeTagsCommand({
      resourceArns: [connectionId],
    }));
    expect(res.resourceTags).toBeDefined();
    expect(res.resourceTags!.length).toBe(1);
    expect(res.resourceTags![0].tags!.length).toBe(1);
    expect(res.resourceTags![0].tags![0].key).toBe("env");
  });

  test("UntagResource", async () => {
    await dx.send(new UntagResourceCommand({
      resourceArn: connectionId,
      tagKeys: ["env"],
    }));

    const res = await dx.send(new DescribeTagsCommand({
      resourceArns: [connectionId],
    }));
    expect(res.resourceTags![0].tags!.length).toBe(0);
  });

  test("DeleteLag", async () => {
    const res = await dx.send(new DeleteLagCommand({
      lagId,
    }));
    expect(res.lagState).toBe("deleted");
  });

  test("DeleteConnection", async () => {
    const res = await dx.send(new DeleteConnectionCommand({
      connectionId,
    }));
    expect(res.connectionState).toBe("deleted");
  });
});
