import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface RedshiftCluster {
  clusterIdentifier: string;
  nodeType: string;
  masterUsername: string;
  dbName: string;
  clusterStatus: string;
  endpoint: { address: string; port: number };
  arn: string;
  clusterSubnetGroupName?: string;
  vpcSecurityGroups: { vpcSecurityGroupId: string; status: string }[];
  numberOfNodes: number;
  clusterVersion: string;
  automatedSnapshotRetentionPeriod: number;
  encrypted: boolean;
  publiclyAccessible: boolean;
  enhancedVpcRouting: boolean;
  tags: { Key: string; Value: string }[];
  createdAt: string;
  isPaused: boolean;
}

export interface ClusterSubnetGroup {
  clusterSubnetGroupName: string;
  description: string;
  subnetIds: string[];
  vpcId: string;
  arn: string;
  status: string;
}

export interface ClusterParameterGroup {
  parameterGroupName: string;
  parameterGroupFamily: string;
  description: string;
  arn: string;
  tags: { Key: string; Value: string }[];
}

export interface ClusterSnapshot {
  snapshotIdentifier: string;
  clusterIdentifier: string;
  status: string;
  snapshotType: string;
  nodeType: string;
  numberOfNodes: number;
  masterUsername: string;
  dbName: string;
  arn: string;
  encrypted: boolean;
  createdAt: string;
  tags: { Key: string; Value: string }[];
}

export class RedshiftService {
  private clusters: StorageBackend<string, RedshiftCluster>;
  private subnetGroups: StorageBackend<string, ClusterSubnetGroup>;
  private parameterGroups: StorageBackend<string, ClusterParameterGroup>;
  private snapshots: StorageBackend<string, ClusterSnapshot>;
  private allTags: { resourceName: string; resourceType: string; Key: string; Value: string }[] = [];

  constructor(
    private accountId: string,
    private defaultRegion: string,
  ) {
    this.clusters = new InMemoryStorage();
    this.subnetGroups = new InMemoryStorage();
    this.parameterGroups = new InMemoryStorage();
    this.snapshots = new InMemoryStorage();
  }

  createCluster(
    identifier: string,
    nodeType: string,
    masterUsername: string,
    masterUserPassword: string,
    region: string,
    dbName?: string,
    numberOfNodes?: number,
    clusterSubnetGroupName?: string,
    encrypted?: boolean,
    publiclyAccessible?: boolean,
    tags?: { Key: string; Value: string }[],
  ): RedshiftCluster {
    if (this.clusters.get(identifier)) {
      throw new AwsError("ClusterAlreadyExistsFault", `Cluster ${identifier} already exists.`, 409);
    }
    const arn = buildArn("redshift", region, this.accountId, "cluster:", identifier);
    const cluster: RedshiftCluster = {
      clusterIdentifier: identifier,
      nodeType: nodeType ?? "dc2.large",
      masterUsername: masterUsername ?? "admin",
      dbName: dbName ?? "dev",
      clusterStatus: "available",
      endpoint: { address: `${identifier}.${crypto.randomUUID().substring(0, 8)}.${region}.redshift.amazonaws.com`, port: 5439 },
      arn,
      clusterSubnetGroupName,
      vpcSecurityGroups: [],
      numberOfNodes: numberOfNodes ?? 1,
      clusterVersion: "1.0",
      automatedSnapshotRetentionPeriod: 1,
      encrypted: encrypted ?? false,
      publiclyAccessible: publiclyAccessible ?? false,
      enhancedVpcRouting: false,
      tags: tags ?? [],
      createdAt: new Date().toISOString(),
      isPaused: false,
    };
    this.clusters.set(identifier, cluster);
    if (tags) this.storeTags(arn, "cluster", identifier, tags);
    return cluster;
  }

  describeClusters(identifier?: string): RedshiftCluster[] {
    if (identifier) {
      const cluster = this.clusters.get(identifier);
      if (!cluster) throw new AwsError("ClusterNotFoundFault", `Cluster ${identifier} not found.`, 404);
      return [cluster];
    }
    return this.clusters.values();
  }

  modifyCluster(identifier: string, updates: Partial<{ nodeType: string; numberOfNodes: number; encrypted: boolean }>): RedshiftCluster {
    const cluster = this.clusters.get(identifier);
    if (!cluster) throw new AwsError("ClusterNotFoundFault", `Cluster ${identifier} not found.`, 404);
    if (updates.nodeType) cluster.nodeType = updates.nodeType;
    if (updates.numberOfNodes !== undefined) cluster.numberOfNodes = updates.numberOfNodes;
    if (updates.encrypted !== undefined) cluster.encrypted = updates.encrypted;
    this.clusters.set(identifier, cluster);
    return cluster;
  }

  deleteCluster(identifier: string): RedshiftCluster {
    const cluster = this.clusters.get(identifier);
    if (!cluster) throw new AwsError("ClusterNotFoundFault", `Cluster ${identifier} not found.`, 404);
    cluster.clusterStatus = "deleting";
    this.clusters.delete(identifier);
    return cluster;
  }

  pauseCluster(identifier: string): RedshiftCluster {
    const cluster = this.clusters.get(identifier);
    if (!cluster) throw new AwsError("ClusterNotFoundFault", `Cluster ${identifier} not found.`, 404);
    cluster.clusterStatus = "paused";
    cluster.isPaused = true;
    this.clusters.set(identifier, cluster);
    return cluster;
  }

  resumeCluster(identifier: string): RedshiftCluster {
    const cluster = this.clusters.get(identifier);
    if (!cluster) throw new AwsError("ClusterNotFoundFault", `Cluster ${identifier} not found.`, 404);
    cluster.clusterStatus = "available";
    cluster.isPaused = false;
    this.clusters.set(identifier, cluster);
    return cluster;
  }

  createClusterSubnetGroup(name: string, description: string, subnetIds: string[], region: string): ClusterSubnetGroup {
    if (this.subnetGroups.get(name)) {
      throw new AwsError("ClusterSubnetGroupAlreadyExistsFault", `Subnet group ${name} already exists.`, 409);
    }
    const arn = buildArn("redshift", region, this.accountId, "subnetgroup:", name);
    const group: ClusterSubnetGroup = {
      clusterSubnetGroupName: name,
      description,
      subnetIds: subnetIds ?? [],
      vpcId: "vpc-00000000",
      arn,
      status: "Complete",
    };
    this.subnetGroups.set(name, group);
    return group;
  }

  describeClusterSubnetGroups(name?: string): ClusterSubnetGroup[] {
    if (name) {
      const group = this.subnetGroups.get(name);
      if (!group) throw new AwsError("ClusterSubnetGroupNotFoundFault", `Subnet group ${name} not found.`, 404);
      return [group];
    }
    return this.subnetGroups.values();
  }

  deleteClusterSubnetGroup(name: string): void {
    if (!this.subnetGroups.get(name)) {
      throw new AwsError("ClusterSubnetGroupNotFoundFault", `Subnet group ${name} not found.`, 404);
    }
    this.subnetGroups.delete(name);
  }

  createClusterParameterGroup(name: string, family: string, description: string, region: string, tags?: { Key: string; Value: string }[]): ClusterParameterGroup {
    if (this.parameterGroups.get(name)) {
      throw new AwsError("ClusterParameterGroupAlreadyExistsFault", `Parameter group ${name} already exists.`, 409);
    }
    const arn = buildArn("redshift", region, this.accountId, "parametergroup:", name);
    const pg: ClusterParameterGroup = {
      parameterGroupName: name,
      parameterGroupFamily: family ?? "redshift-1.0",
      description: description ?? "",
      arn,
      tags: tags ?? [],
    };
    this.parameterGroups.set(name, pg);
    return pg;
  }

  describeClusterParameterGroups(name?: string): ClusterParameterGroup[] {
    if (name) {
      const pg = this.parameterGroups.get(name);
      if (!pg) throw new AwsError("ClusterParameterGroupNotFoundFault", `Parameter group ${name} not found.`, 404);
      return [pg];
    }
    return this.parameterGroups.values();
  }

  createClusterSnapshot(identifier: string, clusterIdentifier: string, region: string, tags?: { Key: string; Value: string }[]): ClusterSnapshot {
    if (this.snapshots.get(identifier)) {
      throw new AwsError("ClusterSnapshotAlreadyExistsFault", `Snapshot ${identifier} already exists.`, 409);
    }
    const cluster = this.clusters.get(clusterIdentifier);
    if (!cluster) throw new AwsError("ClusterNotFoundFault", `Cluster ${clusterIdentifier} not found.`, 404);
    const arn = buildArn("redshift", region, this.accountId, "snapshot:", `${clusterIdentifier}/${identifier}`);
    const snap: ClusterSnapshot = {
      snapshotIdentifier: identifier,
      clusterIdentifier,
      status: "available",
      snapshotType: "manual",
      nodeType: cluster.nodeType,
      numberOfNodes: cluster.numberOfNodes,
      masterUsername: cluster.masterUsername,
      dbName: cluster.dbName,
      arn,
      encrypted: cluster.encrypted,
      createdAt: new Date().toISOString(),
      tags: tags ?? [],
    };
    this.snapshots.set(identifier, snap);
    return snap;
  }

  describeClusterSnapshots(identifier?: string, clusterIdentifier?: string): ClusterSnapshot[] {
    let snaps = this.snapshots.values();
    if (identifier) {
      snaps = snaps.filter((s) => s.snapshotIdentifier === identifier);
      if (snaps.length === 0) throw new AwsError("ClusterSnapshotNotFoundFault", `Snapshot ${identifier} not found.`, 404);
    }
    if (clusterIdentifier) {
      snaps = snaps.filter((s) => s.clusterIdentifier === clusterIdentifier);
    }
    return snaps;
  }

  deleteClusterSnapshot(identifier: string): ClusterSnapshot {
    const snap = this.snapshots.get(identifier);
    if (!snap) throw new AwsError("ClusterSnapshotNotFoundFault", `Snapshot ${identifier} not found.`, 404);
    this.snapshots.delete(identifier);
    return snap;
  }

  restoreFromClusterSnapshot(newIdentifier: string, snapshotIdentifier: string, region: string): RedshiftCluster {
    const snap = this.snapshots.get(snapshotIdentifier);
    if (!snap) throw new AwsError("ClusterSnapshotNotFoundFault", `Snapshot ${snapshotIdentifier} not found.`, 404);
    return this.createCluster(newIdentifier, snap.nodeType, snap.masterUsername, "password", region, snap.dbName, snap.numberOfNodes);
  }

  createTags(resourceName: string, tags: { Key: string; Value: string }[]): void {
    const resourceType = this.inferResourceType(resourceName);
    for (const t of tags) {
      this.allTags = this.allTags.filter((e) => !(e.resourceName === resourceName && e.Key === t.Key));
      this.allTags.push({ resourceName, resourceType, Key: t.Key, Value: t.Value });
    }
  }

  describeTags(resourceName?: string, resourceType?: string): { resourceName: string; resourceType: string; Key: string; Value: string }[] {
    let tags = this.allTags;
    if (resourceName) tags = tags.filter((t) => t.resourceName === resourceName);
    if (resourceType) tags = tags.filter((t) => t.resourceType === resourceType);
    return tags;
  }

  deleteTags(resourceName: string, tagKeys: string[]): void {
    this.allTags = this.allTags.filter((t) => !(t.resourceName === resourceName && tagKeys.includes(t.Key)));
  }

  private storeTags(arn: string, resourceType: string, resourceId: string, tags: { Key: string; Value: string }[]): void {
    for (const t of tags) {
      this.allTags.push({ resourceName: arn, resourceType, Key: t.Key, Value: t.Value });
    }
  }

  private inferResourceType(arn: string): string {
    if (arn.includes(":cluster:")) return "cluster";
    if (arn.includes(":subnetgroup:")) return "subnetgroup";
    if (arn.includes(":parametergroup:")) return "parametergroup";
    if (arn.includes(":snapshot:")) return "snapshot";
    return "unknown";
  }
}
