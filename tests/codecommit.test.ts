import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CodeCommitClient,
  CreateRepositoryCommand,
  GetRepositoryCommand,
  ListRepositoriesCommand,
  DeleteRepositoryCommand,
  CreateBranchCommand,
  ListBranchesCommand,
  GetBranchCommand,
} from "@aws-sdk/client-codecommit";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new CodeCommitClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("CodeCommit", () => {
  const repoName = "test-repo";

  test("CreateRepository", async () => {
    const res = await client.send(new CreateRepositoryCommand({
      repositoryName: repoName,
      repositoryDescription: "A test repo",
    }));
    expect(res.repositoryMetadata).toBeDefined();
    expect(res.repositoryMetadata!.repositoryName).toBe(repoName);
    expect(res.repositoryMetadata!.repositoryId).toBeDefined();
  });

  test("GetRepository", async () => {
    const res = await client.send(new GetRepositoryCommand({ repositoryName: repoName }));
    expect(res.repositoryMetadata!.repositoryName).toBe(repoName);
    expect(res.repositoryMetadata!.repositoryDescription).toBe("A test repo");
  });

  test("ListRepositories", async () => {
    const res = await client.send(new ListRepositoriesCommand({}));
    expect(res.repositories).toBeDefined();
    const found = res.repositories!.find((r) => r.repositoryName === repoName);
    expect(found).toBeDefined();
  });

  test("CreateBranch", async () => {
    await client.send(new CreateBranchCommand({
      repositoryName: repoName,
      branchName: "main",
      commitId: "abc123def456",
    }));
    // No error means success
  });

  test("ListBranches", async () => {
    const res = await client.send(new ListBranchesCommand({ repositoryName: repoName }));
    expect(res.branches).toContain("main");
  });

  test("GetBranch", async () => {
    const res = await client.send(new GetBranchCommand({
      repositoryName: repoName,
      branchName: "main",
    }));
    expect(res.branch!.branchName).toBe("main");
    expect(res.branch!.commitId).toBe("abc123def456");
  });

  test("DeleteRepository", async () => {
    const res = await client.send(new DeleteRepositoryCommand({ repositoryName: repoName }));
    expect(res.repositoryId).toBeDefined();
    const list = await client.send(new ListRepositoriesCommand({}));
    expect(list.repositories!.find((r) => r.repositoryName === repoName)).toBeUndefined();
  });

  test("GetRepository - not found", async () => {
    await expect(
      client.send(new GetRepositoryCommand({ repositoryName: "nonexistent" })),
    ).rejects.toThrow();
  });
});
