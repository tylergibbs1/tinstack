import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface ConnectInstance {
  id: string;
  arn: string;
  identityManagementType: string;
  instanceAlias?: string;
  createdTime: number;
  instanceStatus: string;
  inboundCallsEnabled: boolean;
  outboundCallsEnabled: boolean;
}

export interface ConnectUser {
  id: string;
  arn: string;
  username: string;
  instanceId: string;
  identityInfo?: { firstName?: string; lastName?: string; email?: string };
  phoneConfig?: { phoneType: string; autoAccept?: boolean };
  routingProfileId?: string;
  securityProfileIds: string[];
}

export interface ConnectQueue {
  queueId: string;
  queueArn: string;
  name: string;
  instanceId: string;
  description?: string;
  status: string;
}

export class ConnectService {
  private instances: StorageBackend<string, ConnectInstance>;
  private users: StorageBackend<string, ConnectUser>;
  private queues: StorageBackend<string, ConnectQueue>;

  constructor(private accountId: string) {
    this.instances = new InMemoryStorage();
    this.users = new InMemoryStorage();
    this.queues = new InMemoryStorage();
  }

  createInstance(identityManagementType: string, instanceAlias: string | undefined, inbound: boolean, outbound: boolean, region: string): ConnectInstance {
    const id = crypto.randomUUID();
    const instance: ConnectInstance = {
      id, arn: buildArn("connect", region, this.accountId, "instance/", id),
      identityManagementType: identityManagementType ?? "CONNECT_MANAGED",
      instanceAlias, createdTime: Date.now() / 1000,
      instanceStatus: "ACTIVE",
      inboundCallsEnabled: inbound ?? true,
      outboundCallsEnabled: outbound ?? true,
    };
    this.instances.set(id, instance);
    return instance;
  }

  describeInstance(id: string): ConnectInstance {
    const inst = this.instances.get(id);
    if (!inst) throw new AwsError("ResourceNotFoundException", `Instance ${id} not found.`, 404);
    return inst;
  }

  listInstances(): ConnectInstance[] { return this.instances.values(); }

  deleteInstance(id: string): void {
    if (!this.instances.get(id)) throw new AwsError("ResourceNotFoundException", `Instance ${id} not found.`, 404);
    this.instances.delete(id);
  }

  createUser(instanceId: string, username: string, identityInfo: any, phoneConfig: any, routingProfileId: string | undefined, securityProfileIds: string[], region: string): ConnectUser {
    this.describeInstance(instanceId);
    const id = crypto.randomUUID();
    const user: ConnectUser = {
      id, arn: buildArn("connect", region, this.accountId, `instance/${instanceId}/agent/`, id),
      username, instanceId, identityInfo, phoneConfig,
      routingProfileId, securityProfileIds: securityProfileIds ?? [],
    };
    this.users.set(`${instanceId}|${id}`, user);
    return user;
  }

  describeUser(instanceId: string, userId: string): ConnectUser {
    const user = this.users.get(`${instanceId}|${userId}`);
    if (!user) throw new AwsError("ResourceNotFoundException", `User ${userId} not found.`, 404);
    return user;
  }

  listUsers(instanceId: string): ConnectUser[] {
    return this.users.values().filter((u) => u.instanceId === instanceId);
  }

  deleteUser(instanceId: string, userId: string): void {
    const key = `${instanceId}|${userId}`;
    if (!this.users.get(key)) throw new AwsError("ResourceNotFoundException", `User ${userId} not found.`, 404);
    this.users.delete(key);
  }

  createQueue(instanceId: string, name: string, description: string | undefined, region: string): ConnectQueue {
    this.describeInstance(instanceId);
    const queueId = crypto.randomUUID();
    const queue: ConnectQueue = {
      queueId, queueArn: buildArn("connect", region, this.accountId, `instance/${instanceId}/queue/`, queueId),
      name, instanceId, description, status: "ENABLED",
    };
    this.queues.set(`${instanceId}|${queueId}`, queue);
    return queue;
  }

  listQueues(instanceId: string): ConnectQueue[] {
    return this.queues.values().filter((q) => q.instanceId === instanceId);
  }
}
