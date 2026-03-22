import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  RedshiftClient,
  CreateClusterCommand,
  DescribeClustersCommand,
  ModifyClusterCommand,
  DeleteClusterCommand,
  PauseClusterCommand,
  ResumeClusterCommand,
  CreateClusterSubnetGroupCommand,
  DescribeClusterSubnetGroupsCommand,
  DeleteClusterSubnetGroupCommand,
  CreateClusterParameterGroupCommand,
  DescribeClusterParameterGroupsCommand,
  CreateClusterSnapshotCommand,
  DescribeClusterSnapshotsCommand,
  DeleteClusterSnapshotCommand,
  RestoreFromClusterSnapshotCommand,
} from "@aws-sdk/client-redshift";
import { startServer, stopServer, clientConfig } from "./helpers";

const redshift = new RedshiftClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Redshift", () => {
  let clusterArn: string;

  // --- Clusters ---

  test("CreateCluster", async () => {
    const res = await redshift.send(new CreateClusterCommand({
      ClusterIdentifier: "test-cluster",
      NodeType: "dc2.large",
      MasterUsername: "admin",
      MasterUserPassword: "Password123!",
      DBName: "mydb",
      NumberOfNodes: 2,
    }));
    expect(res.Cluster).toBeDefined();
    expect(res.Cluster!.ClusterIdentifier).toBe("test-cluster");
    expect(res.Cluster!.NodeType).toBe("dc2.large");
    expect(res.Cluster!.ClusterStatus).toBe("available");
    expect(res.Cluster!.NumberOfNodes).toBe(2);
    expect(res.Cluster!.DBName).toBe("mydb");
    expect(res.Cluster!.Endpoint).toBeDefined();
    expect(res.Cluster!.Endpoint!.Port).toBe(5439);
    clusterArn = res.Cluster!.ClusterArn ?? "";
  });

  test("DescribeClusters", async () => {
    const res = await redshift.send(new DescribeClustersCommand({
      ClusterIdentifier: "test-cluster",
    }));
    expect(res.Clusters!.length).toBe(1);
    expect(res.Clusters![0].ClusterIdentifier).toBe("test-cluster");
    expect(res.Clusters![0].MasterUsername).toBe("admin");
  });

  test("DescribeClusters - list all", async () => {
    const res = await redshift.send(new DescribeClustersCommand({}));
    expect(res.Clusters!.length).toBeGreaterThanOrEqual(1);
  });

  test("ModifyCluster", async () => {
    const res = await redshift.send(new ModifyClusterCommand({
      ClusterIdentifier: "test-cluster",
      NumberOfNodes: 4,
    }));
    expect(res.Cluster!.NumberOfNodes).toBe(4);
  });

  test("PauseCluster", async () => {
    const res = await redshift.send(new PauseClusterCommand({
      ClusterIdentifier: "test-cluster",
    }));
    expect(res.Cluster!.ClusterStatus).toBe("paused");
  });

  test("ResumeCluster", async () => {
    const res = await redshift.send(new ResumeClusterCommand({
      ClusterIdentifier: "test-cluster",
    }));
    expect(res.Cluster!.ClusterStatus).toBe("available");
  });

  // --- Subnet Groups ---

  test("CreateClusterSubnetGroup", async () => {
    const res = await redshift.send(new CreateClusterSubnetGroupCommand({
      ClusterSubnetGroupName: "test-subnet-group",
      Description: "Test subnet group",
      SubnetIds: ["subnet-11111", "subnet-22222"],
    }));
    expect(res.ClusterSubnetGroup).toBeDefined();
    expect(res.ClusterSubnetGroup!.ClusterSubnetGroupName).toBe("test-subnet-group");
    expect(res.ClusterSubnetGroup!.Description).toBe("Test subnet group");
  });

  test("DescribeClusterSubnetGroups", async () => {
    const res = await redshift.send(new DescribeClusterSubnetGroupsCommand({
      ClusterSubnetGroupName: "test-subnet-group",
    }));
    expect(res.ClusterSubnetGroups!.length).toBe(1);
  });

  test("DeleteClusterSubnetGroup", async () => {
    await redshift.send(new DeleteClusterSubnetGroupCommand({
      ClusterSubnetGroupName: "test-subnet-group",
    }));
    const res = await redshift.send(new DescribeClusterSubnetGroupsCommand({}));
    const found = res.ClusterSubnetGroups!.find((g) => g.ClusterSubnetGroupName === "test-subnet-group");
    expect(found).toBeUndefined();
  });

  // --- Parameter Groups ---

  test("CreateClusterParameterGroup", async () => {
    const res = await redshift.send(new CreateClusterParameterGroupCommand({
      ParameterGroupName: "test-param-group",
      ParameterGroupFamily: "redshift-1.0",
      Description: "Test parameter group",
    }));
    expect(res.ClusterParameterGroup).toBeDefined();
    expect(res.ClusterParameterGroup!.ParameterGroupName).toBe("test-param-group");
  });

  test("DescribeClusterParameterGroups", async () => {
    const res = await redshift.send(new DescribeClusterParameterGroupsCommand({
      ParameterGroupName: "test-param-group",
    }));
    expect(res.ParameterGroups!.length).toBe(1);
  });

  // --- Snapshots ---

  test("CreateClusterSnapshot", async () => {
    const res = await redshift.send(new CreateClusterSnapshotCommand({
      SnapshotIdentifier: "test-snapshot",
      ClusterIdentifier: "test-cluster",
    }));
    expect(res.Snapshot).toBeDefined();
    expect(res.Snapshot!.SnapshotIdentifier).toBe("test-snapshot");
    expect(res.Snapshot!.ClusterIdentifier).toBe("test-cluster");
    expect(res.Snapshot!.Status).toBe("available");
  });

  test("DescribeClusterSnapshots", async () => {
    const res = await redshift.send(new DescribeClusterSnapshotsCommand({
      SnapshotIdentifier: "test-snapshot",
    }));
    expect(res.Snapshots!.length).toBe(1);
  });

  test("RestoreFromClusterSnapshot", async () => {
    const res = await redshift.send(new RestoreFromClusterSnapshotCommand({
      ClusterIdentifier: "restored-cluster",
      SnapshotIdentifier: "test-snapshot",
    }));
    expect(res.Cluster).toBeDefined();
    expect(res.Cluster!.ClusterIdentifier).toBe("restored-cluster");
    expect(res.Cluster!.ClusterStatus).toBe("available");
  });

  test("DeleteClusterSnapshot", async () => {
    const res = await redshift.send(new DeleteClusterSnapshotCommand({
      SnapshotIdentifier: "test-snapshot",
    }));
    expect(res.Snapshot!.SnapshotIdentifier).toBe("test-snapshot");
  });

  // --- Cleanup ---

  test("DeleteCluster", async () => {
    await redshift.send(new DeleteClusterCommand({
      ClusterIdentifier: "test-cluster",
      SkipFinalClusterSnapshot: true,
    }));
    await redshift.send(new DeleteClusterCommand({
      ClusterIdentifier: "restored-cluster",
      SkipFinalClusterSnapshot: true,
    }));
  });
});
