import { AwsError } from "../../core/errors";

export interface TaggedResource {
  resourceARN: string;
  tags: { Key: string; Value: string }[];
}

export class ResourceGroupsTaggingService {
  private resources = new Map<string, Map<string, string>>();

  constructor(private accountId: string) {}

  tagResources(resourceARNs: string[], tags: Record<string, string>): Record<string, { statusCode: number; errorMessage?: string }> {
    const result: Record<string, { statusCode: number; errorMessage?: string }> = {};
    for (const arn of resourceARNs) {
      if (!this.resources.has(arn)) this.resources.set(arn, new Map());
      const tagMap = this.resources.get(arn)!;
      for (const [key, value] of Object.entries(tags)) tagMap.set(key, value);
      result[arn] = { statusCode: 200 };
    }
    return result;
  }

  untagResources(resourceARNs: string[], tagKeys: string[]): Record<string, { statusCode: number; errorMessage?: string }> {
    const result: Record<string, { statusCode: number; errorMessage?: string }> = {};
    for (const arn of resourceARNs) {
      const tagMap = this.resources.get(arn);
      if (tagMap) {
        for (const key of tagKeys) tagMap.delete(key);
      }
      result[arn] = { statusCode: 200 };
    }
    return result;
  }

  getResources(tagFilters?: { Key: string; Values?: string[] }[]): TaggedResource[] {
    const results: TaggedResource[] = [];
    for (const [arn, tagMap] of this.resources.entries()) {
      const tags = Array.from(tagMap.entries()).map(([Key, Value]) => ({ Key, Value }));
      if (tagFilters?.length) {
        const matches = tagFilters.every((filter) => {
          const tag = tags.find((t) => t.Key === filter.Key);
          if (!tag) return false;
          if (filter.Values?.length && !filter.Values.includes(tag.Value)) return false;
          return true;
        });
        if (!matches) continue;
      }
      results.push({ resourceARN: arn, tags });
    }
    return results;
  }

  getTagKeys(): string[] {
    const keys = new Set<string>();
    for (const tagMap of this.resources.values()) {
      for (const key of tagMap.keys()) keys.add(key);
    }
    return Array.from(keys);
  }

  getTagValues(key: string): string[] {
    const values = new Set<string>();
    for (const tagMap of this.resources.values()) {
      const val = tagMap.get(key);
      if (val) values.add(val);
    }
    return Array.from(values);
  }
}
