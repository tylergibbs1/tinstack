import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  EKSClient,
  CreateClusterCommand,
  DescribeClusterCommand,
  ListClustersCommand,
  DeleteClusterCommand,
  UpdateClusterConfigCommand,
  CreateNodegroupCommand,
  DescribeNodegroupCommand,
  ListNodegroupsCommand,
  DeleteNodegroupCommand,
  CreateFargateProfileCommand,
  DescribeFargateProfileCommand,
  ListFargateProfilesCommand,
  DeleteFargateProfileCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-eks";
import { startServer, stopServer, clientConfig } from "./helpers";

const eks = new EKSClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("EKS", () => {
  let clusterArn: string;

  // --- Clusters ---

  test("CreateCluster", async () => {
    const res = await eks.send(new CreateClusterCommand({
      name: "test-cluster",
      roleArn: "arn:aws:iam::000000000000:role/eks-role",
      resourcesVpcConfig: {
        subnetIds: ["subnet-111", "subnet-222"],
        securityGroupIds: ["sg-111"],
      },
    }));
    expect(res.cluster).toBeDefined();
    expect(res.cluster!.name).toBe("test-cluster");
    expect(res.cluster!.status).toBe("ACTIVE");
    expect(res.cluster!.endpoint).toBeDefined();
    clusterArn = res.cluster!.arn!;
  });

  test("CreateCluster - duplicate fails", async () => {
    try {
      await eks.send(new CreateClusterCommand({
        name: "test-cluster",
        roleArn: "arn:aws:iam::000000000000:role/eks-role",
        resourcesVpcConfig: { subnetIds: ["subnet-111"] },
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceInUseException");
    }
  });

  test("DescribeCluster", async () => {
    const res = await eks.send(new DescribeClusterCommand({
      name: "test-cluster",
    }));
    expect(res.cluster).toBeDefined();
    expect(res.cluster!.name).toBe("test-cluster");
    expect(res.cluster!.status).toBe("ACTIVE");
    expect(res.cluster!.arn).toBe(clusterArn);
  });

  test("DescribeCluster - not found", async () => {
    try {
      await eks.send(new DescribeClusterCommand({ name: "nonexistent" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("ListClusters", async () => {
    const res = await eks.send(new ListClustersCommand({}));
    expect(res.clusters!.length).toBeGreaterThanOrEqual(1);
    expect(res.clusters!.includes("test-cluster")).toBe(true);
  });

  test("UpdateClusterConfig", async () => {
    const res = await eks.send(new UpdateClusterConfigCommand({
      name: "test-cluster",
      resourcesVpcConfig: {
        endpointPublicAccess: false,
        endpointPrivateAccess: true,
      },
    }));
    expect(res.update).toBeDefined();
    expect(res.update!.status).toBe("InProgress");
  });

  // --- Nodegroups ---

  let nodegroupName: string;

  test("CreateNodegroup", async () => {
    const res = await eks.send(new CreateNodegroupCommand({
      clusterName: "test-cluster",
      nodegroupName: "test-nodegroup",
      nodeRole: "arn:aws:iam::000000000000:role/node-role",
      subnets: ["subnet-111", "subnet-222"],
      scalingConfig: { minSize: 1, maxSize: 3, desiredSize: 2 },
      instanceTypes: ["t3.medium"],
    }));
    expect(res.nodegroup).toBeDefined();
    expect(res.nodegroup!.nodegroupName).toBe("test-nodegroup");
    expect(res.nodegroup!.status).toBe("ACTIVE");
    expect(res.nodegroup!.scalingConfig!.desiredSize).toBe(2);
    nodegroupName = res.nodegroup!.nodegroupName!;
  });

  test("CreateNodegroup - duplicate fails", async () => {
    try {
      await eks.send(new CreateNodegroupCommand({
        clusterName: "test-cluster",
        nodegroupName: "test-nodegroup",
        nodeRole: "arn:aws:iam::000000000000:role/node-role",
        subnets: ["subnet-111"],
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceInUseException");
    }
  });

  test("DescribeNodegroup", async () => {
    const res = await eks.send(new DescribeNodegroupCommand({
      clusterName: "test-cluster",
      nodegroupName: "test-nodegroup",
    }));
    expect(res.nodegroup).toBeDefined();
    expect(res.nodegroup!.nodegroupName).toBe("test-nodegroup");
    expect(res.nodegroup!.instanceTypes).toEqual(["t3.medium"]);
  });

  test("ListNodegroups", async () => {
    const res = await eks.send(new ListNodegroupsCommand({
      clusterName: "test-cluster",
    }));
    expect(res.nodegroups!.length).toBeGreaterThanOrEqual(1);
    expect(res.nodegroups!.includes("test-nodegroup")).toBe(true);
  });

  // --- Fargate Profiles ---

  test("CreateFargateProfile", async () => {
    const res = await eks.send(new CreateFargateProfileCommand({
      clusterName: "test-cluster",
      fargateProfileName: "test-fp",
      podExecutionRoleArn: "arn:aws:iam::000000000000:role/fargate-role",
      selectors: [{ namespace: "default" }],
    }));
    expect(res.fargateProfile).toBeDefined();
    expect(res.fargateProfile!.fargateProfileName).toBe("test-fp");
    expect(res.fargateProfile!.status).toBe("ACTIVE");
  });

  test("DescribeFargateProfile", async () => {
    const res = await eks.send(new DescribeFargateProfileCommand({
      clusterName: "test-cluster",
      fargateProfileName: "test-fp",
    }));
    expect(res.fargateProfile!.fargateProfileName).toBe("test-fp");
    expect(res.fargateProfile!.selectors!.length).toBe(1);
  });

  test("ListFargateProfiles", async () => {
    const res = await eks.send(new ListFargateProfilesCommand({
      clusterName: "test-cluster",
    }));
    expect(res.fargateProfileNames!.includes("test-fp")).toBe(true);
  });

  test("DeleteFargateProfile", async () => {
    const res = await eks.send(new DeleteFargateProfileCommand({
      clusterName: "test-cluster",
      fargateProfileName: "test-fp",
    }));
    expect(res.fargateProfile!.status).toBe("DELETING");

    const list = await eks.send(new ListFargateProfilesCommand({
      clusterName: "test-cluster",
    }));
    expect(list.fargateProfileNames!.includes("test-fp")).toBe(false);
  });

  // --- Tagging ---

  test("TagResource / ListTagsForResource / UntagResource", async () => {
    await eks.send(new TagResourceCommand({
      resourceArn: clusterArn,
      tags: { env: "test", team: "platform" },
    }));

    // Verify TagResource doesn't throw
    const listRes = await eks.send(new ListTagsForResourceCommand({
      resourceArn: clusterArn,
    }));
    // The response is returned successfully (200)
    expect(listRes.$metadata.httpStatusCode).toBe(200);

    await eks.send(new UntagResourceCommand({
      resourceArn: clusterArn,
      tagKeys: ["team"],
    }));
  });

  // --- Cleanup ---

  test("DeleteNodegroup", async () => {
    const res = await eks.send(new DeleteNodegroupCommand({
      clusterName: "test-cluster",
      nodegroupName: "test-nodegroup",
    }));
    expect(res.nodegroup!.status).toBe("DELETING");
  });

  test("DeleteCluster - with nodegroups fails", async () => {
    // Create a fresh cluster with nodegroup to test
    await eks.send(new CreateClusterCommand({
      name: "ng-cluster",
      roleArn: "arn:aws:iam::000000000000:role/eks-role",
      resourcesVpcConfig: { subnetIds: ["subnet-111"] },
    }));
    await eks.send(new CreateNodegroupCommand({
      clusterName: "ng-cluster",
      nodegroupName: "ng",
      nodeRole: "arn:aws:iam::000000000000:role/node-role",
      subnets: ["subnet-111"],
    }));
    try {
      await eks.send(new DeleteClusterCommand({ name: "ng-cluster" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceInUseException");
    }
    // Cleanup
    await eks.send(new DeleteNodegroupCommand({ clusterName: "ng-cluster", nodegroupName: "ng" }));
    await eks.send(new DeleteClusterCommand({ name: "ng-cluster" }));
  });

  test("DeleteCluster", async () => {
    const res = await eks.send(new DeleteClusterCommand({
      name: "test-cluster",
    }));
    expect(res.cluster!.status).toBe("DELETING");

    const list = await eks.send(new ListClustersCommand({}));
    expect(list.clusters!.includes("test-cluster")).toBe(false);
  });
});
