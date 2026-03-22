import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface CacheCluster {
  cacheClusterId: string;
  cacheClusterArn: string;
  cacheNodeType: string;
  engine: string;
  engineVersion: string;
  cacheClusterStatus: string;
  numCacheNodes: number;
  preferredAvailabilityZone: string;
  cacheClusterCreateTime: string;
  preferredMaintenanceWindow: string;
  cacheSubnetGroupName?: string;
  cacheParameterGroupName?: string;
  port: number;
  configurationEndpoint?: { address: string; port: number };
}

export interface ReplicationGroup {
  replicationGroupId: string;
  replicationGroupArn: string;
  description: string;
  status: string;
  memberClusters: string[];
  nodeGroups: { nodeGroupId: string; status: string; slots: string; primaryEndpoint?: { address: string; port: number } }[];
  automaticFailover: string;
  clusterEnabled: boolean;
  cacheNodeType?: string;
}

export interface CacheSubnetGroup {
  cacheSubnetGroupName: string;
  cacheSubnetGroupDescription: string;
  vpcId: string;
  subnets: { subnetIdentifier: string; subnetAvailabilityZone: { name: string } }[];
  arn: string;
}

export interface CacheParameterGroup {
  cacheParameterGroupName: string;
  cacheParameterGroupFamily: string;
  description: string;
  arn: string;
  isGlobal: boolean;
}

export class ElastiCacheService {
  private cacheClusters: StorageBackend<string, CacheCluster>;
  private replicationGroups: StorageBackend<string, ReplicationGroup>;
  private subnetGroups: StorageBackend<string, CacheSubnetGroup>;
  private parameterGroups: StorageBackend<string, CacheParameterGroup>;

  constructor(private accountId: string) {
    this.cacheClusters = new InMemoryStorage();
    this.replicationGroups = new InMemoryStorage();
    this.subnetGroups = new InMemoryStorage();
    this.parameterGroups = new InMemoryStorage();
  }

  private clusterKey(region: string, id: string): string {
    return `${region}#${id}`;
  }

  private rgKey(region: string, id: string): string {
    return `${region}#rg#${id}`;
  }

  private sgKey(region: string, name: string): string {
    return `${region}#sg#${name}`;
  }

  private pgKey(region: string, name: string): string {
    return `${region}#pg#${name}`;
  }

  // --- Cache Clusters ---

  createCacheCluster(
    cacheClusterId: string,
    cacheNodeType: string | undefined,
    engine: string | undefined,
    engineVersion: string | undefined,
    numCacheNodes: number | undefined,
    preferredAvailabilityZone: string | undefined,
    cacheSubnetGroupName: string | undefined,
    cacheParameterGroupName: string | undefined,
    port: number | undefined,
    region: string,
  ): CacheCluster {
    const key = this.clusterKey(region, cacheClusterId);
    if (this.cacheClusters.has(key)) {
      throw new AwsError("CacheClusterAlreadyExists", `Cache cluster ${cacheClusterId} already exists.`, 400);
    }

    const arn = buildArn("elasticache", region, this.accountId, "cluster:", cacheClusterId);
    const resolvedEngine = engine ?? "redis";
    const resolvedPort = port ?? (resolvedEngine === "memcached" ? 11211 : 6379);

    const cluster: CacheCluster = {
      cacheClusterId,
      cacheClusterArn: arn,
      cacheNodeType: cacheNodeType ?? "cache.t3.micro",
      engine: resolvedEngine,
      engineVersion: engineVersion ?? (resolvedEngine === "memcached" ? "1.6.17" : "7.0"),
      cacheClusterStatus: "available",
      numCacheNodes: numCacheNodes ?? 1,
      preferredAvailabilityZone: preferredAvailabilityZone ?? `${region}a`,
      cacheClusterCreateTime: new Date().toISOString(),
      preferredMaintenanceWindow: "sun:05:00-sun:06:00",
      cacheSubnetGroupName,
      cacheParameterGroupName,
      port: resolvedPort,
    };

    if (resolvedEngine === "memcached") {
      cluster.configurationEndpoint = {
        address: `${cacheClusterId}.cfg.${region}.cache.amazonaws.com`,
        port: resolvedPort,
      };
    }

    this.cacheClusters.set(key, cluster);
    return cluster;
  }

  describeCacheClusters(cacheClusterId: string | undefined, region: string): CacheCluster[] {
    if (cacheClusterId) {
      const key = this.clusterKey(region, cacheClusterId);
      const cluster = this.cacheClusters.get(key);
      if (!cluster) {
        throw new AwsError("CacheClusterNotFound", `Cache cluster ${cacheClusterId} not found.`, 404);
      }
      return [cluster];
    }
    return this.cacheClusters.values().filter((c) => c.cacheClusterArn.includes(`:${region}:`));
  }

  deleteCacheCluster(cacheClusterId: string, region: string): CacheCluster {
    const key = this.clusterKey(region, cacheClusterId);
    const cluster = this.cacheClusters.get(key);
    if (!cluster) {
      throw new AwsError("CacheClusterNotFound", `Cache cluster ${cacheClusterId} not found.`, 404);
    }
    cluster.cacheClusterStatus = "deleting";
    this.cacheClusters.delete(key);
    return cluster;
  }

  modifyCacheCluster(
    cacheClusterId: string,
    numCacheNodes: number | undefined,
    cacheNodeType: string | undefined,
    engineVersion: string | undefined,
    region: string,
  ): CacheCluster {
    const key = this.clusterKey(region, cacheClusterId);
    const cluster = this.cacheClusters.get(key);
    if (!cluster) {
      throw new AwsError("CacheClusterNotFound", `Cache cluster ${cacheClusterId} not found.`, 404);
    }
    if (numCacheNodes !== undefined) cluster.numCacheNodes = numCacheNodes;
    if (cacheNodeType !== undefined) cluster.cacheNodeType = cacheNodeType;
    if (engineVersion !== undefined) cluster.engineVersion = engineVersion;
    return cluster;
  }

  // --- Replication Groups ---

  createReplicationGroup(
    replicationGroupId: string,
    description: string,
    cacheNodeType: string | undefined,
    numNodeGroups: number | undefined,
    automaticFailover: boolean | undefined,
    region: string,
  ): ReplicationGroup {
    const key = this.rgKey(region, replicationGroupId);
    if (this.replicationGroups.has(key)) {
      throw new AwsError("ReplicationGroupAlreadyExists", `Replication group ${replicationGroupId} already exists.`, 400);
    }

    const arn = buildArn("elasticache", region, this.accountId, "replicationgroup:", replicationGroupId);
    const nodeGroupCount = numNodeGroups ?? 1;
    const nodeGroups = Array.from({ length: nodeGroupCount }, (_, i) => ({
      nodeGroupId: String(i + 1).padStart(4, "0"),
      status: "available",
      slots: "0-16383",
      primaryEndpoint: {
        address: `${replicationGroupId}.${String(i + 1).padStart(4, "0")}.${region}.cache.amazonaws.com`,
        port: 6379,
      },
    }));

    const rg: ReplicationGroup = {
      replicationGroupId,
      replicationGroupArn: arn,
      description,
      status: "available",
      memberClusters: [`${replicationGroupId}-001`],
      nodeGroups,
      automaticFailover: automaticFailover ? "enabled" : "disabled",
      clusterEnabled: nodeGroupCount > 1,
      cacheNodeType: cacheNodeType ?? "cache.t3.micro",
    };

    this.replicationGroups.set(key, rg);
    return rg;
  }

  describeReplicationGroups(replicationGroupId: string | undefined, region: string): ReplicationGroup[] {
    if (replicationGroupId) {
      const key = this.rgKey(region, replicationGroupId);
      const rg = this.replicationGroups.get(key);
      if (!rg) {
        throw new AwsError("ReplicationGroupNotFoundFault", `Replication group ${replicationGroupId} not found.`, 404);
      }
      return [rg];
    }
    return this.replicationGroups.values().filter((rg) => rg.replicationGroupArn.includes(`:${region}:`));
  }

  deleteReplicationGroup(replicationGroupId: string, region: string): ReplicationGroup {
    const key = this.rgKey(region, replicationGroupId);
    const rg = this.replicationGroups.get(key);
    if (!rg) {
      throw new AwsError("ReplicationGroupNotFoundFault", `Replication group ${replicationGroupId} not found.`, 404);
    }
    rg.status = "deleting";
    this.replicationGroups.delete(key);
    return rg;
  }

  // --- Subnet Groups ---

  createCacheSubnetGroup(
    name: string,
    description: string,
    subnetIds: string[],
    region: string,
  ): CacheSubnetGroup {
    const key = this.sgKey(region, name);
    if (this.subnetGroups.has(key)) {
      throw new AwsError("CacheSubnetGroupAlreadyExists", `Cache subnet group ${name} already exists.`, 400);
    }

    const arn = buildArn("elasticache", region, this.accountId, "subnetgroup:", name);
    const sg: CacheSubnetGroup = {
      cacheSubnetGroupName: name,
      cacheSubnetGroupDescription: description,
      vpcId: `vpc-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
      subnets: subnetIds.map((id, i) => ({
        subnetIdentifier: id,
        subnetAvailabilityZone: { name: `${region}${String.fromCharCode(97 + (i % 3))}` },
      })),
      arn,
    };

    this.subnetGroups.set(key, sg);
    return sg;
  }

  describeCacheSubnetGroups(name: string | undefined, region: string): CacheSubnetGroup[] {
    if (name) {
      const key = this.sgKey(region, name);
      const sg = this.subnetGroups.get(key);
      if (!sg) {
        throw new AwsError("CacheSubnetGroupNotFoundFault", `Cache subnet group ${name} not found.`, 404);
      }
      return [sg];
    }
    return this.subnetGroups.values().filter((sg) => sg.arn.includes(`:${region}:`));
  }

  deleteCacheSubnetGroup(name: string, region: string): void {
    const key = this.sgKey(region, name);
    if (!this.subnetGroups.has(key)) {
      throw new AwsError("CacheSubnetGroupNotFoundFault", `Cache subnet group ${name} not found.`, 404);
    }
    this.subnetGroups.delete(key);
  }

  // --- Parameter Groups ---

  createCacheParameterGroup(
    name: string,
    family: string,
    description: string,
    region: string,
  ): CacheParameterGroup {
    const key = this.pgKey(region, name);
    if (this.parameterGroups.has(key)) {
      throw new AwsError("CacheParameterGroupAlreadyExists", `Cache parameter group ${name} already exists.`, 400);
    }

    const arn = buildArn("elasticache", region, this.accountId, "parametergroup:", name);
    const pg: CacheParameterGroup = {
      cacheParameterGroupName: name,
      cacheParameterGroupFamily: family,
      description,
      arn,
      isGlobal: false,
    };

    this.parameterGroups.set(key, pg);
    return pg;
  }

  describeCacheParameterGroups(name: string | undefined, region: string): CacheParameterGroup[] {
    if (name) {
      const key = this.pgKey(region, name);
      const pg = this.parameterGroups.get(key);
      if (!pg) {
        throw new AwsError("CacheParameterGroupNotFound", `Cache parameter group ${name} not found.`, 404);
      }
      return [pg];
    }
    return this.parameterGroups.values().filter((pg) => pg.arn.includes(`:${region}:`));
  }
}
