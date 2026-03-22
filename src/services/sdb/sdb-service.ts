import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface SdbDomain {
  name: string;
  items: Map<string, Map<string, string[]>>;
}

export class SimpleDBService {
  private domains: StorageBackend<string, SdbDomain>;

  constructor(private accountId: string) {
    this.domains = new InMemoryStorage();
  }

  createDomain(domainName: string): void {
    if (!this.domains.has(domainName)) {
      this.domains.set(domainName, { name: domainName, items: new Map() });
    }
  }

  listDomains(): string[] {
    return this.domains.values().map((d) => d.name);
  }

  deleteDomain(domainName: string): void {
    this.domains.delete(domainName);
  }

  putAttributes(domainName: string, itemName: string, attributes: { Name: string; Value: string }[]): void {
    const domain = this.domains.get(domainName);
    if (!domain) throw new AwsError("NoSuchDomain", `Domain ${domainName} does not exist`, 400);
    if (!domain.items.has(itemName)) domain.items.set(itemName, new Map());
    const item = domain.items.get(itemName)!;
    for (const attr of attributes) {
      item.set(attr.Name, [attr.Value]);
    }
  }

  getAttributes(domainName: string, itemName: string): { Name: string; Value: string }[] {
    const domain = this.domains.get(domainName);
    if (!domain) throw new AwsError("NoSuchDomain", `Domain ${domainName} does not exist`, 400);
    const item = domain.items.get(itemName);
    if (!item) return [];
    const result: { Name: string; Value: string }[] = [];
    item.forEach((values, name) => { for (const v of values) result.push({ Name: name, Value: v }); });
    return result;
  }

  select(selectExpression: string): { Name: string; Attributes: { Name: string; Value: string }[] }[] {
    // Very minimal: just return all items from the first domain
    const domains = this.domains.values();
    if (domains.length === 0) return [];
    const domain = domains[0];
    const result: { Name: string; Attributes: { Name: string; Value: string }[] }[] = [];
    domain.items.forEach((attrs, itemName) => {
      const attributes: { Name: string; Value: string }[] = [];
      attrs.forEach((values, name) => { for (const v of values) attributes.push({ Name: name, Value: v }); });
      result.push({ Name: itemName, Attributes: attributes });
    });
    return result;
  }
}
