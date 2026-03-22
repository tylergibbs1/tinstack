import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  VPCLatticeClient,
  CreateServiceNetworkCommand,
  GetServiceNetworkCommand,
  ListServiceNetworksCommand,
  DeleteServiceNetworkCommand,
  CreateServiceCommand,
  GetServiceCommand,
  ListServicesCommand,
  DeleteServiceCommand,
  CreateTargetGroupCommand,
  GetTargetGroupCommand,
  ListTargetGroupsCommand,
  RegisterTargetsCommand,
  DeregisterTargetsCommand,
  ListTargetsCommand,
} from "@aws-sdk/client-vpc-lattice";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new VPCLatticeClient({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("VPC Lattice", () => {
  let serviceNetworkId: string;
  let serviceId: string;
  let targetGroupId: string;

  test("CreateServiceNetwork", async () => {
    const result = await client.send(new CreateServiceNetworkCommand({ name: "test-sn" }));
    expect(result.id).toBeDefined();
    expect(result.name).toBe("test-sn");
    serviceNetworkId = result.id!;
  });

  test("GetServiceNetwork", async () => {
    const result = await client.send(new GetServiceNetworkCommand({ serviceNetworkIdentifier: serviceNetworkId }));
    expect(result.name).toBe("test-sn");
  });

  test("ListServiceNetworks", async () => {
    const result = await client.send(new ListServiceNetworksCommand({}));
    expect(result.items?.some((s) => s.id === serviceNetworkId)).toBe(true);
  });

  test("CreateService", async () => {
    const result = await client.send(new CreateServiceCommand({ name: "test-service" }));
    expect(result.id).toBeDefined();
    expect(result.name).toBe("test-service");
    serviceId = result.id!;
  });

  test("GetService", async () => {
    const result = await client.send(new GetServiceCommand({ serviceIdentifier: serviceId }));
    expect(result.name).toBe("test-service");
  });

  test("ListServices", async () => {
    const result = await client.send(new ListServicesCommand({}));
    expect(result.items?.some((s) => s.id === serviceId)).toBe(true);
  });

  test("CreateTargetGroup", async () => {
    const result = await client.send(new CreateTargetGroupCommand({
      name: "test-tg",
      type: "INSTANCE",
      config: { port: 80, protocol: "HTTP", vpcIdentifier: "vpc-12345" },
    }));
    expect(result.id).toBeDefined();
    expect(result.name).toBe("test-tg");
    targetGroupId = result.id!;
  });

  test("GetTargetGroup", async () => {
    const result = await client.send(new GetTargetGroupCommand({ targetGroupIdentifier: targetGroupId }));
    expect(result.name).toBe("test-tg");
  });

  test("RegisterTargets + ListTargets", async () => {
    await client.send(new RegisterTargetsCommand({
      targetGroupIdentifier: targetGroupId,
      targets: [{ id: "i-12345", port: 80 }],
    }));
    const result = await client.send(new ListTargetsCommand({ targetGroupIdentifier: targetGroupId }));
    expect(result.items?.length).toBe(1);
    expect(result.items![0].id).toBe("i-12345");
  });

  test("DeregisterTargets", async () => {
    await client.send(new DeregisterTargetsCommand({
      targetGroupIdentifier: targetGroupId,
      targets: [{ id: "i-12345" }],
    }));
    const result = await client.send(new ListTargetsCommand({ targetGroupIdentifier: targetGroupId }));
    expect(result.items?.length).toBe(0);
  });

  test("DeleteService", async () => {
    await client.send(new DeleteServiceCommand({ serviceIdentifier: serviceId }));
  });

  test("DeleteServiceNetwork", async () => {
    await client.send(new DeleteServiceNetworkCommand({ serviceNetworkIdentifier: serviceNetworkId }));
  });

  test("ListTargetGroups", async () => {
    const result = await client.send(new ListTargetGroupsCommand({}));
    expect(result.items).toBeDefined();
  });
});
