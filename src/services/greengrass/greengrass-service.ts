import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface GreenGrassGroup { id: string; arn: string; name: string; creationTimestamp: string; }
export interface CoreDefinition { id: string; arn: string; name: string; }
export interface FunctionDefinition { id: string; arn: string; name: string; }

export class GreengrassService {
  private groups: StorageBackend<string, GreenGrassGroup>;
  private coreDefs: StorageBackend<string, CoreDefinition>;
  private funcDefs: StorageBackend<string, FunctionDefinition>;

  constructor(private accountId: string) {
    this.groups = new InMemoryStorage();
    this.coreDefs = new InMemoryStorage();
    this.funcDefs = new InMemoryStorage();
  }

  createGroup(name: string): GreenGrassGroup {
    const id = crypto.randomUUID();
    const g: GreenGrassGroup = { id, arn: `arn:aws:greengrass:us-east-1:${this.accountId}:/greengrass/groups/${id}`, name, creationTimestamp: new Date().toISOString() };
    this.groups.set(id, g);
    return g;
  }

  getGroup(id: string): GreenGrassGroup {
    const g = this.groups.get(id);
    if (!g) throw new AwsError("NotFoundException", `Group ${id} not found`, 404);
    return g;
  }

  listGroups(): GreenGrassGroup[] { return this.groups.values(); }

  deleteGroup(id: string): void {
    if (!this.groups.has(id)) throw new AwsError("NotFoundException", `Group ${id} not found`, 404);
    this.groups.delete(id);
  }

  createCoreDefinition(name: string): CoreDefinition {
    const id = crypto.randomUUID();
    const cd: CoreDefinition = { id, arn: `arn:aws:greengrass:us-east-1:${this.accountId}:/greengrass/definition/cores/${id}`, name };
    this.coreDefs.set(id, cd);
    return cd;
  }

  listCoreDefinitions(): CoreDefinition[] { return this.coreDefs.values(); }

  createFunctionDefinition(name: string): FunctionDefinition {
    const id = crypto.randomUUID();
    const fd: FunctionDefinition = { id, arn: `arn:aws:greengrass:us-east-1:${this.accountId}:/greengrass/definition/functions/${id}`, name };
    this.funcDefs.set(id, fd);
    return fd;
  }
}
