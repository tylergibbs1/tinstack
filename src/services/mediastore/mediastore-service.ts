import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface MediaStoreContainer {
  containerARN: string;
  name: string;
  endpoint: string;
  status: string;
  creationTime: number;
  accessLoggingEnabled: boolean;
  policy?: string;
  lifecyclePolicy?: string;
  tags: { Key: string; Value: string }[];
}

export class MediaStoreService {
  private containers: StorageBackend<string, MediaStoreContainer>;

  constructor(private accountId: string) {
    this.containers = new InMemoryStorage();
  }

  createContainer(name: string, tags: { Key: string; Value: string }[] | undefined, region: string): MediaStoreContainer {
    if (this.containers.get(name)) throw new AwsError("ContainerInUseException", `Container ${name} already exists.`, 400);
    const container: MediaStoreContainer = {
      containerARN: buildArn("mediastore", region, this.accountId, "container/", name),
      name,
      endpoint: `https://${crypto.randomUUID().substring(0, 8)}.data.mediastore.${region}.amazonaws.com`,
      status: "ACTIVE",
      creationTime: Date.now() / 1000,
      accessLoggingEnabled: false,
      tags: tags ?? [],
    };
    this.containers.set(name, container);
    return container;
  }

  describeContainer(name: string): MediaStoreContainer {
    const container = this.containers.get(name);
    if (!container) throw new AwsError("ContainerNotFoundException", `Container ${name} not found.`, 404);
    return container;
  }

  listContainers(): MediaStoreContainer[] {
    return this.containers.values();
  }

  deleteContainer(name: string): void {
    if (!this.containers.get(name)) throw new AwsError("ContainerNotFoundException", `Container ${name} not found.`, 404);
    this.containers.delete(name);
  }

  putContainerPolicy(name: string, policy: string): void {
    const container = this.describeContainer(name);
    container.policy = policy;
  }

  getContainerPolicy(name: string): string {
    const container = this.describeContainer(name);
    if (!container.policy) throw new AwsError("PolicyNotFoundException", `No policy for container ${name}.`, 404);
    return container.policy;
  }

  putLifecyclePolicy(name: string, policy: string): void {
    const container = this.describeContainer(name);
    container.lifecyclePolicy = policy;
  }

  getLifecyclePolicy(name: string): string {
    const container = this.describeContainer(name);
    if (!container.lifecyclePolicy) throw new AwsError("PolicyNotFoundException", `No lifecycle policy for container ${name}.`, 404);
    return container.lifecyclePolicy;
  }
}
