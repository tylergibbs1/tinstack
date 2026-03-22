import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface ResourceGroup {
  groupArn: string;
  name: string;
  description?: string;
  resourceQuery?: { type: string; query: string };
  tags: Record<string, string>;
  createdAt: number;
}

export class ResourceGroupsService {
  private groups: StorageBackend<string, ResourceGroup>;

  constructor(private accountId: string) {
    this.groups = new InMemoryStorage();
  }

  createGroup(name: string, description: string | undefined, resourceQuery: any, tags: Record<string, string> | undefined, region: string): ResourceGroup {
    if (this.groups.get(name)) throw new AwsError("BadRequestException", `Group ${name} already exists.`, 400);
    const group: ResourceGroup = {
      groupArn: buildArn("resource-groups", region, this.accountId, "group/", name),
      name, description, resourceQuery, tags: tags ?? {}, createdAt: Date.now() / 1000,
    };
    this.groups.set(name, group);
    return group;
  }

  getGroup(name: string): ResourceGroup {
    const group = this.groups.get(name);
    if (!group) throw new AwsError("NotFoundException", `Group ${name} not found.`, 404);
    return group;
  }

  listGroups(): ResourceGroup[] {
    return this.groups.values();
  }

  deleteGroup(name: string): ResourceGroup {
    const group = this.getGroup(name);
    this.groups.delete(name);
    return group;
  }

  updateGroup(name: string, description?: string): ResourceGroup {
    const group = this.getGroup(name);
    if (description !== undefined) group.description = description;
    return group;
  }

  tag(arn: string, tags: Record<string, string>): void {
    const group = this.groups.values().find((g) => g.groupArn === arn);
    if (!group) throw new AwsError("NotFoundException", `Resource ${arn} not found.`, 404);
    Object.assign(group.tags, tags);
  }

  untag(arn: string, keys: string[]): void {
    const group = this.groups.values().find((g) => g.groupArn === arn);
    if (!group) throw new AwsError("NotFoundException", `Resource ${arn} not found.`, 404);
    for (const key of keys) delete group.tags[key];
  }

  getTags(arn: string): Record<string, string> {
    const group = this.groups.values().find((g) => g.groupArn === arn);
    if (!group) throw new AwsError("NotFoundException", `Resource ${arn} not found.`, 404);
    return group.tags;
  }
}
