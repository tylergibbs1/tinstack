import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ECRClient,
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
  DeleteRepositoryCommand,
  ListImagesCommand,
  BatchGetImageCommand,
  GetAuthorizationTokenCommand,
  PutImageCommand,
  BatchDeleteImageCommand,
  ListTagsForResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
  PutLifecyclePolicyCommand,
  GetLifecyclePolicyCommand,
  SetRepositoryPolicyCommand,
  GetRepositoryPolicyCommand,
  DescribeImageScanFindingsCommand,
} from "@aws-sdk/client-ecr";
import { startServer, stopServer, clientConfig } from "./helpers";

const ecr = new ECRClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("ECR", () => {
  let repositoryArn: string;
  let repositoryUri: string;

  test("CreateRepository", async () => {
    const res = await ecr.send(new CreateRepositoryCommand({
      repositoryName: "my-app",
      imageTagMutability: "MUTABLE",
      imageScanningConfiguration: { scanOnPush: false },
      tags: [{ Key: "env", Value: "test" }],
    }));
    expect(res.repository).toBeDefined();
    expect(res.repository!.repositoryName).toBe("my-app");
    expect(res.repository!.repositoryUri).toContain("my-app");
    expect(res.repository!.imageTagMutability).toBe("MUTABLE");
    repositoryArn = res.repository!.repositoryArn!;
    repositoryUri = res.repository!.repositoryUri!;
  });

  test("CreateRepository - duplicate fails", async () => {
    try {
      await ecr.send(new CreateRepositoryCommand({ repositoryName: "my-app" }));
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.name).toBe("RepositoryAlreadyExistsException");
    }
  });

  test("DescribeRepositories", async () => {
    const res = await ecr.send(new DescribeRepositoriesCommand({}));
    expect(res.repositories!.length).toBeGreaterThanOrEqual(1);
    expect(res.repositories!.some((r) => r.repositoryName === "my-app")).toBe(true);
  });

  test("DescribeRepositories - by name", async () => {
    const res = await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: ["my-app"] }));
    expect(res.repositories!.length).toBe(1);
    expect(res.repositories![0].repositoryName).toBe("my-app");
  });

  test("GetAuthorizationToken", async () => {
    const res = await ecr.send(new GetAuthorizationTokenCommand({}));
    expect(res.authorizationData).toBeDefined();
    expect(res.authorizationData!.length).toBeGreaterThanOrEqual(1);
    expect(res.authorizationData![0].authorizationToken).toBeDefined();
    expect(res.authorizationData![0].proxyEndpoint).toBeDefined();
  });

  test("PutImage", async () => {
    const res = await ecr.send(new PutImageCommand({
      repositoryName: "my-app",
      imageManifest: JSON.stringify({ schemaVersion: 2, mediaType: "application/vnd.docker.distribution.manifest.v2+json" }),
      imageTag: "latest",
    }));
    expect(res.image).toBeDefined();
    expect(res.image!.imageId!.imageTag).toBe("latest");
    expect(res.image!.imageId!.imageDigest).toBeDefined();
  });

  test("ListImages", async () => {
    const res = await ecr.send(new ListImagesCommand({ repositoryName: "my-app" }));
    expect(res.imageIds!.length).toBeGreaterThanOrEqual(1);
    expect(res.imageIds!.some((i) => i.imageTag === "latest")).toBe(true);
  });

  test("BatchGetImage", async () => {
    const res = await ecr.send(new BatchGetImageCommand({
      repositoryName: "my-app",
      imageIds: [{ imageTag: "latest" }],
    }));
    expect(res.images!.length).toBe(1);
    expect(res.images![0].imageManifest).toBeDefined();
  });

  test("ListTagsForResource", async () => {
    const res = await ecr.send(new ListTagsForResourceCommand({ resourceArn: repositoryArn }));
    expect(res.tags).toBeDefined();
    expect(res.tags!.some((t) => t.Key === "env" && t.Value === "test")).toBe(true);
  });

  test("TagResource", async () => {
    await ecr.send(new TagResourceCommand({
      resourceArn: repositoryArn,
      tags: [{ Key: "team", Value: "backend" }],
    }));
    const res = await ecr.send(new ListTagsForResourceCommand({ resourceArn: repositoryArn }));
    expect(res.tags!.some((t) => t.Key === "team" && t.Value === "backend")).toBe(true);
  });

  test("UntagResource", async () => {
    await ecr.send(new UntagResourceCommand({
      resourceArn: repositoryArn,
      tagKeys: ["team"],
    }));
    const res = await ecr.send(new ListTagsForResourceCommand({ resourceArn: repositoryArn }));
    expect(res.tags!.some((t) => t.Key === "team")).toBe(false);
  });

  test("PutLifecyclePolicy", async () => {
    const policyText = JSON.stringify({
      rules: [{ rulePriority: 1, selection: { tagStatus: "untagged", countType: "imageCountMoreThan", countNumber: 10 }, action: { type: "expire" } }],
    });
    const res = await ecr.send(new PutLifecyclePolicyCommand({
      repositoryName: "my-app",
      lifecyclePolicyText: policyText,
    }));
    expect(res.repositoryName).toBe("my-app");
    expect(res.lifecyclePolicyText).toBe(policyText);
  });

  test("GetLifecyclePolicy", async () => {
    const res = await ecr.send(new GetLifecyclePolicyCommand({ repositoryName: "my-app" }));
    expect(res.repositoryName).toBe("my-app");
    expect(res.lifecyclePolicyText).toBeDefined();
  });

  test("SetRepositoryPolicy", async () => {
    const policy = JSON.stringify({ Version: "2012-10-17", Statement: [] });
    const res = await ecr.send(new SetRepositoryPolicyCommand({
      repositoryName: "my-app",
      policyText: policy,
    }));
    expect(res.repositoryName).toBe("my-app");
    expect(res.policyText).toBe(policy);
  });

  test("GetRepositoryPolicy", async () => {
    const res = await ecr.send(new GetRepositoryPolicyCommand({ repositoryName: "my-app" }));
    expect(res.repositoryName).toBe("my-app");
    expect(res.policyText).toBeDefined();
  });

  test("GetRepositoryPolicy - not found", async () => {
    // Create a repo without a policy
    await ecr.send(new CreateRepositoryCommand({ repositoryName: "no-policy-repo" }));
    try {
      await ecr.send(new GetRepositoryPolicyCommand({ repositoryName: "no-policy-repo" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("RepositoryPolicyNotFoundException");
    }
  });

  test("DescribeImageScanFindings", async () => {
    const images = await ecr.send(new ListImagesCommand({ repositoryName: "my-app" }));
    const imageId = images.imageIds![0];
    const res = await ecr.send(new DescribeImageScanFindingsCommand({
      repositoryName: "my-app",
      imageId,
    }));
    expect(res.imageScanFindings).toBeDefined();
    expect(res.imageScanFindings!.findings).toEqual([]);
  });

  test("BatchDeleteImage", async () => {
    const res = await ecr.send(new BatchDeleteImageCommand({
      repositoryName: "my-app",
      imageIds: [{ imageTag: "latest" }],
    }));
    expect(res.imageIds!.length).toBe(1);
    const list = await ecr.send(new ListImagesCommand({ repositoryName: "my-app" }));
    expect(list.imageIds!.some((i) => i.imageTag === "latest")).toBe(false);
  });

  test("DeleteRepository", async () => {
    const res = await ecr.send(new DeleteRepositoryCommand({ repositoryName: "my-app", force: true }));
    expect(res.repository!.repositoryName).toBe("my-app");

    // Verify it's gone
    try {
      await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: ["my-app"] }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("RepositoryNotFoundException");
    }
  });
});
