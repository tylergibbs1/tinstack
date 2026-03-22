import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface HsmCluster {
  clusterId: string;
  state: string;
  hsmType: string;
  subnetMapping: Record<string, string>;
  hsms: Hsm[];
  backupPolicy: string;
  securityGroup: string;
  createTimestamp: number;
  tags: Record<string, string>;
}

export interface Hsm {
  HsmId: string;
  ClusterId: string;
  AvailabilityZone: string;
  State: string;
  EniId: string;
  EniIp: string;
}

export class CloudHsmV2Service {
  private clusters: StorageBackend<string, HsmCluster>;
  private tags: StorageBackend<string, Record<string, string>>;
  private counter = 0;

  constructor(private accountId: string) {
    this.clusters = new InMemoryStorage();
    this.tags = new InMemoryStorage();
  }

  createCluster(hsmType: string, subnetIds: string[], region: string, tags?: Record<string, string>): HsmCluster {
    const id = `cluster-${crypto.randomUUID().slice(0, 11).replace(/-/g, "")}`;
    const cluster: HsmCluster = {
      clusterId: id, state: "UNINITIALIZED", hsmType: hsmType ?? "hsm1.medium",
      subnetMapping: Object.fromEntries((subnetIds ?? []).map((s, i) => [`${region}${String.fromCharCode(97 + i)}`, s])),
      hsms: [], backupPolicy: "DEFAULT", securityGroup: `sg-${crypto.randomUUID().slice(0, 8)}`,
      createTimestamp: Math.floor(Date.now() / 1000), tags: tags ?? {},
    };
    this.clusters.set(id, cluster);
    const arn = buildArn("cloudhsm", region, this.accountId, "cluster/", id);
    if (tags) this.tags.set(arn, tags);
    return cluster;
  }

  describeClusters(filters?: Record<string, string[]>): HsmCluster[] {
    let clusters = this.clusters.values();
    if (filters?.clusterIds) clusters = clusters.filter(c => filters.clusterIds!.includes(c.clusterId));
    if (filters?.states) clusters = clusters.filter(c => filters.states!.includes(c.state));
    return clusters;
  }

  deleteCluster(clusterId: string): HsmCluster {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) throw new AwsError("CloudHsmResourceNotFoundException", `Cluster ${clusterId} not found.`, 404);
    cluster.state = "DELETED";
    this.clusters.delete(clusterId);
    return cluster;
  }

  createHsm(clusterId: string, availabilityZone: string): Hsm {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) throw new AwsError("CloudHsmResourceNotFoundException", `Cluster ${clusterId} not found.`, 404);
    const hsm: Hsm = {
      HsmId: `hsm-${crypto.randomUUID().slice(0, 11).replace(/-/g, "")}`,
      ClusterId: clusterId, AvailabilityZone: availabilityZone ?? "us-east-1a",
      State: "ACTIVE", EniId: `eni-${crypto.randomUUID().slice(0, 8)}`,
      EniIp: "10.0.0." + (++this.counter),
    };
    cluster.hsms.push(hsm);
    this.clusters.set(clusterId, cluster);
    return hsm;
  }

  deleteHsm(clusterId: string, hsmId: string): string {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) throw new AwsError("CloudHsmResourceNotFoundException", `Cluster ${clusterId} not found.`, 404);
    const idx = cluster.hsms.findIndex(h => h.HsmId === hsmId);
    if (idx === -1) throw new AwsError("CloudHsmResourceNotFoundException", `HSM ${hsmId} not found.`, 404);
    cluster.hsms.splice(idx, 1);
    this.clusters.set(clusterId, cluster);
    return hsmId;
  }

  initializeCluster(clusterId: string, _signedCert: string, _trustAnchor: string): { state: string; stateMessage: string } {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) throw new AwsError("CloudHsmResourceNotFoundException", `Cluster ${clusterId} not found.`, 404);
    cluster.state = "INITIALIZED";
    this.clusters.set(clusterId, cluster);
    return { state: "INITIALIZED", stateMessage: "Cluster initialized successfully." };
  }

  tagResource(resourceId: string, tags: Record<string, string>): void {
    const existing = this.tags.get(resourceId) ?? {};
    this.tags.set(resourceId, { ...existing, ...tags });
  }

  untagResource(resourceId: string, tagKeys: string[]): void {
    const existing = this.tags.get(resourceId) ?? {};
    for (const k of tagKeys) delete existing[k];
    this.tags.set(resourceId, existing);
  }

  listTags(resourceId: string): Record<string, string> {
    return this.tags.get(resourceId) ?? {};
  }
}
