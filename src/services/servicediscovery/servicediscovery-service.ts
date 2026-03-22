import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface Namespace {
  id: string;
  arn: string;
  name: string;
  type: string;
  description?: string;
  creatorRequestId?: string;
  properties: {
    dnsProperties?: Record<string, any>;
    httpProperties?: Record<string, any>;
  };
  createDate: number;
}

export interface DiscoveryService {
  id: string;
  arn: string;
  name: string;
  namespaceId: string;
  description?: string;
  creatorRequestId?: string;
  dnsConfig?: Record<string, any>;
  healthCheckConfig?: Record<string, any>;
  healthCheckCustomConfig?: Record<string, any>;
  type?: string;
  createDate: number;
}

export interface ServiceInstance {
  instanceId: string;
  serviceId: string;
  attributes: Record<string, string>;
  creatorRequestId?: string;
}

export class ServiceDiscoveryService {
  private namespaces: StorageBackend<string, Namespace>;
  private services: StorageBackend<string, DiscoveryService>;
  private instances = new Map<string, ServiceInstance[]>();
  private tags = new Map<string, Record<string, string>>();

  constructor(
    private accountId: string,
    private region: string,
  ) {
    this.namespaces = new InMemoryStorage();
    this.services = new InMemoryStorage();
  }

  // --- Namespaces ---

  createPrivateDnsNamespace(params: {
    name: string;
    vpc: string;
    description?: string;
    creatorRequestId?: string;
    tags?: Record<string, string>;
  }): { operationId: string; namespace: Namespace } {
    const id = `ns-${crypto.randomUUID().replace(/-/g, "").substring(0, 20)}`;
    const ns: Namespace = {
      id,
      arn: `arn:aws:servicediscovery:${this.region}:${this.accountId}:namespace/${id}`,
      name: params.name,
      type: "DNS_PRIVATE",
      description: params.description,
      creatorRequestId: params.creatorRequestId,
      properties: {
        dnsProperties: { hostedZoneId: `Z${crypto.randomUUID().replace(/-/g, "").substring(0, 12).toUpperCase()}` },
        httpProperties: {},
      },
      createDate: Date.now() / 1000,
    };
    this.namespaces.set(id, ns);
    if (params.tags) this.tags.set(ns.arn, { ...params.tags });
    return { operationId: crypto.randomUUID(), namespace: ns };
  }

  createPublicDnsNamespace(params: {
    name: string;
    description?: string;
    creatorRequestId?: string;
    tags?: Record<string, string>;
  }): { operationId: string; namespace: Namespace } {
    const id = `ns-${crypto.randomUUID().replace(/-/g, "").substring(0, 20)}`;
    const ns: Namespace = {
      id,
      arn: `arn:aws:servicediscovery:${this.region}:${this.accountId}:namespace/${id}`,
      name: params.name,
      type: "DNS_PUBLIC",
      description: params.description,
      creatorRequestId: params.creatorRequestId,
      properties: {
        dnsProperties: { hostedZoneId: `Z${crypto.randomUUID().replace(/-/g, "").substring(0, 12).toUpperCase()}` },
        httpProperties: {},
      },
      createDate: Date.now() / 1000,
    };
    this.namespaces.set(id, ns);
    if (params.tags) this.tags.set(ns.arn, { ...params.tags });
    return { operationId: crypto.randomUUID(), namespace: ns };
  }

  getNamespace(id: string): Namespace {
    const ns = this.namespaces.get(id);
    if (!ns) throw new AwsError("NamespaceNotFound", `Namespace ${id} not found.`, 404);
    return ns;
  }

  listNamespaces(): Namespace[] {
    return this.namespaces.values();
  }

  deleteNamespace(id: string): string {
    if (!this.namespaces.has(id)) {
      throw new AwsError("NamespaceNotFound", `Namespace ${id} not found.`, 404);
    }
    this.namespaces.delete(id);
    return crypto.randomUUID();
  }

  // --- Services ---

  createService(params: {
    name: string;
    namespaceId?: string;
    description?: string;
    creatorRequestId?: string;
    dnsConfig?: Record<string, any>;
    healthCheckConfig?: Record<string, any>;
    healthCheckCustomConfig?: Record<string, any>;
    type?: string;
    tags?: Record<string, string>;
  }): DiscoveryService {
    const id = `srv-${crypto.randomUUID().replace(/-/g, "").substring(0, 8)}`;
    const svc: DiscoveryService = {
      id,
      arn: `arn:aws:servicediscovery:${this.region}:${this.accountId}:service/${id}`,
      name: params.name,
      namespaceId: params.namespaceId ?? "",
      description: params.description,
      creatorRequestId: params.creatorRequestId,
      dnsConfig: params.dnsConfig,
      healthCheckConfig: params.healthCheckConfig,
      healthCheckCustomConfig: params.healthCheckCustomConfig,
      type: params.type,
      createDate: Date.now() / 1000,
    };
    this.services.set(id, svc);
    this.instances.set(id, []);
    if (params.tags) this.tags.set(svc.arn, { ...params.tags });
    return svc;
  }

  getService(id: string): DiscoveryService {
    const svc = this.services.get(id);
    if (!svc) throw new AwsError("ServiceNotFound", `Service ${id} not found.`, 404);
    return svc;
  }

  listServices(): DiscoveryService[] {
    return this.services.values();
  }

  deleteService(id: string): void {
    if (!this.services.has(id)) {
      throw new AwsError("ServiceNotFound", `Service ${id} not found.`, 404);
    }
    this.services.delete(id);
    this.instances.delete(id);
  }

  // --- Instances ---

  registerInstance(params: {
    serviceId: string;
    instanceId: string;
    creatorRequestId?: string;
    attributes?: Record<string, string>;
  }): string {
    this.getService(params.serviceId); // validate
    const inst: ServiceInstance = {
      instanceId: params.instanceId,
      serviceId: params.serviceId,
      attributes: params.attributes ?? {},
      creatorRequestId: params.creatorRequestId,
    };
    const instances = this.instances.get(params.serviceId) ?? [];
    // Replace if exists
    const idx = instances.findIndex((i) => i.instanceId === params.instanceId);
    if (idx >= 0) {
      instances[idx] = inst;
    } else {
      instances.push(inst);
    }
    this.instances.set(params.serviceId, instances);
    return crypto.randomUUID();
  }

  deregisterInstance(serviceId: string, instanceId: string): string {
    this.getService(serviceId);
    const instances = this.instances.get(serviceId) ?? [];
    const idx = instances.findIndex((i) => i.instanceId === instanceId);
    if (idx < 0) throw new AwsError("InstanceNotFound", `Instance ${instanceId} not found.`, 404);
    instances.splice(idx, 1);
    return crypto.randomUUID();
  }

  listInstances(serviceId: string): ServiceInstance[] {
    this.getService(serviceId);
    return this.instances.get(serviceId) ?? [];
  }

  discoverInstances(namespaceName: string, serviceName: string): ServiceInstance[] {
    const ns = this.namespaces.values().find((n) => n.name === namespaceName);
    if (!ns) throw new AwsError("NamespaceNotFound", `Namespace ${namespaceName} not found.`, 404);
    const svc = this.services.values().find((s) => s.name === serviceName && s.namespaceId === ns.id);
    if (!svc) throw new AwsError("ServiceNotFound", `Service ${serviceName} not found.`, 404);
    return this.instances.get(svc.id) ?? [];
  }

  // --- Tags ---

  tagResource(arn: string, tags: Record<string, string>): void {
    const existing = this.tags.get(arn) ?? {};
    this.tags.set(arn, { ...existing, ...tags });
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.tags.get(arn);
    if (existing) {
      for (const key of tagKeys) delete existing[key];
    }
  }

  listTagsForResource(arn: string): Record<string, string> {
    return this.tags.get(arn) ?? {};
  }
}
