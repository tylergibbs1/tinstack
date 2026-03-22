import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CodeCommitService } from "./codecommit-service";

export class CodeCommitHandler {
  constructor(private service: CodeCommitService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateRepository": {
          const repo = this.service.createRepository(body.repositoryName, body.repositoryDescription, ctx.region);
          return this.json({ repositoryMetadata: this.repoToJson(repo) }, ctx);
        }
        case "GetRepository": {
          const repo = this.service.getRepository(body.repositoryName);
          return this.json({ repositoryMetadata: this.repoToJson(repo) }, ctx);
        }
        case "ListRepositories": {
          const repos = this.service.listRepositories();
          return this.json({ repositories: repos.map((r) => ({ repositoryName: r.name, repositoryId: r.id })) }, ctx);
        }
        case "DeleteRepository": {
          const id = this.service.deleteRepository(body.repositoryName);
          return this.json({ repositoryId: id }, ctx);
        }
        case "CreateBranch": {
          this.service.createBranch(body.repositoryName, body.branchName, body.commitId);
          return this.json({}, ctx);
        }
        case "ListBranches": {
          const branches = this.service.listBranches(body.repositoryName);
          return this.json({ branches }, ctx);
        }
        case "GetBranch": {
          const branch = this.service.getBranch(body.repositoryName, body.branchName);
          return this.json({ branch: { branchName: branch.branchName, commitId: branch.commitId } }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private repoToJson(repo: any): any {
    return {
      repositoryId: repo.repositoryId,
      repositoryName: repo.repositoryName,
      repositoryDescription: repo.repositoryDescription,
      Arn: repo.arn,
      cloneUrlHttp: repo.cloneUrlHttp,
      cloneUrlSsh: repo.cloneUrlSsh,
      creationDate: repo.creationDate,
      lastModifiedDate: repo.lastModifiedDate,
      defaultBranch: repo.defaultBranchName,
    };
  }
}
