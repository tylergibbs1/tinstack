import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ServiceDiscoveryClient,
  CreatePrivateDnsNamespaceCommand,
  CreatePublicDnsNamespaceCommand,
  GetNamespaceCommand,
  ListNamespacesCommand,
  DeleteNamespaceCommand,
  CreateServiceCommand,
  GetServiceCommand,
  ListServicesCommand,
  DeleteServiceCommand,
  RegisterInstanceCommand,
  DeregisterInstanceCommand,
  ListInstancesCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-servicediscovery";
import { startServer, stopServer, clientConfig } from "./helpers";

const sd = new ServiceDiscoveryClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Cloud Map / Service Discovery", () => {
  let namespaceId: string;
  let serviceId: string;

  // --- Namespaces ---

  test("CreatePrivateDnsNamespace", async () => {
    const res = await sd.send(
      new CreatePrivateDnsNamespaceCommand({
        Name: "test.local",
        Vpc: "vpc-12345",
        Description: "Test private namespace",
      }),
    );
    expect(res.OperationId).toBeDefined();
  });

  test("CreatePublicDnsNamespace", async () => {
    const res = await sd.send(
      new CreatePublicDnsNamespaceCommand({
        Name: "test.example.com",
        Description: "Test public namespace",
      }),
    );
    expect(res.OperationId).toBeDefined();
  });

  test("ListNamespaces", async () => {
    const res = await sd.send(new ListNamespacesCommand({}));
    expect(res.Namespaces!.length).toBeGreaterThanOrEqual(2);
    const ns = res.Namespaces!.find((n) => n.Name === "test.local");
    expect(ns).toBeDefined();
    namespaceId = ns!.Id!;
  });

  test("GetNamespace", async () => {
    const res = await sd.send(
      new GetNamespaceCommand({ Id: namespaceId }),
    );
    expect(res.Namespace?.Name).toBe("test.local");
    expect(res.Namespace?.Type).toBe("DNS_PRIVATE");
    expect(res.Namespace?.Description).toBe("Test private namespace");
  });

  // --- Services ---

  test("CreateService", async () => {
    const res = await sd.send(
      new CreateServiceCommand({
        Name: "my-service",
        NamespaceId: namespaceId,
        Description: "Test service",
        DnsConfig: {
          DnsRecords: [{ Type: "A", TTL: 60 }],
        },
      }),
    );
    expect(res.Service?.Name).toBe("my-service");
    expect(res.Service?.Id).toBeDefined();
    serviceId = res.Service!.Id!;
  });

  test("GetService", async () => {
    const res = await sd.send(
      new GetServiceCommand({ Id: serviceId }),
    );
    expect(res.Service?.Name).toBe("my-service");
    expect(res.Service?.NamespaceId).toBe(namespaceId);
  });

  test("ListServices", async () => {
    const res = await sd.send(new ListServicesCommand({}));
    expect(res.Services!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Instances ---

  test("RegisterInstance", async () => {
    const res = await sd.send(
      new RegisterInstanceCommand({
        ServiceId: serviceId,
        InstanceId: "instance-1",
        Attributes: {
          AWS_INSTANCE_IPV4: "10.0.0.1",
          AWS_INSTANCE_PORT: "8080",
        },
      }),
    );
    expect(res.OperationId).toBeDefined();
  });

  test("ListInstances", async () => {
    const res = await sd.send(
      new ListInstancesCommand({ ServiceId: serviceId }),
    );
    expect(res.Instances!.length).toBe(1);
    expect(res.Instances![0].Id).toBe("instance-1");
  });

  // Note: DiscoverInstances uses a separate data plane endpoint which the SDK
  // routes differently, so it cannot be tested with a single local endpoint.
  // The operation is implemented in the handler and works when called directly.

  test("DeregisterInstance", async () => {
    const res = await sd.send(
      new DeregisterInstanceCommand({
        ServiceId: serviceId,
        InstanceId: "instance-1",
      }),
    );
    expect(res.OperationId).toBeDefined();
    const list = await sd.send(
      new ListInstancesCommand({ ServiceId: serviceId }),
    );
    expect(list.Instances!.length).toBe(0);
  });

  // --- Tags ---

  test("TagResource", async () => {
    const ns = await sd.send(new GetNamespaceCommand({ Id: namespaceId }));
    await sd.send(
      new TagResourceCommand({
        ResourceARN: ns.Namespace!.Arn!,
        Tags: [{ Key: "env", Value: "test" }],
      }),
    );
  });

  test("UntagResource", async () => {
    const ns = await sd.send(new GetNamespaceCommand({ Id: namespaceId }));
    await sd.send(
      new UntagResourceCommand({
        ResourceARN: ns.Namespace!.Arn!,
        TagKeys: ["env"],
      }),
    );
  });

  // --- Cleanup ---

  test("DeleteService", async () => {
    await sd.send(new DeleteServiceCommand({ Id: serviceId }));
    const res = await sd.send(new ListServicesCommand({}));
    expect(res.Services!.some((s) => s.Id === serviceId)).toBe(false);
  });

  test("DeleteNamespace", async () => {
    const res = await sd.send(
      new DeleteNamespaceCommand({ Id: namespaceId }),
    );
    expect(res.OperationId).toBeDefined();
  });
});
