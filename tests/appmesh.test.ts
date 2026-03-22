import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  AppMeshClient,
  CreateMeshCommand,
  DescribeMeshCommand,
  ListMeshesCommand,
  DeleteMeshCommand,
  CreateVirtualServiceCommand,
  DescribeVirtualServiceCommand,
  ListVirtualServicesCommand,
  CreateVirtualNodeCommand,
  DescribeVirtualNodeCommand,
  ListVirtualNodesCommand,
} from "@aws-sdk/client-app-mesh";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new AppMeshClient({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("App Mesh", () => {
  const meshName = "test-mesh-" + Date.now();

  test("CreateMesh", async () => {
    const result = await client.send(new CreateMeshCommand({ meshName }));
    expect(result.mesh?.meshName).toBe(meshName);
    expect(result.mesh?.status?.status).toBe("ACTIVE");
  });

  test("DescribeMesh", async () => {
    const result = await client.send(new DescribeMeshCommand({ meshName }));
    expect(result.mesh?.meshName).toBe(meshName);
  });

  test("ListMeshes", async () => {
    const result = await client.send(new ListMeshesCommand({}));
    expect(result.meshes?.some((m) => m.meshName === meshName)).toBe(true);
  });

  test("CreateVirtualService", async () => {
    const result = await client.send(new CreateVirtualServiceCommand({
      meshName,
      virtualServiceName: "my-service.local",
      spec: { provider: { virtualNode: { virtualNodeName: "my-node" } } },
    }));
    expect(result.virtualService?.virtualServiceName).toBe("my-service.local");
  });

  test("DescribeVirtualService", async () => {
    const result = await client.send(new DescribeVirtualServiceCommand({
      meshName,
      virtualServiceName: "my-service.local",
    }));
    expect(result.virtualService?.virtualServiceName).toBe("my-service.local");
    expect(result.virtualService?.status?.status).toBe("ACTIVE");
  });

  test("ListVirtualServices", async () => {
    const result = await client.send(new ListVirtualServicesCommand({ meshName }));
    expect(result.virtualServices?.length).toBe(1);
  });

  test("CreateVirtualNode", async () => {
    const result = await client.send(new CreateVirtualNodeCommand({
      meshName,
      virtualNodeName: "my-node",
      spec: { listeners: [{ portMapping: { port: 8080, protocol: "http" } }] },
    }));
    expect(result.virtualNode?.virtualNodeName).toBe("my-node");
  });

  test("DescribeVirtualNode", async () => {
    const result = await client.send(new DescribeVirtualNodeCommand({
      meshName,
      virtualNodeName: "my-node",
    }));
    expect(result.virtualNode?.virtualNodeName).toBe("my-node");
    expect(result.virtualNode?.status?.status).toBe("ACTIVE");
  });

  test("ListVirtualNodes", async () => {
    const result = await client.send(new ListVirtualNodesCommand({ meshName }));
    expect(result.virtualNodes?.length).toBe(1);
  });

  test("DeleteMesh", async () => {
    const result = await client.send(new DeleteMeshCommand({ meshName }));
    expect(result.mesh?.status?.status).toBe("DELETED");
  });
});
