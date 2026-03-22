import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

interface Directory {
  directoryId: string;
  name: string;
  type: string;
  size: string;
  alias?: string;
  stage: string;
  dnsIpAddrs: string[];
  vpcSettings?: any;
  connectSettings?: any;
  createdDateTime: number;
}

interface ConditionalForwarder { remoteDomainName: string; dnsIpAddrs: string[]; replicationScope: string; }
interface Trust { trustId: string; directoryId: string; remoteDomainName: string; trustType: string; trustDirection: string; trustState: string; createdDateTime: number; }

export class DirectoryServiceService {
  private directories: StorageBackend<string, Directory>;
  private forwarders: StorageBackend<string, ConditionalForwarder>;
  private trusts: StorageBackend<string, Trust>;

  constructor(private accountId: string) {
    this.directories = new InMemoryStorage();
    this.forwarders = new InMemoryStorage();
    this.trusts = new InMemoryStorage();
  }

  createDirectory(name: string, size: string, password: string, vpcSettings: any, region: string): string {
    const id = "d-" + crypto.randomUUID().slice(0, 10);
    this.directories.set(id, {
      directoryId: id, name, type: "SimpleAD", size: size ?? "Small", stage: "Active",
      dnsIpAddrs: ["10.0.0.1", "10.0.0.2"], vpcSettings, createdDateTime: Date.now() / 1000,
    });
    return id;
  }

  createMicrosoftAD(name: string, password: string, edition: string, vpcSettings: any, region: string): string {
    const id = "d-" + crypto.randomUUID().slice(0, 10);
    this.directories.set(id, {
      directoryId: id, name, type: "MicrosoftAD", size: edition ?? "Standard", stage: "Active",
      dnsIpAddrs: ["10.0.0.1", "10.0.0.2"], vpcSettings, createdDateTime: Date.now() / 1000,
    });
    return id;
  }

  connectDirectory(name: string, size: string, password: string, connectSettings: any, region: string): string {
    const id = "d-" + crypto.randomUUID().slice(0, 10);
    this.directories.set(id, {
      directoryId: id, name, type: "ADConnector", size: size ?? "Small", stage: "Active",
      dnsIpAddrs: ["10.0.0.1", "10.0.0.2"], connectSettings, createdDateTime: Date.now() / 1000,
    });
    return id;
  }

  describeDirectories(ids?: string[]): Directory[] {
    const all = this.directories.values();
    if (!ids || ids.length === 0) return all;
    return all.filter((d) => ids.includes(d.directoryId));
  }

  deleteDirectory(id: string): string {
    if (!this.directories.has(id)) throw new AwsError("EntityDoesNotExistException", `Directory ${id} not found.`, 400);
    this.directories.delete(id);
    return id;
  }

  createAlias(directoryId: string, alias: string): { DirectoryId: string; Alias: string } {
    const dir = this.directories.get(directoryId);
    if (!dir) throw new AwsError("EntityDoesNotExistException", `Directory ${directoryId} not found.`, 400);
    dir.alias = alias;
    return { DirectoryId: directoryId, Alias: alias };
  }

  createConditionalForwarder(directoryId: string, remoteDomainName: string, dnsIpAddrs: string[]): void {
    if (!this.directories.has(directoryId)) throw new AwsError("EntityDoesNotExistException", `Directory ${directoryId} not found.`, 400);
    this.forwarders.set(`${directoryId}#${remoteDomainName}`, { remoteDomainName, dnsIpAddrs, replicationScope: "Domain" });
  }

  describeConditionalForwarders(directoryId: string): ConditionalForwarder[] {
    return this.forwarders.values().filter((f) => this.forwarders.has(`${directoryId}#${f.remoteDomainName}`));
  }

  createTrust(directoryId: string, remoteDomainName: string, trustPassword: string, trustDirection: string, trustType: string | undefined): string {
    if (!this.directories.has(directoryId)) throw new AwsError("EntityDoesNotExistException", `Directory ${directoryId} not found.`, 400);
    const trustId = "t-" + crypto.randomUUID().slice(0, 10);
    this.trusts.set(trustId, {
      trustId, directoryId, remoteDomainName, trustType: trustType ?? "Forest",
      trustDirection: trustDirection ?? "One-Way: Outgoing", trustState: "Created", createdDateTime: Date.now() / 1000,
    });
    return trustId;
  }

  describeTrusts(directoryId?: string, trustIds?: string[]): Trust[] {
    let all = this.trusts.values();
    if (directoryId) all = all.filter((t) => t.directoryId === directoryId);
    if (trustIds && trustIds.length > 0) all = all.filter((t) => trustIds.includes(t.trustId));
    return all;
  }
}
