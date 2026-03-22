import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface EcrRepository {
  repositoryName: string;
  repositoryArn: string;
  registryId: string;
  repositoryUri: string;
  createdAt: number;
  imageTagMutability: string;
  imageScanningConfiguration: { scanOnPush: boolean };
  encryptionConfiguration: { encryptionType: string; kmsKey?: string };
  tags: Record<string, string>;
  images: EcrImage[];
  lifecyclePolicyText?: string;
  policyText?: string;
}

export interface EcrImage {
  imageDigest: string;
  imageTag?: string;
  imageManifest: string;
  pushedAt: number;
}

export class EcrService {
  private repositories: StorageBackend<string, EcrRepository>;

  constructor(private accountId: string) {
    this.repositories = new InMemoryStorage();
  }

  private repoKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createRepository(
    repositoryName: string,
    imageTagMutability: string | undefined,
    imageScanningConfiguration: { scanOnPush?: boolean } | undefined,
    encryptionConfiguration: { encryptionType?: string; kmsKey?: string } | undefined,
    tags: Record<string, string>,
    region: string,
  ): EcrRepository {
    const key = this.repoKey(region, repositoryName);
    if (this.repositories.has(key)) {
      throw new AwsError("RepositoryAlreadyExistsException", `The repository with name '${repositoryName}' already exists in the registry with id '${this.accountId}'`, 400);
    }
    const repo: EcrRepository = {
      repositoryName,
      repositoryArn: buildArn("ecr", region, this.accountId, "repository/", repositoryName),
      registryId: this.accountId,
      repositoryUri: `${this.accountId}.dkr.ecr.${region}.amazonaws.com/${repositoryName}`,
      createdAt: Date.now() / 1000,
      imageTagMutability: imageTagMutability ?? "MUTABLE",
      imageScanningConfiguration: { scanOnPush: imageScanningConfiguration?.scanOnPush ?? false },
      encryptionConfiguration: { encryptionType: encryptionConfiguration?.encryptionType ?? "AES256", kmsKey: encryptionConfiguration?.kmsKey },
      tags,
      images: [],
    };
    this.repositories.set(key, repo);
    return repo;
  }

  describeRepositories(repositoryNames: string[] | undefined, region: string): EcrRepository[] {
    if (repositoryNames && repositoryNames.length > 0) {
      return repositoryNames.map((name) => {
        const repo = this.repositories.get(this.repoKey(region, name));
        if (!repo) throw new AwsError("RepositoryNotFoundException", `The repository with name '${name}' does not exist in the registry with id '${this.accountId}'`, 400);
        return repo;
      });
    }
    return this.repositories.values().filter((r) => r.repositoryArn.includes(`:${region}:`));
  }

  deleteRepository(repositoryName: string, force: boolean, region: string): EcrRepository {
    const key = this.repoKey(region, repositoryName);
    const repo = this.repositories.get(key);
    if (!repo) throw new AwsError("RepositoryNotFoundException", `The repository with name '${repositoryName}' does not exist in the registry with id '${this.accountId}'`, 400);
    if (!force && repo.images.length > 0) {
      throw new AwsError("RepositoryNotEmptyException", `The repository with name '${repositoryName}' is not empty.`, 400);
    }
    this.repositories.delete(key);
    return repo;
  }

  putImage(repositoryName: string, imageManifest: string, imageTag: string | undefined, region: string): EcrImage {
    const key = this.repoKey(region, repositoryName);
    const repo = this.repositories.get(key);
    if (!repo) throw new AwsError("RepositoryNotFoundException", `The repository with name '${repositoryName}' does not exist in the registry with id '${this.accountId}'`, 400);

    const digest = `sha256:${crypto.randomUUID().replace(/-/g, "")}`;
    const image: EcrImage = {
      imageDigest: digest,
      imageTag,
      imageManifest,
      pushedAt: Date.now() / 1000,
    };

    // If tag mutability is IMMUTABLE, check for duplicate tags
    if (repo.imageTagMutability === "IMMUTABLE" && imageTag) {
      const existing = repo.images.find((i) => i.imageTag === imageTag);
      if (existing) {
        throw new AwsError("ImageTagAlreadyExistsException", `The image tag '${imageTag}' already exists in the repository.`, 400);
      }
    }

    // Replace existing image with same tag if MUTABLE
    if (imageTag) {
      const idx = repo.images.findIndex((i) => i.imageTag === imageTag);
      if (idx >= 0) repo.images.splice(idx, 1);
    }

    repo.images.push(image);
    return image;
  }

  listImages(repositoryName: string, region: string): { imageDigest: string; imageTag?: string }[] {
    const key = this.repoKey(region, repositoryName);
    const repo = this.repositories.get(key);
    if (!repo) throw new AwsError("RepositoryNotFoundException", `The repository with name '${repositoryName}' does not exist in the registry with id '${this.accountId}'`, 400);
    return repo.images.map((i) => ({ imageDigest: i.imageDigest, imageTag: i.imageTag }));
  }

  batchGetImage(repositoryName: string, imageIds: { imageDigest?: string; imageTag?: string }[], region: string): { images: any[]; failures: any[] } {
    const key = this.repoKey(region, repositoryName);
    const repo = this.repositories.get(key);
    if (!repo) throw new AwsError("RepositoryNotFoundException", `The repository with name '${repositoryName}' does not exist in the registry with id '${this.accountId}'`, 400);

    const images: any[] = [];
    const failures: any[] = [];

    for (const id of imageIds) {
      const found = repo.images.find((i) => {
        if (id.imageDigest && i.imageDigest === id.imageDigest) return true;
        if (id.imageTag && i.imageTag === id.imageTag) return true;
        return false;
      });
      if (found) {
        images.push({
          registryId: this.accountId,
          repositoryName,
          imageId: { imageDigest: found.imageDigest, imageTag: found.imageTag },
          imageManifest: found.imageManifest,
        });
      } else {
        failures.push({
          imageId: id,
          failureCode: "ImageNotFound",
          failureReason: "Requested image not found",
        });
      }
    }

    return { images, failures };
  }

  batchDeleteImage(repositoryName: string, imageIds: { imageDigest?: string; imageTag?: string }[], region: string): { imageIds: any[]; failures: any[] } {
    const key = this.repoKey(region, repositoryName);
    const repo = this.repositories.get(key);
    if (!repo) throw new AwsError("RepositoryNotFoundException", `The repository with name '${repositoryName}' does not exist in the registry with id '${this.accountId}'`, 400);

    const deleted: any[] = [];
    const failures: any[] = [];

    for (const id of imageIds) {
      const idx = repo.images.findIndex((i) => {
        if (id.imageDigest && i.imageDigest === id.imageDigest) return true;
        if (id.imageTag && i.imageTag === id.imageTag) return true;
        return false;
      });
      if (idx >= 0) {
        const img = repo.images.splice(idx, 1)[0];
        deleted.push({ imageDigest: img.imageDigest, imageTag: img.imageTag });
      } else {
        failures.push({ imageId: id, failureCode: "ImageNotFound", failureReason: "Requested image not found" });
      }
    }

    return { imageIds: deleted, failures };
  }

  getAuthorizationToken(region: string): { authorizationData: any[] } {
    const token = Buffer.from("AWS:tinstack-token").toString("base64");
    const expiresAt = Date.now() / 1000 + 43200; // 12 hours
    return {
      authorizationData: [
        {
          authorizationToken: token,
          expiresAt,
          proxyEndpoint: `https://${this.accountId}.dkr.ecr.${region}.amazonaws.com`,
        },
      ],
    };
  }

  listTagsForResource(resourceArn: string, region: string): { Key: string; Value: string }[] {
    const repo = this.findRepoByArn(resourceArn, region);
    return Object.entries(repo.tags).map(([Key, Value]) => ({ Key, Value }));
  }

  tagResource(resourceArn: string, tags: { Key: string; Value: string }[], region: string): void {
    const repo = this.findRepoByArn(resourceArn, region);
    for (const t of tags) repo.tags[t.Key] = t.Value;
  }

  untagResource(resourceArn: string, tagKeys: string[], region: string): void {
    const repo = this.findRepoByArn(resourceArn, region);
    for (const k of tagKeys) delete repo.tags[k];
  }

  putLifecyclePolicy(repositoryName: string, lifecyclePolicyText: string, region: string): { repositoryName: string; lifecyclePolicyText: string; registryId: string } {
    const key = this.repoKey(region, repositoryName);
    const repo = this.repositories.get(key);
    if (!repo) throw new AwsError("RepositoryNotFoundException", `The repository with name '${repositoryName}' does not exist in the registry with id '${this.accountId}'`, 400);
    repo.lifecyclePolicyText = lifecyclePolicyText;
    return { repositoryName, lifecyclePolicyText, registryId: this.accountId };
  }

  getLifecyclePolicy(repositoryName: string, region: string): { repositoryName: string; lifecyclePolicyText: string; registryId: string } {
    const key = this.repoKey(region, repositoryName);
    const repo = this.repositories.get(key);
    if (!repo) throw new AwsError("RepositoryNotFoundException", `The repository with name '${repositoryName}' does not exist in the registry with id '${this.accountId}'`, 400);
    if (!repo.lifecyclePolicyText) throw new AwsError("LifecyclePolicyNotFoundException", `Lifecycle policy does not exist for the repository with name '${repositoryName}'`, 400);
    return { repositoryName, lifecyclePolicyText: repo.lifecyclePolicyText, registryId: this.accountId };
  }

  setRepositoryPolicy(repositoryName: string, policyText: string, region: string): { repositoryName: string; policyText: string; registryId: string } {
    const key = this.repoKey(region, repositoryName);
    const repo = this.repositories.get(key);
    if (!repo) throw new AwsError("RepositoryNotFoundException", `The repository with name '${repositoryName}' does not exist in the registry with id '${this.accountId}'`, 400);
    repo.policyText = policyText;
    return { repositoryName, policyText, registryId: this.accountId };
  }

  getRepositoryPolicy(repositoryName: string, region: string): { repositoryName: string; policyText: string; registryId: string } {
    const key = this.repoKey(region, repositoryName);
    const repo = this.repositories.get(key);
    if (!repo) throw new AwsError("RepositoryNotFoundException", `The repository with name '${repositoryName}' does not exist in the registry with id '${this.accountId}'`, 400);
    if (!repo.policyText) throw new AwsError("RepositoryPolicyNotFoundException", `Repository policy does not exist for the repository with name '${repositoryName}'`, 400);
    return { repositoryName, policyText: repo.policyText, registryId: this.accountId };
  }

  describeImageScanFindings(repositoryName: string, _imageId: any, region: string): any {
    const key = this.repoKey(region, repositoryName);
    const repo = this.repositories.get(key);
    if (!repo) throw new AwsError("RepositoryNotFoundException", `The repository with name '${repositoryName}' does not exist in the registry with id '${this.accountId}'`, 400);
    return {
      repositoryName,
      registryId: this.accountId,
      imageScanFindings: { findings: [], findingSeverityCounts: {} },
      imageScanStatus: { status: "COMPLETE", description: "The scan was completed successfully." },
    };
  }

  private findRepoByArn(arn: string, region: string): EcrRepository {
    for (const repo of this.repositories.values()) {
      if (repo.repositoryArn === arn) return repo;
    }
    throw new AwsError("RepositoryNotFoundException", `The repository with ARN '${arn}' does not exist.`, 400);
  }
}
