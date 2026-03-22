import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  MemoryDBClient,
  CreateClusterCommand,
  DescribeClustersCommand,
  DeleteClusterCommand,
  CreateSubnetGroupCommand,
  DescribeSubnetGroupsCommand,
  DeleteSubnetGroupCommand,
  CreateParameterGroupCommand,
  DescribeParameterGroupsCommand,
  CreateUserCommand,
  DescribeUsersCommand,
  CreateACLCommand,
  DescribeACLsCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsCommand,
} from "@aws-sdk/client-memorydb";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new MemoryDBClient({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("MemoryDB", () => {
  const clusterName = "test-cluster-" + Date.now();

  test("CreateCluster", async () => {
    const result = await client.send(new CreateClusterCommand({
      ClusterName: clusterName,
      NodeType: "db.t4g.small",
      ACLName: "open-access",
    }));
    expect(result.Cluster?.Name).toBe(clusterName);
    expect(result.Cluster?.Status).toBe("available");
    expect(result.Cluster?.NodeType).toBe("db.t4g.small");
  });

  test("DescribeClusters", async () => {
    const result = await client.send(new DescribeClustersCommand({ ClusterName: clusterName }));
    expect(result.Clusters?.length).toBe(1);
    expect(result.Clusters![0].Name).toBe(clusterName);
  });

  test("DescribeClusters — nonexistent throws", async () => {
    try {
      await client.send(new DescribeClustersCommand({ ClusterName: "nonexistent-" + Date.now() }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ClusterNotFoundFault");
    }
  });

  test("TagResource + ListTags", async () => {
    const cluster = (await client.send(new DescribeClustersCommand({ ClusterName: clusterName }))).Clusters![0];
    await client.send(new TagResourceCommand({
      ResourceArn: cluster.ARN!,
      Tags: [{ Key: "env", Value: "test" }],
    }));
    const tags = await client.send(new ListTagsCommand({ ResourceArn: cluster.ARN! }));
    expect(tags.TagList?.some((t) => t.Key === "env" && t.Value === "test")).toBe(true);
  });

  test("UntagResource", async () => {
    const cluster = (await client.send(new DescribeClustersCommand({ ClusterName: clusterName }))).Clusters![0];
    await client.send(new UntagResourceCommand({ ResourceArn: cluster.ARN!, TagKeys: ["env"] }));
    const tags = await client.send(new ListTagsCommand({ ResourceArn: cluster.ARN! }));
    expect(tags.TagList?.some((t) => t.Key === "env")).toBe(false);
  });

  test("CreateSubnetGroup + DescribeSubnetGroups", async () => {
    const sgName = "test-sg-" + Date.now();
    await client.send(new CreateSubnetGroupCommand({ SubnetGroupName: sgName, SubnetIds: ["subnet-a", "subnet-b"] }));
    const result = await client.send(new DescribeSubnetGroupsCommand({ SubnetGroupName: sgName }));
    expect(result.SubnetGroups?.length).toBe(1);
    expect(result.SubnetGroups![0].Name).toBe(sgName);
    await client.send(new DeleteSubnetGroupCommand({ SubnetGroupName: sgName }));
  });

  test("CreateParameterGroup + DescribeParameterGroups", async () => {
    const pgName = "test-pg-" + Date.now();
    await client.send(new CreateParameterGroupCommand({ ParameterGroupName: pgName, Family: "memorydb_redis7" }));
    const result = await client.send(new DescribeParameterGroupsCommand({ ParameterGroupName: pgName }));
    expect(result.ParameterGroups?.length).toBe(1);
  });

  test("CreateUser + DescribeUsers", async () => {
    const userName = "test-user-" + Date.now();
    await client.send(new CreateUserCommand({ UserName: userName, AccessString: "on ~* +@all", AuthenticationMode: { Type: "no-password-required" } }));
    const result = await client.send(new DescribeUsersCommand({ UserName: userName }));
    expect(result.Users?.length).toBe(1);
    expect(result.Users![0].Name).toBe(userName);
  });

  test("CreateACL + DescribeACLs", async () => {
    const aclName = "test-acl-" + Date.now();
    await client.send(new CreateACLCommand({ ACLName: aclName }));
    const result = await client.send(new DescribeACLsCommand({ ACLName: aclName }));
    expect(result.ACLs?.length).toBe(1);
    expect(result.ACLs![0].Name).toBe(aclName);
  });

  test("DeleteCluster", async () => {
    const result = await client.send(new DeleteClusterCommand({ ClusterName: clusterName }));
    expect(result.Cluster?.Status).toBe("deleting");
  });
});
