import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  DAXClient,
  CreateClusterCommand,
  DescribeClustersCommand,
  DeleteClusterCommand,
  IncreaseReplicationFactorCommand,
  DecreaseReplicationFactorCommand,
  CreateSubnetGroupCommand,
  DescribeSubnetGroupsCommand,
  DeleteSubnetGroupCommand,
  CreateParameterGroupCommand,
  DescribeParameterGroupsCommand,
  DeleteParameterGroupCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsCommand,
} from "@aws-sdk/client-dax";
import { startServer, stopServer, clientConfig } from "./helpers";

const dax = new DAXClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("DAX", () => {
  let clusterArn: string;

  test("CreateCluster", async () => {
    const res = await dax.send(new CreateClusterCommand({
      ClusterName: "test-cluster",
      NodeType: "dax.r5.large",
      ReplicationFactor: 3,
      Description: "Test DAX cluster",
      IamRoleArn: "arn:aws:iam::000000000000:role/DAXRole",
      Tags: [{ Key: "env", Value: "test" }],
    }));
    const cluster = res.Cluster!;
    clusterArn = cluster.ClusterArn!;
    expect(clusterArn).toBeDefined();
    expect(cluster.ClusterName).toBe("test-cluster");
    expect(cluster.NodeType).toBe("dax.r5.large");
    expect(cluster.Status).toBe("available");
    expect(cluster.TotalNodes).toBe(3);
    expect(cluster.ActiveNodes).toBe(3);
    expect(cluster.Nodes).toBeDefined();
    expect(cluster.Nodes!.length).toBe(3);
    expect(cluster.ClusterDiscoveryEndpoint).toBeDefined();
    expect(cluster.ClusterDiscoveryEndpoint!.Port).toBe(8111);
  });

  test("DescribeClusters", async () => {
    const res = await dax.send(new DescribeClustersCommand({
      ClusterNames: ["test-cluster"],
    }));
    expect(res.Clusters).toBeDefined();
    expect(res.Clusters!.length).toBe(1);
    expect(res.Clusters![0].ClusterName).toBe("test-cluster");
  });

  test("DescribeClusters - all", async () => {
    const res = await dax.send(new DescribeClustersCommand({}));
    expect(res.Clusters!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateCluster - duplicate", async () => {
    await expect(
      dax.send(new CreateClusterCommand({
        ClusterName: "test-cluster",
        NodeType: "dax.r5.large",
        ReplicationFactor: 1,
      })),
    ).rejects.toThrow();
  });

  test("IncreaseReplicationFactor", async () => {
    const res = await dax.send(new IncreaseReplicationFactorCommand({
      ClusterName: "test-cluster",
      NewReplicationFactor: 5,
    }));
    expect(res.Cluster!.TotalNodes).toBe(5);
    expect(res.Cluster!.Nodes!.length).toBe(5);
  });

  test("DecreaseReplicationFactor", async () => {
    const res = await dax.send(new DecreaseReplicationFactorCommand({
      ClusterName: "test-cluster",
      NewReplicationFactor: 2,
    }));
    expect(res.Cluster!.TotalNodes).toBe(2);
    expect(res.Cluster!.Nodes!.length).toBe(2);
  });

  // --- Subnet Groups ---

  test("CreateSubnetGroup", async () => {
    const res = await dax.send(new CreateSubnetGroupCommand({
      SubnetGroupName: "test-subnet-group",
      Description: "Test subnet group",
      SubnetIds: ["subnet-11111", "subnet-22222"],
    }));
    expect(res.SubnetGroup).toBeDefined();
    expect(res.SubnetGroup!.SubnetGroupName).toBe("test-subnet-group");
    expect(res.SubnetGroup!.Subnets!.length).toBe(2);
  });

  test("DescribeSubnetGroups", async () => {
    const res = await dax.send(new DescribeSubnetGroupsCommand({}));
    expect(res.SubnetGroups!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteSubnetGroup", async () => {
    await dax.send(new DeleteSubnetGroupCommand({ SubnetGroupName: "test-subnet-group" }));
    // verify
    await expect(
      dax.send(new DescribeSubnetGroupsCommand({ SubnetGroupNames: ["test-subnet-group"] })),
    ).rejects.toThrow();
  });

  // --- Parameter Groups ---

  test("CreateParameterGroup", async () => {
    const res = await dax.send(new CreateParameterGroupCommand({
      ParameterGroupName: "test-param-group",
      Description: "Test parameter group",
    }));
    expect(res.ParameterGroup).toBeDefined();
    expect(res.ParameterGroup!.ParameterGroupName).toBe("test-param-group");
  });

  test("DescribeParameterGroups", async () => {
    const res = await dax.send(new DescribeParameterGroupsCommand({}));
    expect(res.ParameterGroups!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteParameterGroup", async () => {
    await dax.send(new DeleteParameterGroupCommand({ ParameterGroupName: "test-param-group" }));
  });

  // --- Tags ---

  test("TagResource", async () => {
    const res = await dax.send(new TagResourceCommand({
      ResourceName: clusterArn,
      Tags: [{ Key: "team", Value: "platform" }],
    }));
    expect(res.Tags).toBeDefined();
  });

  test("ListTags", async () => {
    const res = await dax.send(new ListTagsCommand({
      ResourceName: clusterArn,
    }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.find((t) => t.Key === "team")?.Value).toBe("platform");
  });

  test("UntagResource", async () => {
    await dax.send(new UntagResourceCommand({
      ResourceName: clusterArn,
      TagKeys: ["team"],
    }));
    const res = await dax.send(new ListTagsCommand({ ResourceName: clusterArn }));
    expect(res.Tags!.find((t) => t.Key === "team")).toBeUndefined();
  });

  // --- Cleanup ---

  test("DeleteCluster", async () => {
    const res = await dax.send(new DeleteClusterCommand({ ClusterName: "test-cluster" }));
    expect(res.Cluster!.Status).toBe("deleting");
  });

  test("DescribeClusters - not found", async () => {
    await expect(
      dax.send(new DescribeClustersCommand({ ClusterNames: ["nonexistent"] })),
    ).rejects.toThrow();
  });
});
