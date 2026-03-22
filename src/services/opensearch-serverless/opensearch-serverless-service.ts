import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface AossCollection { id: string; name: string; arn: string; status: string; type: string; }
export interface AossPolicy { name: string; type: string; policy: string; policyVersion: string; }

export class OpenSearchServerlessService {
  private collections: StorageBackend<string, AossCollection>;
  private policies: StorageBackend<string, AossPolicy>;

  constructor(private accountId: string) {
    this.collections = new InMemoryStorage();
    this.policies = new InMemoryStorage();
  }

  createCollection(name: string, type: string): AossCollection {
    const id = crypto.randomUUID().slice(0, 12);
    const c: AossCollection = { id, name, arn: `arn:aws:aoss:us-east-1:${this.accountId}:collection/${id}`, status: "ACTIVE", type: type ?? "SEARCH" };
    this.collections.set(id, c);
    return c;
  }

  batchGetCollection(ids: string[]): AossCollection[] {
    return ids.map((id) => this.collections.get(id)).filter(Boolean) as AossCollection[];
  }

  listCollections(): AossCollection[] { return this.collections.values(); }

  deleteCollection(id: string): void {
    if (!this.collections.has(id)) throw new AwsError("ResourceNotFoundException", `Collection ${id} not found`, 404);
    this.collections.delete(id);
  }

  createSecurityPolicy(name: string, type: string, policy: string): AossPolicy {
    const p: AossPolicy = { name, type, policy, policyVersion: "1" };
    this.policies.set(`${type}:${name}`, p);
    return p;
  }

  getSecurityPolicy(name: string, type: string): AossPolicy {
    const p = this.policies.get(`${type}:${name}`);
    if (!p) throw new AwsError("ResourceNotFoundException", `Policy ${name} not found`, 404);
    return p;
  }

  listSecurityPolicies(type: string): AossPolicy[] {
    return this.policies.values().filter((p) => p.type === type);
  }

  createAccessPolicy(name: string, type: string, policy: string): AossPolicy {
    return this.createSecurityPolicy(name, type, policy);
  }
}
