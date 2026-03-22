import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface DaxNode {
  nodeId: string;
  endpoint: { Address: string; Port: number };
  nodeCreateTime: number;
  availabilityZone: string;
  nodeStatus: string;
}

export interface DaxCluster {
  clusterName: string;
  clusterArn: string;
  description: string;
  nodeType: string;
  status: string;
  totalNodes: number;
  activeNodes: number;
  nodes: DaxNode[];
  clusterDiscoveryEndpoint: { Address: string; Port: number; URL: string };
  iamRoleArn: string;
  parameterGroup: { ParameterGroupName: string; ParameterApplyStatus: string; NodeIdsToReboot: string[] };
  subnetGroup: string;
  sseDescription: { Status: string };
  clusterEndpointEncryptionType: string;
  tags: { Key: string; Value: string }[];
}

export interface DaxSubnetGroup {
  subnetGroupName: string;
  description: string;
  subnets: { SubnetIdentifier: string; SubnetAvailabilityZone: { Name: string } }[];
}

export interface DaxParameterGroup {
  parameterGroupName: string;
  description: string;
}

export class DaxService {
  private clusters: StorageBackend<string, DaxCluster>;
  private subnetGroups: StorageBackend<string, DaxSubnetGroup>;
  private parameterGroups: StorageBackend<string, DaxParameterGroup>;

  constructor(private accountId: string) {
    this.clusters = new InMemoryStorage();
    this.subnetGroups = new InMemoryStorage();
    this.parameterGroups = new InMemoryStorage();
  }

  createCluster(
    clusterName: string,
    nodeType: string,
    replicationFactor: number,
    description: string | undefined,
    iamRoleArn: string | undefined,
    subnetGroupName: string | undefined,
    sseSpecification: { Enabled: boolean } | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): DaxCluster {
    if (this.clusters.has(clusterName)) {
      throw new AwsError("ClusterAlreadyExistsFault", `Cluster ${clusterName} already exists.`, 400);
    }

    const clusterHex = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
    const arn = buildArn("dax", region, this.accountId, "cache/", clusterName);
    const now = Date.now() / 1000;

    const nodes: DaxNode[] = [];
    for (let i = 0; i < replicationFactor; i++) {
      const nodeId = `${clusterName}-${String.fromCharCode(97 + i)}`;
      nodes.push({
        nodeId,
        endpoint: {
          Address: `${nodeId}.${clusterHex}.nodes.dax-clusters.${region}.amazonaws.com`,
          Port: 8111,
        },
        nodeCreateTime: now,
        availabilityZone: `${region}a`,
        nodeStatus: "available",
      });
    }

    const cluster: DaxCluster = {
      clusterName,
      clusterArn: arn,
      description: description ?? "",
      nodeType,
      status: "available",
      totalNodes: replicationFactor,
      activeNodes: replicationFactor,
      nodes,
      clusterDiscoveryEndpoint: {
        Address: `${clusterName}.${clusterHex}.dax-clusters.${region}.amazonaws.com`,
        Port: 8111,
        URL: `dax://${clusterName}.${clusterHex}.dax-clusters.${region}.amazonaws.com`,
      },
      iamRoleArn: iamRoleArn ?? `arn:aws:iam::${this.accountId}:role/DAXRole`,
      parameterGroup: { ParameterGroupName: "default.dax1.0", ParameterApplyStatus: "in-sync", NodeIdsToReboot: [] },
      subnetGroup: subnetGroupName ?? "default",
      sseDescription: { Status: sseSpecification?.Enabled ? "ENABLED" : "DISABLED" },
      clusterEndpointEncryptionType: "NONE",
      tags: tags ?? [],
    };
    this.clusters.set(clusterName, cluster);
    return cluster;
  }

  describeClusters(clusterNames?: string[]): DaxCluster[] {
    if (clusterNames && clusterNames.length > 0) {
      return clusterNames.map((name) => {
        const cluster = this.clusters.get(name);
        if (!cluster) throw new AwsError("ClusterNotFoundFault", `Cluster ${name} not found.`, 400);
        return cluster;
      });
    }
    return this.clusters.values();
  }

  deleteCluster(clusterName: string): DaxCluster {
    const cluster = this.clusters.get(clusterName);
    if (!cluster) throw new AwsError("ClusterNotFoundFault", `Cluster ${clusterName} not found.`, 400);
    this.clusters.delete(clusterName);
    cluster.status = "deleting";
    return cluster;
  }

  increaseReplicationFactor(clusterName: string, newReplicationFactor: number, region: string): DaxCluster {
    const cluster = this.clusters.get(clusterName);
    if (!cluster) throw new AwsError("ClusterNotFoundFault", `Cluster ${clusterName} not found.`, 400);
    if (newReplicationFactor <= cluster.totalNodes) {
      throw new AwsError("InvalidParameterValueException", `New replication factor must be greater than current: ${cluster.totalNodes}.`, 400);
    }

    const now = Date.now() / 1000;
    for (let i = cluster.totalNodes; i < newReplicationFactor; i++) {
      const nodeId = `${clusterName}-${String.fromCharCode(97 + i)}`;
      cluster.nodes.push({
        nodeId,
        endpoint: { Address: `${nodeId}.dax-clusters.${region}.amazonaws.com`, Port: 8111 },
        nodeCreateTime: now,
        availabilityZone: `${region}a`,
        nodeStatus: "available",
      });
    }
    cluster.totalNodes = newReplicationFactor;
    cluster.activeNodes = newReplicationFactor;
    return cluster;
  }

  decreaseReplicationFactor(clusterName: string, newReplicationFactor: number): DaxCluster {
    const cluster = this.clusters.get(clusterName);
    if (!cluster) throw new AwsError("ClusterNotFoundFault", `Cluster ${clusterName} not found.`, 400);
    if (newReplicationFactor >= cluster.totalNodes) {
      throw new AwsError("InvalidParameterValueException", `New replication factor must be less than current: ${cluster.totalNodes}.`, 400);
    }
    if (newReplicationFactor < 1) {
      throw new AwsError("InvalidParameterValueException", `Replication factor cannot be less than 1.`, 400);
    }

    cluster.nodes = cluster.nodes.slice(0, newReplicationFactor);
    cluster.totalNodes = newReplicationFactor;
    cluster.activeNodes = newReplicationFactor;
    return cluster;
  }

  createSubnetGroup(
    subnetGroupName: string,
    description: string | undefined,
    subnetIds: string[],
  ): DaxSubnetGroup {
    if (this.subnetGroups.has(subnetGroupName)) {
      throw new AwsError("SubnetGroupAlreadyExistsFault", `Subnet group ${subnetGroupName} already exists.`, 400);
    }
    const sg: DaxSubnetGroup = {
      subnetGroupName,
      description: description ?? "",
      subnets: subnetIds.map((id) => ({ SubnetIdentifier: id, SubnetAvailabilityZone: { Name: "us-east-1a" } })),
    };
    this.subnetGroups.set(subnetGroupName, sg);
    return sg;
  }

  describeSubnetGroups(names?: string[]): DaxSubnetGroup[] {
    if (names && names.length > 0) {
      return names.map((n) => {
        const sg = this.subnetGroups.get(n);
        if (!sg) throw new AwsError("SubnetGroupNotFoundFault", `Subnet group ${n} not found.`, 400);
        return sg;
      });
    }
    return this.subnetGroups.values();
  }

  deleteSubnetGroup(name: string): void {
    if (!this.subnetGroups.has(name)) throw new AwsError("SubnetGroupNotFoundFault", `Subnet group ${name} not found.`, 400);
    this.subnetGroups.delete(name);
  }

  createParameterGroup(name: string, description: string | undefined): DaxParameterGroup {
    if (this.parameterGroups.has(name)) {
      throw new AwsError("ParameterGroupAlreadyExistsFault", `Parameter group ${name} already exists.`, 400);
    }
    const pg: DaxParameterGroup = { parameterGroupName: name, description: description ?? "" };
    this.parameterGroups.set(name, pg);
    return pg;
  }

  describeParameterGroups(names?: string[]): DaxParameterGroup[] {
    if (names && names.length > 0) {
      return names.map((n) => {
        const pg = this.parameterGroups.get(n);
        if (!pg) throw new AwsError("ParameterGroupNotFoundFault", `Parameter group ${n} not found.`, 400);
        return pg;
      });
    }
    return this.parameterGroups.values();
  }

  deleteParameterGroup(name: string): void {
    if (!this.parameterGroups.has(name)) throw new AwsError("ParameterGroupNotFoundFault", `Parameter group ${name} not found.`, 400);
    this.parameterGroups.delete(name);
  }

  tagResource(arn: string, tags: { Key: string; Value: string }[]): { Key: string; Value: string }[] {
    const cluster = this.findClusterByArn(arn);
    if (!cluster) throw new AwsError("ClusterNotFoundFault", `Resource ${arn} not found.`, 400);
    for (const tag of tags) {
      const existing = cluster.tags.find((t) => t.Key === tag.Key);
      if (existing) existing.Value = tag.Value;
      else cluster.tags.push(tag);
    }
    return cluster.tags;
  }

  untagResource(arn: string, tagKeys: string[]): { Key: string; Value: string }[] {
    const cluster = this.findClusterByArn(arn);
    if (!cluster) throw new AwsError("ClusterNotFoundFault", `Resource ${arn} not found.`, 400);
    cluster.tags = cluster.tags.filter((t) => !tagKeys.includes(t.Key));
    return cluster.tags;
  }

  listTags(arn: string): { Key: string; Value: string }[] {
    const cluster = this.findClusterByArn(arn);
    if (!cluster) throw new AwsError("ClusterNotFoundFault", `Resource ${arn} not found.`, 400);
    return cluster.tags;
  }

  private findClusterByArn(arn: string): DaxCluster | undefined {
    return this.clusters.values().find((c) => c.clusterArn === arn);
  }
}
