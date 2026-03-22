import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ElastiCacheClient,
  CreateCacheClusterCommand,
  DescribeCacheClustersCommand,
  DeleteCacheClusterCommand,
  ModifyCacheClusterCommand,
  CreateReplicationGroupCommand,
  DescribeReplicationGroupsCommand,
  DeleteReplicationGroupCommand,
  CreateCacheSubnetGroupCommand,
  DescribeCacheSubnetGroupsCommand,
  DeleteCacheSubnetGroupCommand,
  CreateCacheParameterGroupCommand,
  DescribeCacheParameterGroupsCommand,
} from "@aws-sdk/client-elasticache";
import { startServer, stopServer, clientConfig } from "./helpers";

const elasticache = new ElastiCacheClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("ElastiCache", () => {
  // --- Cache Clusters ---

  test("CreateCacheCluster", async () => {
    const res = await elasticache.send(new CreateCacheClusterCommand({
      CacheClusterId: "test-redis",
      CacheNodeType: "cache.t3.micro",
      Engine: "redis",
      NumCacheNodes: 1,
    }));
    expect(res.CacheCluster).toBeDefined();
    expect(res.CacheCluster!.CacheClusterId).toBe("test-redis");
    expect(res.CacheCluster!.CacheClusterStatus).toBe("available");
    expect(res.CacheCluster!.Engine).toBe("redis");
    expect(res.CacheCluster!.CacheNodeType).toBe("cache.t3.micro");
  });

  test("CreateCacheCluster - duplicate fails", async () => {
    try {
      await elasticache.send(new CreateCacheClusterCommand({
        CacheClusterId: "test-redis",
        Engine: "redis",
        NumCacheNodes: 1,
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toMatch(/CacheClusterAlreadyExists/);
    }
  });

  test("DescribeCacheClusters - by ID", async () => {
    const res = await elasticache.send(new DescribeCacheClustersCommand({
      CacheClusterId: "test-redis",
    }));
    expect(res.CacheClusters!.length).toBe(1);
    expect(res.CacheClusters![0].CacheClusterId).toBe("test-redis");
  });

  test("DescribeCacheClusters - all", async () => {
    const res = await elasticache.send(new DescribeCacheClustersCommand({}));
    expect(res.CacheClusters!.length).toBeGreaterThanOrEqual(1);
  });

  test("ModifyCacheCluster", async () => {
    const res = await elasticache.send(new ModifyCacheClusterCommand({
      CacheClusterId: "test-redis",
      NumCacheNodes: 3,
    }));
    expect(res.CacheCluster!.NumCacheNodes).toBe(3);
  });

  // --- Replication Groups ---

  test("CreateReplicationGroup", async () => {
    const res = await elasticache.send(new CreateReplicationGroupCommand({
      ReplicationGroupId: "test-rg",
      ReplicationGroupDescription: "Test replication group",
      CacheNodeType: "cache.t3.micro",
      AutomaticFailoverEnabled: true,
    }));
    expect(res.ReplicationGroup).toBeDefined();
    expect(res.ReplicationGroup!.ReplicationGroupId).toBe("test-rg");
    expect(res.ReplicationGroup!.Status).toBe("available");
    expect(res.ReplicationGroup!.AutomaticFailover).toBe("enabled");
  });

  test("DescribeReplicationGroups - by ID", async () => {
    const res = await elasticache.send(new DescribeReplicationGroupsCommand({
      ReplicationGroupId: "test-rg",
    }));
    expect(res.ReplicationGroups!.length).toBe(1);
    expect(res.ReplicationGroups![0].ReplicationGroupId).toBe("test-rg");
  });

  test("DescribeReplicationGroups - all", async () => {
    const res = await elasticache.send(new DescribeReplicationGroupsCommand({}));
    expect(res.ReplicationGroups!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteReplicationGroup", async () => {
    const res = await elasticache.send(new DeleteReplicationGroupCommand({
      ReplicationGroupId: "test-rg",
    }));
    expect(res.ReplicationGroup!.Status).toBe("deleting");
  });

  // --- Subnet Groups ---

  test("CreateCacheSubnetGroup", async () => {
    const res = await elasticache.send(new CreateCacheSubnetGroupCommand({
      CacheSubnetGroupName: "test-subnet-group",
      CacheSubnetGroupDescription: "Test subnet group",
      SubnetIds: ["subnet-111", "subnet-222"],
    }));
    expect(res.CacheSubnetGroup).toBeDefined();
    expect(res.CacheSubnetGroup!.CacheSubnetGroupName).toBe("test-subnet-group");
    expect(res.CacheSubnetGroup!.Subnets!.length).toBe(2);
  });

  test("DescribeCacheSubnetGroups - by name", async () => {
    const res = await elasticache.send(new DescribeCacheSubnetGroupsCommand({
      CacheSubnetGroupName: "test-subnet-group",
    }));
    expect(res.CacheSubnetGroups!.length).toBe(1);
  });

  test("DeleteCacheSubnetGroup", async () => {
    await elasticache.send(new DeleteCacheSubnetGroupCommand({
      CacheSubnetGroupName: "test-subnet-group",
    }));

    try {
      await elasticache.send(new DescribeCacheSubnetGroupsCommand({
        CacheSubnetGroupName: "test-subnet-group",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("CacheSubnetGroupNotFoundFault");
    }
  });

  // --- Parameter Groups ---

  test("CreateCacheParameterGroup", async () => {
    const res = await elasticache.send(new CreateCacheParameterGroupCommand({
      CacheParameterGroupName: "test-pg",
      CacheParameterGroupFamily: "redis7",
      Description: "Test parameter group",
    }));
    expect(res.CacheParameterGroup).toBeDefined();
    expect(res.CacheParameterGroup!.CacheParameterGroupName).toBe("test-pg");
    expect(res.CacheParameterGroup!.CacheParameterGroupFamily).toBe("redis7");
  });

  test("DescribeCacheParameterGroups", async () => {
    const res = await elasticache.send(new DescribeCacheParameterGroupsCommand({
      CacheParameterGroupName: "test-pg",
    }));
    expect(res.CacheParameterGroups!.length).toBe(1);
    expect(res.CacheParameterGroups![0].CacheParameterGroupName).toBe("test-pg");
  });

  // --- Cleanup ---

  test("DeleteCacheCluster", async () => {
    const res = await elasticache.send(new DeleteCacheClusterCommand({
      CacheClusterId: "test-redis",
    }));
    expect(res.CacheCluster!.CacheClusterStatus).toBe("deleting");
  });
});
