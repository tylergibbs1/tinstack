import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Repository {
  repositoryId: string;
  repositoryName: string;
  repositoryDescription?: string;
  arn: string;
  cloneUrlHttp: string;
  cloneUrlSsh: string;
  creationDate: number;
  lastModifiedDate: number;
  branches: Branch[];
  defaultBranchName?: string;
}

export interface Branch {
  branchName: string;
  commitId: string;
}

export class CodeCommitService {
  private repos: StorageBackend<string, Repository>;

  constructor(private accountId: string) {
    this.repos = new InMemoryStorage();
  }

  createRepository(name: string, description: string | undefined, region: string): Repository {
    if (this.repos.get(name)) throw new AwsError("RepositoryNameExistsException", `Repository ${name} already exists.`, 400);
    const repo: Repository = {
      repositoryId: crypto.randomUUID(),
      repositoryName: name,
      repositoryDescription: description,
      arn: buildArn("codecommit", region, this.accountId, "", name),
      cloneUrlHttp: `https://git-codecommit.${region}.amazonaws.com/v1/repos/${name}`,
      cloneUrlSsh: `ssh://git-codecommit.${region}.amazonaws.com/v1/repos/${name}`,
      creationDate: Date.now() / 1000,
      lastModifiedDate: Date.now() / 1000,
      branches: [],
    };
    this.repos.set(name, repo);
    return repo;
  }

  getRepository(name: string): Repository {
    const repo = this.repos.get(name);
    if (!repo) throw new AwsError("RepositoryDoesNotExistException", `Repository ${name} does not exist.`, 400);
    return repo;
  }

  listRepositories(): { name: string; id: string }[] {
    return this.repos.values().map((r) => ({ name: r.repositoryName, id: r.repositoryId }));
  }

  deleteRepository(name: string): string | undefined {
    const repo = this.repos.get(name);
    if (!repo) return undefined;
    this.repos.delete(name);
    return repo.repositoryId;
  }

  createBranch(repoName: string, branchName: string, commitId: string): void {
    const repo = this.getRepository(repoName);
    if (repo.branches.find((b) => b.branchName === branchName)) {
      throw new AwsError("BranchNameExistsException", `Branch ${branchName} already exists.`, 400);
    }
    repo.branches.push({ branchName, commitId });
    if (!repo.defaultBranchName) repo.defaultBranchName = branchName;
  }

  listBranches(repoName: string): string[] {
    return this.getRepository(repoName).branches.map((b) => b.branchName);
  }

  getBranch(repoName: string, branchName: string): Branch {
    const repo = this.getRepository(repoName);
    const branch = repo.branches.find((b) => b.branchName === branchName);
    if (!branch) throw new AwsError("BranchDoesNotExistException", `Branch ${branchName} does not exist.`, 400);
    return branch;
  }
}
