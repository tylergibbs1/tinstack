import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface TransferServer {
  serverId: string;
  arn: string;
  domain: string;
  endpointType: string;
  identityProviderType: string;
  loggingRole?: string;
  protocols: string[];
  securityPolicyName: string;
  state: string;
  tags: Array<{ Key: string; Value: string }>;
  userCount: number;
  users: TransferUser[];
}

export interface TransferUser {
  userName: string;
  serverId: string;
  arn: string;
  homeDirectory?: string;
  homeDirectoryType: string;
  role: string;
  tags: Array<{ Key: string; Value: string }>;
}

export class TransferService {
  private servers: StorageBackend<string, TransferServer>;
  private tagStore = new Map<string, Array<{ Key: string; Value: string }>>();

  constructor(
    private accountId: string,
    private region: string,
  ) {
    this.servers = new InMemoryStorage();
  }

  // --- Servers ---

  createServer(params: {
    domain?: string;
    endpointType?: string;
    identityProviderType?: string;
    loggingRole?: string;
    protocols?: string[];
    securityPolicyName?: string;
    tags?: Array<{ Key: string; Value: string }>;
  }): string {
    const serverId = `s-${crypto.randomUUID().replace(/-/g, "").substring(0, 17)}`;
    const arn = `arn:aws:transfer:${this.region}:${this.accountId}:server/${serverId}`;

    const server: TransferServer = {
      serverId,
      arn,
      domain: params.domain ?? "S3",
      endpointType: params.endpointType ?? "PUBLIC",
      identityProviderType: params.identityProviderType ?? "SERVICE_MANAGED",
      loggingRole: params.loggingRole,
      protocols: params.protocols ?? ["SFTP"],
      securityPolicyName: params.securityPolicyName ?? "TransferSecurityPolicy-2018-11",
      state: "ONLINE",
      tags: params.tags ?? [],
      userCount: 0,
      users: [],
    };

    this.servers.set(serverId, server);
    if (params.tags?.length) this.tagStore.set(arn, [...params.tags]);
    return serverId;
  }

  describeServer(serverId: string): TransferServer {
    const server = this.servers.get(serverId);
    if (!server) throw new AwsError("ResourceNotFoundException", `Server ${serverId} does not exist.`, 404);
    return server;
  }

  listServers(): TransferServer[] {
    return this.servers.values();
  }

  updateServer(serverId: string, updates: {
    endpointType?: string;
    loggingRole?: string;
    protocols?: string[];
    securityPolicyName?: string;
  }): string {
    const server = this.describeServer(serverId);
    if (updates.endpointType !== undefined) server.endpointType = updates.endpointType;
    if (updates.loggingRole !== undefined) server.loggingRole = updates.loggingRole;
    if (updates.protocols !== undefined) server.protocols = updates.protocols;
    if (updates.securityPolicyName !== undefined) server.securityPolicyName = updates.securityPolicyName;
    this.servers.set(serverId, server);
    return serverId;
  }

  deleteServer(serverId: string): void {
    if (!this.servers.has(serverId)) {
      throw new AwsError("ResourceNotFoundException", `Server ${serverId} does not exist.`, 404);
    }
    this.servers.delete(serverId);
  }

  startServer(serverId: string): void {
    const server = this.describeServer(serverId);
    server.state = "ONLINE";
    this.servers.set(serverId, server);
  }

  stopServer(serverId: string): void {
    const server = this.describeServer(serverId);
    server.state = "OFFLINE";
    this.servers.set(serverId, server);
  }

  // --- Users ---

  createUser(params: {
    serverId: string;
    userName: string;
    homeDirectory?: string;
    homeDirectoryType?: string;
    role: string;
    tags?: Array<{ Key: string; Value: string }>;
  }): { serverId: string; userName: string } {
    const server = this.describeServer(params.serverId);
    if (server.users.some((u) => u.userName === params.userName)) {
      throw new AwsError("ResourceExistsException", `User ${params.userName} already exists.`, 409);
    }

    const user: TransferUser = {
      userName: params.userName,
      serverId: params.serverId,
      arn: `arn:aws:transfer:${this.region}:${this.accountId}:user/${params.serverId}/${params.userName}`,
      homeDirectory: params.homeDirectory,
      homeDirectoryType: params.homeDirectoryType ?? "PATH",
      role: params.role,
      tags: params.tags ?? [],
    };

    server.users.push(user);
    server.userCount++;
    this.servers.set(params.serverId, server);
    return { serverId: params.serverId, userName: params.userName };
  }

  describeUser(serverId: string, userName: string): TransferUser {
    const server = this.describeServer(serverId);
    const user = server.users.find((u) => u.userName === userName);
    if (!user) throw new AwsError("ResourceNotFoundException", `User ${userName} does not exist.`, 404);
    return user;
  }

  listUsers(serverId: string): TransferUser[] {
    return this.describeServer(serverId).users;
  }

  updateUser(serverId: string, userName: string, updates: {
    homeDirectory?: string;
    homeDirectoryType?: string;
    role?: string;
  }): { serverId: string; userName: string } {
    const user = this.describeUser(serverId, userName);
    if (updates.homeDirectory !== undefined) user.homeDirectory = updates.homeDirectory;
    if (updates.homeDirectoryType !== undefined) user.homeDirectoryType = updates.homeDirectoryType;
    if (updates.role !== undefined) user.role = updates.role;
    return { serverId, userName };
  }

  deleteUser(serverId: string, userName: string): void {
    const server = this.describeServer(serverId);
    const idx = server.users.findIndex((u) => u.userName === userName);
    if (idx < 0) throw new AwsError("ResourceNotFoundException", `User ${userName} does not exist.`, 404);
    server.users.splice(idx, 1);
    server.userCount--;
  }

  // --- Tags ---

  tagResource(arn: string, tags: Array<{ Key: string; Value: string }>): void {
    const existing = this.tagStore.get(arn) ?? [];
    for (const tag of tags) {
      const idx = existing.findIndex((t) => t.Key === tag.Key);
      if (idx >= 0) {
        existing[idx] = tag;
      } else {
        existing.push(tag);
      }
    }
    this.tagStore.set(arn, existing);
    // Also update server/user tags
    const server = this.servers.values().find((s) => s.arn === arn);
    if (server) server.tags = [...existing];
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.tagStore.get(arn);
    if (existing) {
      const keysSet = new Set(tagKeys);
      const filtered = existing.filter((t) => !keysSet.has(t.Key));
      this.tagStore.set(arn, filtered);
      const server = this.servers.values().find((s) => s.arn === arn);
      if (server) server.tags = [...filtered];
    }
  }

  listTagsForResource(arn: string): Array<{ Key: string; Value: string }> {
    return this.tagStore.get(arn) ?? [];
  }
}
