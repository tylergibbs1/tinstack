import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  RDSClient,
  CreateDBInstanceCommand,
  DescribeDBInstancesCommand,
  ModifyDBInstanceCommand,
  DeleteDBInstanceCommand,
  CreateDBClusterCommand,
  DescribeDBClustersCommand,
  DeleteDBClusterCommand,
  ModifyDBClusterCommand,
  CreateDBSubnetGroupCommand,
  DescribeDBSubnetGroupsCommand,
  DeleteDBSubnetGroupCommand,
  CreateDBSnapshotCommand,
  DescribeDBSnapshotsCommand,
  DeleteDBSnapshotCommand,
  CreateDBClusterSnapshotCommand,
  DescribeDBClusterSnapshotsCommand,
  DeleteDBClusterSnapshotCommand,
  DescribeDBEngineVersionsCommand,
  CreateDBInstanceReadReplicaCommand,
  PromoteReadReplicaCommand,
  RebootDBInstanceCommand,
  StartDBInstanceCommand,
  StopDBInstanceCommand,
} from "@aws-sdk/client-rds";
import { startServer, stopServer, clientConfig } from "./helpers";

const rds = new RDSClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("RDS", () => {
  // --- DB Subnet Groups ---
  test("CreateDBSubnetGroup", async () => {
    const res = await rds.send(
      new CreateDBSubnetGroupCommand({
        DBSubnetGroupName: "test-subnet-group",
        DBSubnetGroupDescription: "Test subnet group",
        SubnetIds: ["subnet-111111", "subnet-222222"],
      }),
    );
    expect(res.DBSubnetGroup).toBeDefined();
    expect(res.DBSubnetGroup!.DBSubnetGroupName).toBe("test-subnet-group");
    expect(res.DBSubnetGroup!.DBSubnetGroupDescription).toBe("Test subnet group");
  });

  test("DescribeDBSubnetGroups", async () => {
    const res = await rds.send(new DescribeDBSubnetGroupsCommand({}));
    expect(res.DBSubnetGroups).toBeDefined();
    expect(res.DBSubnetGroups!.length).toBeGreaterThanOrEqual(1);
    expect(res.DBSubnetGroups!.some((g) => g.DBSubnetGroupName === "test-subnet-group")).toBe(true);
  });

  test("DescribeDBSubnetGroups — by name", async () => {
    const res = await rds.send(
      new DescribeDBSubnetGroupsCommand({ DBSubnetGroupName: "test-subnet-group" }),
    );
    expect(res.DBSubnetGroups!.length).toBe(1);
    expect(res.DBSubnetGroups![0].DBSubnetGroupName).toBe("test-subnet-group");
  });

  // --- DB Instances ---
  test("CreateDBInstance", async () => {
    const res = await rds.send(
      new CreateDBInstanceCommand({
        DBInstanceIdentifier: "test-db",
        DBInstanceClass: "db.t3.micro",
        Engine: "mysql",
        MasterUsername: "admin",
        MasterUserPassword: "password123",
        AllocatedStorage: 20,
      }),
    );
    expect(res.DBInstance).toBeDefined();
    expect(res.DBInstance!.DBInstanceIdentifier).toBe("test-db");
    expect(res.DBInstance!.DBInstanceClass).toBe("db.t3.micro");
    expect(res.DBInstance!.Engine).toBe("mysql");
    expect(res.DBInstance!.DBInstanceStatus).toBe("available");
    expect(res.DBInstance!.Endpoint).toBeDefined();
    expect(res.DBInstance!.Endpoint!.Port).toBe(3306);
  });

  test("CreateDBInstance — postgres", async () => {
    const res = await rds.send(
      new CreateDBInstanceCommand({
        DBInstanceIdentifier: "pg-db",
        DBInstanceClass: "db.r6g.large",
        Engine: "postgres",
        MasterUsername: "pgadmin",
        MasterUserPassword: "password123",
        AllocatedStorage: 50,
      }),
    );
    expect(res.DBInstance!.Engine).toBe("postgres");
    expect(res.DBInstance!.Endpoint!.Port).toBe(5432);
  });

  test("CreateDBInstance — duplicate fails", async () => {
    try {
      await rds.send(
        new CreateDBInstanceCommand({
          DBInstanceIdentifier: "test-db",
          DBInstanceClass: "db.t3.micro",
          Engine: "mysql",
          MasterUsername: "admin",
          MasterUserPassword: "password123",
          AllocatedStorage: 20,
        }),
      );
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.name).toContain("DBInstanceAlreadyExists");
    }
  });

  test("DescribeDBInstances — all", async () => {
    const res = await rds.send(new DescribeDBInstancesCommand({}));
    expect(res.DBInstances).toBeDefined();
    expect(res.DBInstances!.length).toBeGreaterThanOrEqual(2);
  });

  test("DescribeDBInstances — by identifier", async () => {
    const res = await rds.send(
      new DescribeDBInstancesCommand({ DBInstanceIdentifier: "test-db" }),
    );
    expect(res.DBInstances!.length).toBe(1);
    expect(res.DBInstances![0].DBInstanceIdentifier).toBe("test-db");
  });

  test("ModifyDBInstance", async () => {
    const res = await rds.send(
      new ModifyDBInstanceCommand({
        DBInstanceIdentifier: "test-db",
        DBInstanceClass: "db.r6g.large",
        AllocatedStorage: 100,
      }),
    );
    expect(res.DBInstance!.DBInstanceClass).toBe("db.r6g.large");
    expect(res.DBInstance!.AllocatedStorage).toBe(100);
  });

  // --- Snapshots ---
  test("CreateDBSnapshot", async () => {
    const res = await rds.send(
      new CreateDBSnapshotCommand({
        DBSnapshotIdentifier: "test-snap",
        DBInstanceIdentifier: "test-db",
      }),
    );
    expect(res.DBSnapshot).toBeDefined();
    expect(res.DBSnapshot!.DBSnapshotIdentifier).toBe("test-snap");
    expect(res.DBSnapshot!.DBInstanceIdentifier).toBe("test-db");
    expect(res.DBSnapshot!.Status).toBe("available");
  });

  test("DescribeDBSnapshots", async () => {
    const res = await rds.send(new DescribeDBSnapshotsCommand({}));
    expect(res.DBSnapshots!.length).toBeGreaterThanOrEqual(1);
  });

  test("DescribeDBSnapshots — by identifier", async () => {
    const res = await rds.send(
      new DescribeDBSnapshotsCommand({ DBSnapshotIdentifier: "test-snap" }),
    );
    expect(res.DBSnapshots!.length).toBe(1);
    expect(res.DBSnapshots![0].DBSnapshotIdentifier).toBe("test-snap");
  });

  test("DeleteDBSnapshot", async () => {
    const res = await rds.send(
      new DeleteDBSnapshotCommand({ DBSnapshotIdentifier: "test-snap" }),
    );
    expect(res.DBSnapshot).toBeDefined();

    const list = await rds.send(new DescribeDBSnapshotsCommand({}));
    expect(list.DBSnapshots!.some((s) => s.DBSnapshotIdentifier === "test-snap")).toBe(false);
  });

  // --- Read Replicas ---
  test("CreateDBInstanceReadReplica", async () => {
    const res = await rds.send(
      new CreateDBInstanceReadReplicaCommand({
        DBInstanceIdentifier: "test-db-replica",
        SourceDBInstanceIdentifier: "test-db",
      }),
    );
    expect(res.DBInstance).toBeDefined();
    expect(res.DBInstance!.DBInstanceIdentifier).toBe("test-db-replica");
    expect(res.DBInstance!.Engine).toBe("mysql");
    expect(res.DBInstance!.ReadReplicaSourceDBInstanceIdentifier).toBe("test-db");
  });

  test("CreateDBInstanceReadReplica — custom class", async () => {
    const res = await rds.send(
      new CreateDBInstanceReadReplicaCommand({
        DBInstanceIdentifier: "test-db-replica-2",
        SourceDBInstanceIdentifier: "test-db",
        DBInstanceClass: "db.r6g.xlarge",
      }),
    );
    expect(res.DBInstance!.DBInstanceClass).toBe("db.r6g.xlarge");
    expect(res.DBInstance!.ReadReplicaSourceDBInstanceIdentifier).toBe("test-db");
  });

  test("PromoteReadReplica", async () => {
    const res = await rds.send(
      new PromoteReadReplicaCommand({
        DBInstanceIdentifier: "test-db-replica",
      }),
    );
    expect(res.DBInstance).toBeDefined();
    expect(res.DBInstance!.ReadReplicaSourceDBInstanceIdentifier).toBeUndefined();
  });

  test("PromoteReadReplica — not a replica fails", async () => {
    try {
      await rds.send(
        new PromoteReadReplicaCommand({
          DBInstanceIdentifier: "test-db",
        }),
      );
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toContain("InvalidDBInstanceState");
    }
  });

  // --- Reboot/Stop/Start ---
  test("RebootDBInstance", async () => {
    const res = await rds.send(
      new RebootDBInstanceCommand({
        DBInstanceIdentifier: "test-db",
      }),
    );
    expect(res.DBInstance).toBeDefined();
    expect(res.DBInstance!.DBInstanceStatus).toBe("available");
  });

  test("StopDBInstance", async () => {
    const res = await rds.send(
      new StopDBInstanceCommand({
        DBInstanceIdentifier: "test-db",
      }),
    );
    expect(res.DBInstance).toBeDefined();
    expect(res.DBInstance!.DBInstanceStatus).toBe("stopped");
  });

  test("StopDBInstance — already stopped fails", async () => {
    try {
      await rds.send(
        new StopDBInstanceCommand({
          DBInstanceIdentifier: "test-db",
        }),
      );
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toContain("InvalidDBInstanceState");
    }
  });

  test("StartDBInstance", async () => {
    const res = await rds.send(
      new StartDBInstanceCommand({
        DBInstanceIdentifier: "test-db",
      }),
    );
    expect(res.DBInstance).toBeDefined();
    expect(res.DBInstance!.DBInstanceStatus).toBe("available");
  });

  test("StartDBInstance — already available fails", async () => {
    try {
      await rds.send(
        new StartDBInstanceCommand({
          DBInstanceIdentifier: "test-db",
        }),
      );
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toContain("InvalidDBInstanceState");
    }
  });

  // --- DB Clusters ---
  test("CreateDBCluster", async () => {
    const res = await rds.send(
      new CreateDBClusterCommand({
        DBClusterIdentifier: "test-cluster",
        Engine: "aurora-mysql",
        MasterUsername: "admin",
        MasterUserPassword: "password123",
      }),
    );
    expect(res.DBCluster).toBeDefined();
    expect(res.DBCluster!.DBClusterIdentifier).toBe("test-cluster");
    expect(res.DBCluster!.Engine).toBe("aurora-mysql");
    expect(res.DBCluster!.Status).toBe("available");
    expect(res.DBCluster!.Endpoint).toBeDefined();
  });

  test("DescribeDBClusters", async () => {
    const res = await rds.send(new DescribeDBClustersCommand({}));
    expect(res.DBClusters!.length).toBeGreaterThanOrEqual(1);
  });

  test("DescribeDBClusters — by identifier", async () => {
    const res = await rds.send(
      new DescribeDBClustersCommand({ DBClusterIdentifier: "test-cluster" }),
    );
    expect(res.DBClusters!.length).toBe(1);
    expect(res.DBClusters![0].DBClusterIdentifier).toBe("test-cluster");
  });

  test("ModifyDBCluster", async () => {
    const res = await rds.send(
      new ModifyDBClusterCommand({
        DBClusterIdentifier: "test-cluster",
        EngineVersion: "3.05.0",
        DeletionProtection: true,
      }),
    );
    expect(res.DBCluster).toBeDefined();
    expect(res.DBCluster!.EngineVersion).toBe("3.05.0");
  });

  // --- Cluster Snapshots ---
  test("CreateDBClusterSnapshot", async () => {
    const res = await rds.send(
      new CreateDBClusterSnapshotCommand({
        DBClusterSnapshotIdentifier: "test-cluster-snap",
        DBClusterIdentifier: "test-cluster",
      }),
    );
    expect(res.DBClusterSnapshot).toBeDefined();
    expect(res.DBClusterSnapshot!.DBClusterSnapshotIdentifier).toBe("test-cluster-snap");
    expect(res.DBClusterSnapshot!.DBClusterIdentifier).toBe("test-cluster");
    expect(res.DBClusterSnapshot!.Status).toBe("available");
  });

  test("DescribeDBClusterSnapshots", async () => {
    const res = await rds.send(new DescribeDBClusterSnapshotsCommand({}));
    expect(res.DBClusterSnapshots!.length).toBeGreaterThanOrEqual(1);
  });

  test("DescribeDBClusterSnapshots — by identifier", async () => {
    const res = await rds.send(
      new DescribeDBClusterSnapshotsCommand({ DBClusterSnapshotIdentifier: "test-cluster-snap" }),
    );
    expect(res.DBClusterSnapshots!.length).toBe(1);
    expect(res.DBClusterSnapshots![0].DBClusterSnapshotIdentifier).toBe("test-cluster-snap");
  });

  test("DeleteDBClusterSnapshot", async () => {
    const res = await rds.send(
      new DeleteDBClusterSnapshotCommand({ DBClusterSnapshotIdentifier: "test-cluster-snap" }),
    );
    expect(res.DBClusterSnapshot).toBeDefined();

    const list = await rds.send(new DescribeDBClusterSnapshotsCommand({}));
    expect(list.DBClusterSnapshots!.some((s) => s.DBClusterSnapshotIdentifier === "test-cluster-snap")).toBe(false);
  });

  test("DeleteDBCluster", async () => {
    const res = await rds.send(
      new DeleteDBClusterCommand({
        DBClusterIdentifier: "test-cluster",
        SkipFinalSnapshot: true,
      }),
    );
    expect(res.DBCluster).toBeDefined();
  });

  // --- Engine Versions ---
  test("DescribeDBEngineVersions", async () => {
    const res = await rds.send(new DescribeDBEngineVersionsCommand({}));
    expect(res.DBEngineVersions).toBeDefined();
    expect(res.DBEngineVersions!.length).toBeGreaterThanOrEqual(1);
  });

  test("DescribeDBEngineVersions — by engine", async () => {
    const res = await rds.send(
      new DescribeDBEngineVersionsCommand({ Engine: "postgres" }),
    );
    expect(res.DBEngineVersions!.length).toBeGreaterThanOrEqual(1);
    expect(res.DBEngineVersions!.every((v) => v.Engine === "postgres")).toBe(true);
  });

  // --- Cleanup ---
  test("DeleteDBInstance — replica", async () => {
    await rds.send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: "test-db-replica", SkipFinalSnapshot: true }));
  });

  test("DeleteDBInstance — replica-2", async () => {
    await rds.send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: "test-db-replica-2", SkipFinalSnapshot: true }));
  });

  test("DeleteDBInstance", async () => {
    const res = await rds.send(
      new DeleteDBInstanceCommand({
        DBInstanceIdentifier: "test-db",
        SkipFinalSnapshot: true,
      }),
    );
    expect(res.DBInstance).toBeDefined();
  });

  test("DeleteDBInstance — postgres", async () => {
    await rds.send(
      new DeleteDBInstanceCommand({
        DBInstanceIdentifier: "pg-db",
        SkipFinalSnapshot: true,
      }),
    );
  });

  test("DeleteDBSubnetGroup", async () => {
    await rds.send(
      new DeleteDBSubnetGroupCommand({ DBSubnetGroupName: "test-subnet-group" }),
    );

    const res = await rds.send(new DescribeDBSubnetGroupsCommand({}));
    expect(res.DBSubnetGroups!.some((g) => g.DBSubnetGroupName === "test-subnet-group")).toBe(false);
  });
});
