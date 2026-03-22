import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface DbInstance {
  dbInstanceIdentifier: string;
  dbInstanceClass: string;
  engine: string;
  engineVersion: string;
  masterUsername: string;
  allocatedStorage: number;
  dbInstanceStatus: string;
  endpoint: { address: string; port: number };
  arn: string;
  dbSubnetGroupName?: string;
  vpcSecurityGroupIds: string[];
  availabilityZone: string;
  multiAZ: boolean;
  storageType: string;
  createdAt: string;
  readReplicaSourceDBInstanceIdentifier?: string;
}

export interface DbCluster {
  dbClusterIdentifier: string;
  engine: string;
  engineVersion: string;
  masterUsername: string;
  status: string;
  endpoint: string;
  readerEndpoint: string;
  arn: string;
  vpcSecurityGroupIds: string[];
  availabilityZones: string[];
  port: number;
  createdAt: string;
  deletionProtection?: boolean;
}

export interface DbSubnetGroup {
  dbSubnetGroupName: string;
  dbSubnetGroupDescription: string;
  subnetIds: string[];
  vpcId: string;
  arn: string;
  status: string;
}

export interface DbSnapshot {
  dbSnapshotIdentifier: string;
  dbInstanceIdentifier: string;
  engine: string;
  engineVersion: string;
  allocatedStorage: number;
  status: string;
  arn: string;
  snapshotType: string;
  createdAt: string;
}

export interface DbClusterSnapshot {
  dbClusterSnapshotIdentifier: string;
  dbClusterIdentifier: string;
  engine: string;
  engineVersion: string;
  status: string;
  arn: string;
  snapshotType: string;
  createdAt: string;
}

export class RdsService {
  private instances: StorageBackend<string, DbInstance>;
  private clusters: StorageBackend<string, DbCluster>;
  private subnetGroups: StorageBackend<string, DbSubnetGroup>;
  private snapshots: StorageBackend<string, DbSnapshot>;
  private clusterSnapshots: StorageBackend<string, DbClusterSnapshot>;

  constructor(
    private accountId: string,
    private defaultRegion: string,
  ) {
    this.instances = new InMemoryStorage();
    this.clusters = new InMemoryStorage();
    this.subnetGroups = new InMemoryStorage();
    this.snapshots = new InMemoryStorage();
    this.clusterSnapshots = new InMemoryStorage();
  }

  createDbInstance(
    identifier: string,
    dbInstanceClass: string,
    engine: string,
    masterUsername: string,
    allocatedStorage: number,
    region: string,
    vpcSecurityGroupIds: string[] = [],
    dbSubnetGroupName?: string,
    engineVersion?: string,
  ): DbInstance {
    if (this.instances.has(identifier)) {
      throw new AwsError("DBInstanceAlreadyExists", `DB instance ${identifier} already exists.`, 400);
    }
    const instance: DbInstance = {
      dbInstanceIdentifier: identifier,
      dbInstanceClass,
      engine,
      engineVersion: engineVersion ?? this.defaultEngineVersion(engine),
      masterUsername,
      allocatedStorage,
      dbInstanceStatus: "available",
      endpoint: {
        address: `${identifier}.abcdefghijkl.${region}.rds.amazonaws.com`,
        port: engine.includes("postgres") || engine.includes("aurora-postgresql") ? 5432 : 3306,
      },
      arn: buildArn("rds", region, this.accountId, "db:", identifier),
      dbSubnetGroupName,
      vpcSecurityGroupIds,
      availabilityZone: `${region}a`,
      multiAZ: false,
      storageType: "gp2",
      createdAt: new Date().toISOString(),
    };
    this.instances.set(identifier, instance);
    return instance;
  }

  describeDbInstances(identifier?: string): DbInstance[] {
    if (identifier) {
      const inst = this.instances.get(identifier);
      if (!inst) throw new AwsError("DBInstanceNotFound", `DB instance ${identifier} not found.`, 404);
      return [inst];
    }
    return this.instances.values();
  }

  modifyDbInstance(
    identifier: string,
    updates: { dbInstanceClass?: string; allocatedStorage?: number; engineVersion?: string },
  ): DbInstance {
    const inst = this.instances.get(identifier);
    if (!inst) throw new AwsError("DBInstanceNotFound", `DB instance ${identifier} not found.`, 404);
    if (updates.dbInstanceClass) inst.dbInstanceClass = updates.dbInstanceClass;
    if (updates.allocatedStorage) inst.allocatedStorage = updates.allocatedStorage;
    if (updates.engineVersion) inst.engineVersion = updates.engineVersion;
    this.instances.set(identifier, inst);
    return inst;
  }

  deleteDbInstance(identifier: string): DbInstance {
    const inst = this.instances.get(identifier);
    if (!inst) throw new AwsError("DBInstanceNotFound", `DB instance ${identifier} not found.`, 404);
    inst.dbInstanceStatus = "deleting";
    this.instances.delete(identifier);
    return inst;
  }

  createDbCluster(
    identifier: string,
    engine: string,
    masterUsername: string,
    region: string,
    vpcSecurityGroupIds: string[] = [],
    engineVersion?: string,
  ): DbCluster {
    if (this.clusters.has(identifier)) {
      throw new AwsError("DBClusterAlreadyExistsFault", `DB cluster ${identifier} already exists.`, 400);
    }
    const cluster: DbCluster = {
      dbClusterIdentifier: identifier,
      engine,
      engineVersion: engineVersion ?? this.defaultEngineVersion(engine),
      masterUsername,
      status: "available",
      endpoint: `${identifier}.cluster-abcdefghijkl.${region}.rds.amazonaws.com`,
      readerEndpoint: `${identifier}.cluster-ro-abcdefghijkl.${region}.rds.amazonaws.com`,
      arn: buildArn("rds", region, this.accountId, "cluster:", identifier),
      vpcSecurityGroupIds,
      availabilityZones: [`${region}a`, `${region}b`, `${region}c`],
      port: engine.includes("postgres") ? 5432 : 3306,
      createdAt: new Date().toISOString(),
    };
    this.clusters.set(identifier, cluster);
    return cluster;
  }

  describeDbClusters(identifier?: string): DbCluster[] {
    if (identifier) {
      const cluster = this.clusters.get(identifier);
      if (!cluster) throw new AwsError("DBClusterNotFoundFault", `DB cluster ${identifier} not found.`, 404);
      return [cluster];
    }
    return this.clusters.values();
  }

  deleteDbCluster(identifier: string): DbCluster {
    const cluster = this.clusters.get(identifier);
    if (!cluster) throw new AwsError("DBClusterNotFoundFault", `DB cluster ${identifier} not found.`, 404);
    cluster.status = "deleting";
    this.clusters.delete(identifier);
    return cluster;
  }

  createDbSubnetGroup(name: string, description: string, subnetIds: string[], region: string): DbSubnetGroup {
    if (this.subnetGroups.has(name)) {
      throw new AwsError("DBSubnetGroupAlreadyExists", `DB subnet group ${name} already exists.`, 400);
    }
    const group: DbSubnetGroup = {
      dbSubnetGroupName: name,
      dbSubnetGroupDescription: description,
      subnetIds,
      vpcId: "vpc-12345678",
      arn: buildArn("rds", region, this.accountId, "subgrp:", name),
      status: "Complete",
    };
    this.subnetGroups.set(name, group);
    return group;
  }

  describeDbSubnetGroups(name?: string): DbSubnetGroup[] {
    if (name) {
      const group = this.subnetGroups.get(name);
      if (!group) throw new AwsError("DBSubnetGroupNotFoundFault", `DB subnet group ${name} not found.`, 404);
      return [group];
    }
    return this.subnetGroups.values();
  }

  deleteDbSubnetGroup(name: string): void {
    if (!this.subnetGroups.has(name)) {
      throw new AwsError("DBSubnetGroupNotFoundFault", `DB subnet group ${name} not found.`, 404);
    }
    this.subnetGroups.delete(name);
  }

  createDbSnapshot(snapshotId: string, instanceId: string, region: string): DbSnapshot {
    if (this.snapshots.has(snapshotId)) {
      throw new AwsError("DBSnapshotAlreadyExists", `DB snapshot ${snapshotId} already exists.`, 400);
    }
    const instance = this.instances.get(instanceId);
    if (!instance) throw new AwsError("DBInstanceNotFound", `DB instance ${instanceId} not found.`, 404);
    const snapshot: DbSnapshot = {
      dbSnapshotIdentifier: snapshotId,
      dbInstanceIdentifier: instanceId,
      engine: instance.engine,
      engineVersion: instance.engineVersion,
      allocatedStorage: instance.allocatedStorage,
      status: "available",
      arn: buildArn("rds", region, this.accountId, "snapshot:", snapshotId),
      snapshotType: "manual",
      createdAt: new Date().toISOString(),
    };
    this.snapshots.set(snapshotId, snapshot);
    return snapshot;
  }

  describeDbSnapshots(snapshotId?: string, instanceId?: string): DbSnapshot[] {
    if (snapshotId) {
      const snap = this.snapshots.get(snapshotId);
      if (!snap) throw new AwsError("DBSnapshotNotFound", `DB snapshot ${snapshotId} not found.`, 404);
      return [snap];
    }
    const all = this.snapshots.values();
    if (instanceId) return all.filter((s) => s.dbInstanceIdentifier === instanceId);
    return all;
  }

  deleteDbSnapshot(snapshotId: string): DbSnapshot {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) throw new AwsError("DBSnapshotNotFound", `DB snapshot ${snapshotId} not found.`, 404);
    this.snapshots.delete(snapshotId);
    return snap;
  }

  createDbInstanceReadReplica(
    replicaIdentifier: string,
    sourceIdentifier: string,
    region: string,
    dbInstanceClass?: string,
  ): DbInstance {
    if (this.instances.has(replicaIdentifier)) {
      throw new AwsError("DBInstanceAlreadyExists", `DB instance ${replicaIdentifier} already exists.`, 400);
    }
    const source = this.instances.get(sourceIdentifier);
    if (!source) throw new AwsError("DBInstanceNotFound", `DB instance ${sourceIdentifier} not found.`, 404);

    const replica: DbInstance = {
      ...source,
      dbInstanceIdentifier: replicaIdentifier,
      dbInstanceClass: dbInstanceClass ?? source.dbInstanceClass,
      dbInstanceStatus: "available",
      endpoint: {
        address: `${replicaIdentifier}.abcdefghijkl.${region}.rds.amazonaws.com`,
        port: source.endpoint.port,
      },
      arn: buildArn("rds", region, this.accountId, "db:", replicaIdentifier),
      readReplicaSourceDBInstanceIdentifier: sourceIdentifier,
      createdAt: new Date().toISOString(),
    };
    this.instances.set(replicaIdentifier, replica);
    return replica;
  }

  promoteReadReplica(identifier: string): DbInstance {
    const inst = this.instances.get(identifier);
    if (!inst) throw new AwsError("DBInstanceNotFound", `DB instance ${identifier} not found.`, 404);
    if (!inst.readReplicaSourceDBInstanceIdentifier) {
      throw new AwsError("InvalidDBInstanceState", `DB instance ${identifier} is not a read replica.`, 400);
    }
    delete inst.readReplicaSourceDBInstanceIdentifier;
    inst.dbInstanceStatus = "available";
    this.instances.set(identifier, inst);
    return inst;
  }

  rebootDbInstance(identifier: string): DbInstance {
    const inst = this.instances.get(identifier);
    if (!inst) throw new AwsError("DBInstanceNotFound", `DB instance ${identifier} not found.`, 404);
    inst.dbInstanceStatus = "rebooting";
    this.instances.set(identifier, inst);
    // Immediately transition to available for emulation purposes
    inst.dbInstanceStatus = "available";
    this.instances.set(identifier, inst);
    return inst;
  }

  startDbInstance(identifier: string): DbInstance {
    const inst = this.instances.get(identifier);
    if (!inst) throw new AwsError("DBInstanceNotFound", `DB instance ${identifier} not found.`, 404);
    if (inst.dbInstanceStatus !== "stopped") {
      throw new AwsError("InvalidDBInstanceState", `DB instance ${identifier} is not in stopped state.`, 400);
    }
    inst.dbInstanceStatus = "available";
    this.instances.set(identifier, inst);
    return inst;
  }

  stopDbInstance(identifier: string): DbInstance {
    const inst = this.instances.get(identifier);
    if (!inst) throw new AwsError("DBInstanceNotFound", `DB instance ${identifier} not found.`, 404);
    if (inst.dbInstanceStatus !== "available") {
      throw new AwsError("InvalidDBInstanceState", `DB instance ${identifier} is not in available state.`, 400);
    }
    inst.dbInstanceStatus = "stopped";
    this.instances.set(identifier, inst);
    return inst;
  }

  modifyDbCluster(
    identifier: string,
    updates: { engineVersion?: string; deletionProtection?: boolean },
  ): DbCluster {
    const cluster = this.clusters.get(identifier);
    if (!cluster) throw new AwsError("DBClusterNotFoundFault", `DB cluster ${identifier} not found.`, 404);
    if (updates.engineVersion !== undefined) cluster.engineVersion = updates.engineVersion;
    if (updates.deletionProtection !== undefined) cluster.deletionProtection = updates.deletionProtection;
    this.clusters.set(identifier, cluster);
    return cluster;
  }

  createDbClusterSnapshot(snapshotId: string, clusterId: string, region: string): DbClusterSnapshot {
    if (this.clusterSnapshots.has(snapshotId)) {
      throw new AwsError("DBClusterSnapshotAlreadyExistsFault", `DB cluster snapshot ${snapshotId} already exists.`, 400);
    }
    const cluster = this.clusters.get(clusterId);
    if (!cluster) throw new AwsError("DBClusterNotFoundFault", `DB cluster ${clusterId} not found.`, 404);
    const snapshot: DbClusterSnapshot = {
      dbClusterSnapshotIdentifier: snapshotId,
      dbClusterIdentifier: clusterId,
      engine: cluster.engine,
      engineVersion: cluster.engineVersion,
      status: "available",
      arn: buildArn("rds", region, this.accountId, "cluster-snapshot:", snapshotId),
      snapshotType: "manual",
      createdAt: new Date().toISOString(),
    };
    this.clusterSnapshots.set(snapshotId, snapshot);
    return snapshot;
  }

  describeDbClusterSnapshots(snapshotId?: string, clusterId?: string): DbClusterSnapshot[] {
    if (snapshotId) {
      const snap = this.clusterSnapshots.get(snapshotId);
      if (!snap) throw new AwsError("DBClusterSnapshotNotFoundFault", `DB cluster snapshot ${snapshotId} not found.`, 404);
      return [snap];
    }
    const all = this.clusterSnapshots.values();
    if (clusterId) return all.filter((s) => s.dbClusterIdentifier === clusterId);
    return all;
  }

  deleteDbClusterSnapshot(snapshotId: string): DbClusterSnapshot {
    const snap = this.clusterSnapshots.get(snapshotId);
    if (!snap) throw new AwsError("DBClusterSnapshotNotFoundFault", `DB cluster snapshot ${snapshotId} not found.`, 404);
    this.clusterSnapshots.delete(snapshotId);
    return snap;
  }

  describeDbEngineVersions(engine?: string): Array<{ engine: string; engineVersion: string; description: string }> {
    const engines = [
      { engine: "mysql", engineVersion: "8.0.35", description: "MySQL Community Edition" },
      { engine: "mysql", engineVersion: "8.0.36", description: "MySQL Community Edition" },
      { engine: "postgres", engineVersion: "15.4", description: "PostgreSQL" },
      { engine: "postgres", engineVersion: "16.1", description: "PostgreSQL" },
      { engine: "aurora-mysql", engineVersion: "3.04.1", description: "Aurora MySQL" },
      { engine: "aurora-postgresql", engineVersion: "15.4", description: "Aurora PostgreSQL" },
      { engine: "mariadb", engineVersion: "10.11.6", description: "MariaDB" },
    ];
    if (engine) return engines.filter((e) => e.engine === engine);
    return engines;
  }

  private defaultEngineVersion(engine: string): string {
    const defaults: Record<string, string> = {
      mysql: "8.0.35",
      postgres: "16.1",
      "aurora-mysql": "3.04.1",
      "aurora-postgresql": "15.4",
      mariadb: "10.11.6",
    };
    return defaults[engine] ?? "1.0";
  }
}
