import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  MediaStoreClient,
  CreateContainerCommand,
  DescribeContainerCommand,
  ListContainersCommand,
  DeleteContainerCommand,
  PutContainerPolicyCommand,
  GetContainerPolicyCommand,
  PutLifecyclePolicyCommand,
  GetLifecyclePolicyCommand,
} from "@aws-sdk/client-mediastore";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new MediaStoreClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("MediaStore", () => {
  const containerName = "test-container";

  test("CreateContainer", async () => {
    const res = await client.send(new CreateContainerCommand({
      ContainerName: containerName,
    }));
    expect(res.Container).toBeDefined();
    expect(res.Container!.Name).toBe(containerName);
    expect(res.Container!.Status).toBe("ACTIVE");
    expect(res.Container!.Endpoint).toBeDefined();
  });

  test("DescribeContainer", async () => {
    const res = await client.send(new DescribeContainerCommand({
      ContainerName: containerName,
    }));
    expect(res.Container).toBeDefined();
    expect(res.Container!.Name).toBe(containerName);
  });

  test("ListContainers", async () => {
    const res = await client.send(new ListContainersCommand({}));
    expect(res.Containers).toBeDefined();
    expect(res.Containers!.length).toBeGreaterThanOrEqual(1);
  });

  test("PutContainerPolicy", async () => {
    await client.send(new PutContainerPolicyCommand({
      ContainerName: containerName,
      Policy: JSON.stringify({ Version: "2012-10-17", Statement: [] }),
    }));
  });

  test("GetContainerPolicy", async () => {
    const res = await client.send(new GetContainerPolicyCommand({
      ContainerName: containerName,
    }));
    expect(res.Policy).toBeDefined();
    const parsed = JSON.parse(res.Policy!);
    expect(parsed.Version).toBe("2012-10-17");
  });

  test("PutLifecyclePolicy", async () => {
    const policy = JSON.stringify({ rules: [{ definition: { path: [{ wildcard: "*" }], seconds_since_create: [{ numeric: [">", 86400] }] }, action: "EXPIRE" }] });
    await client.send(new PutLifecyclePolicyCommand({
      ContainerName: containerName,
      LifecyclePolicy: policy,
    }));
  });

  test("GetLifecyclePolicy", async () => {
    const res = await client.send(new GetLifecyclePolicyCommand({
      ContainerName: containerName,
    }));
    expect(res.LifecyclePolicy).toBeDefined();
  });

  test("DeleteContainer", async () => {
    await client.send(new DeleteContainerCommand({ ContainerName: containerName }));
    const res = await client.send(new ListContainersCommand({}));
    expect(res.Containers!.find((c) => c.Name === containerName)).toBeUndefined();
  });

  test("DescribeContainer - not found", async () => {
    await expect(
      client.send(new DescribeContainerCommand({ ContainerName: "nonexistent" })),
    ).rejects.toThrow();
  });
});
