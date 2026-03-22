import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

interface ServiceNetwork { id: string; name: string; arn: string; status: string; authType: string; createdAt: number; tags: Record<string, string>; }
interface LatticeService { id: string; name: string; arn: string; status: string; dnsEntry?: { domainName: string }; authType: string; createdAt: number; tags: Record<string, string>; }
interface TargetGroup { id: string; name: string; arn: string; type: string; status: string; config?: any; targets: { id: string; port?: number }[]; createdAt: number; tags: Record<string, string>; }

export class VpcLatticeService {
  private serviceNetworks: StorageBackend<string, ServiceNetwork>;
  private services: StorageBackend<string, LatticeService>;
  private targetGroups: StorageBackend<string, TargetGroup>;

  constructor(private accountId: string) {
    this.serviceNetworks = new InMemoryStorage();
    this.services = new InMemoryStorage();
    this.targetGroups = new InMemoryStorage();
  }

  createServiceNetwork(name: string, authType: string | undefined, tags: Record<string, string> | undefined, region: string): ServiceNetwork {
    const id = "sn-" + crypto.randomUUID().slice(0, 17);
    const arn = buildArn("vpc-lattice", region, this.accountId, "servicenetwork/", id);
    const sn: ServiceNetwork = { id, name, arn, status: "ACTIVE", authType: authType ?? "NONE", createdAt: Date.now() / 1000, tags: tags ?? {} };
    this.serviceNetworks.set(id, sn);
    return sn;
  }

  getServiceNetwork(id: string): ServiceNetwork {
    const sn = this.serviceNetworks.get(id) ?? this.serviceNetworks.values().find((s) => s.name === id);
    if (!sn) throw new AwsError("ResourceNotFoundException", `Service network ${id} not found.`, 404);
    return sn;
  }

  listServiceNetworks(): ServiceNetwork[] { return this.serviceNetworks.values(); }

  deleteServiceNetwork(id: string): void {
    const sn = this.getServiceNetwork(id);
    this.serviceNetworks.delete(sn.id);
  }

  createService(name: string, authType: string | undefined, tags: Record<string, string> | undefined, region: string): LatticeService {
    const id = "svc-" + crypto.randomUUID().slice(0, 17);
    const arn = buildArn("vpc-lattice", region, this.accountId, "service/", id);
    const svc: LatticeService = { id, name, arn, status: "ACTIVE", dnsEntry: { domainName: `${id}.vpc-lattice.${region}.on.aws` }, authType: authType ?? "NONE", createdAt: Date.now() / 1000, tags: tags ?? {} };
    this.services.set(id, svc);
    return svc;
  }

  getService(id: string): LatticeService {
    const svc = this.services.get(id) ?? this.services.values().find((s) => s.name === id);
    if (!svc) throw new AwsError("ResourceNotFoundException", `Service ${id} not found.`, 404);
    return svc;
  }

  listServices(): LatticeService[] { return this.services.values(); }

  deleteService(id: string): void {
    const svc = this.getService(id);
    this.services.delete(svc.id);
  }

  createTargetGroup(name: string, type: string, config: any, tags: Record<string, string> | undefined, region: string): TargetGroup {
    const id = "tg-" + crypto.randomUUID().slice(0, 17);
    const arn = buildArn("vpc-lattice", region, this.accountId, "targetgroup/", id);
    const tg: TargetGroup = { id, name, arn, type: type ?? "INSTANCE", status: "ACTIVE", config, targets: [], createdAt: Date.now() / 1000, tags: tags ?? {} };
    this.targetGroups.set(id, tg);
    return tg;
  }

  getTargetGroup(id: string): TargetGroup {
    const tg = this.targetGroups.get(id) ?? this.targetGroups.values().find((t) => t.name === id);
    if (!tg) throw new AwsError("ResourceNotFoundException", `Target group ${id} not found.`, 404);
    return tg;
  }

  listTargetGroups(): TargetGroup[] { return this.targetGroups.values(); }

  registerTargets(targetGroupId: string, targets: { id: string; port?: number }[]): { successful: { id: string; port?: number }[]; unsuccessful: any[] } {
    const tg = this.getTargetGroup(targetGroupId);
    for (const t of targets) tg.targets.push(t);
    return { successful: targets, unsuccessful: [] };
  }

  deregisterTargets(targetGroupId: string, targets: { id: string }[]): { successful: { id: string }[]; unsuccessful: any[] } {
    const tg = this.getTargetGroup(targetGroupId);
    const ids = new Set(targets.map((t) => t.id));
    tg.targets = tg.targets.filter((t) => !ids.has(t.id));
    return { successful: targets, unsuccessful: [] };
  }

  listTargets(targetGroupId: string): { id: string; port?: number; status: string }[] {
    const tg = this.getTargetGroup(targetGroupId);
    return tg.targets.map((t) => ({ ...t, status: "HEALTHY" }));
  }

  tagResource(arn: string, tags: Record<string, string>): void {
    for (const store of [this.serviceNetworks, this.services, this.targetGroups]) {
      const item = (store as StorageBackend<string, any>).values().find((i: any) => i.arn === arn);
      if (item) { Object.assign(item.tags, tags); return; }
    }
    throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    for (const store of [this.serviceNetworks, this.services, this.targetGroups]) {
      const item = (store as StorageBackend<string, any>).values().find((i: any) => i.arn === arn);
      if (item) { for (const k of tagKeys) delete item.tags[k]; return; }
    }
    throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
  }
}
