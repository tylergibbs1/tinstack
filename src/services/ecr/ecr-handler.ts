import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { EcrService } from "./ecr-service";

export class EcrHandler {
  constructor(private service: EcrService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateRepository": return this.createRepository(body, ctx);
        case "DescribeRepositories": return this.describeRepositories(body, ctx);
        case "DeleteRepository": return this.deleteRepository(body, ctx);
        case "ListImages": return this.listImages(body, ctx);
        case "BatchGetImage": return this.batchGetImage(body, ctx);
        case "GetAuthorizationToken": return this.getAuthorizationToken(body, ctx);
        case "PutImage": return this.putImage(body, ctx);
        case "BatchDeleteImage": return this.batchDeleteImage(body, ctx);
        case "ListTagsForResource": return this.listTagsForResource(body, ctx);
        case "TagResource": return this.tagResource(body, ctx);
        case "UntagResource": return this.untagResource(body, ctx);
        case "PutLifecyclePolicy": return this.putLifecyclePolicy(body, ctx);
        case "GetLifecyclePolicy": return this.getLifecyclePolicy(body, ctx);
        case "GetRepositoryPolicy": return this.getRepositoryPolicy(body, ctx);
        case "SetRepositoryPolicy": return this.setRepositoryPolicy(body, ctx);
        case "DescribeImageScanFindings": return this.describeImageScanFindings(body, ctx);
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

  private repoJson(repo: any): any {
    return {
      repositoryArn: repo.repositoryArn,
      registryId: repo.registryId,
      repositoryName: repo.repositoryName,
      repositoryUri: repo.repositoryUri,
      createdAt: repo.createdAt,
      imageTagMutability: repo.imageTagMutability,
      imageScanningConfiguration: repo.imageScanningConfiguration,
      encryptionConfiguration: repo.encryptionConfiguration,
    };
  }

  private createRepository(body: any, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    if (body.tags) for (const t of body.tags) tags[t.Key] = t.Value;
    const repo = this.service.createRepository(
      body.repositoryName,
      body.imageTagMutability,
      body.imageScanningConfiguration,
      body.encryptionConfiguration,
      tags,
      ctx.region,
    );
    return this.json({ repository: this.repoJson(repo) }, ctx);
  }

  private describeRepositories(body: any, ctx: RequestContext): Response {
    const repos = this.service.describeRepositories(body.repositoryNames, ctx.region);
    return this.json({ repositories: repos.map((r) => this.repoJson(r)) }, ctx);
  }

  private deleteRepository(body: any, ctx: RequestContext): Response {
    const repo = this.service.deleteRepository(body.repositoryName, body.force ?? false, ctx.region);
    return this.json({ repository: this.repoJson(repo) }, ctx);
  }

  private listImages(body: any, ctx: RequestContext): Response {
    const imageIds = this.service.listImages(body.repositoryName, ctx.region);
    return this.json({ imageIds }, ctx);
  }

  private batchGetImage(body: any, ctx: RequestContext): Response {
    const result = this.service.batchGetImage(body.repositoryName, body.imageIds ?? [], ctx.region);
    return this.json(result, ctx);
  }

  private getAuthorizationToken(_body: any, ctx: RequestContext): Response {
    const result = this.service.getAuthorizationToken(ctx.region);
    return this.json(result, ctx);
  }

  private putImage(body: any, ctx: RequestContext): Response {
    const image = this.service.putImage(body.repositoryName, body.imageManifest, body.imageTag, ctx.region);
    return this.json({
      image: {
        registryId: ctx.accountId,
        repositoryName: body.repositoryName,
        imageId: { imageDigest: image.imageDigest, imageTag: image.imageTag },
        imageManifest: image.imageManifest,
      },
    }, ctx);
  }

  private batchDeleteImage(body: any, ctx: RequestContext): Response {
    const result = this.service.batchDeleteImage(body.repositoryName, body.imageIds ?? [], ctx.region);
    return this.json(result, ctx);
  }

  private listTagsForResource(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTagsForResource(body.resourceArn, ctx.region);
    return this.json({ tags }, ctx);
  }

  private tagResource(body: any, ctx: RequestContext): Response {
    const tags = body.tags ?? [];
    this.service.tagResource(body.resourceArn, tags, ctx.region);
    return this.json({}, ctx);
  }

  private untagResource(body: any, ctx: RequestContext): Response {
    this.service.untagResource(body.resourceArn, body.tagKeys ?? [], ctx.region);
    return this.json({}, ctx);
  }

  private putLifecyclePolicy(body: any, ctx: RequestContext): Response {
    const result = this.service.putLifecyclePolicy(body.repositoryName, body.lifecyclePolicyText, ctx.region);
    return this.json(result, ctx);
  }

  private getLifecyclePolicy(body: any, ctx: RequestContext): Response {
    const result = this.service.getLifecyclePolicy(body.repositoryName, ctx.region);
    return this.json(result, ctx);
  }

  private getRepositoryPolicy(body: any, ctx: RequestContext): Response {
    const result = this.service.getRepositoryPolicy(body.repositoryName, ctx.region);
    return this.json(result, ctx);
  }

  private setRepositoryPolicy(body: any, ctx: RequestContext): Response {
    const result = this.service.setRepositoryPolicy(body.repositoryName, body.policyText, ctx.region);
    return this.json(result, ctx);
  }

  private describeImageScanFindings(body: any, ctx: RequestContext): Response {
    const result = this.service.describeImageScanFindings(body.repositoryName, body.imageId, ctx.region);
    return this.json(result, ctx);
  }
}
