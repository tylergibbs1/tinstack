import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface MqBroker {
  brokerId: string;
  brokerArn: string;
  brokerName: string;
  brokerState: string;
  deploymentMode: string;
  engineType: string;
  engineVersion: string;
  hostInstanceType: string;
  autoMinorVersionUpgrade: boolean;
  publiclyAccessible: boolean;
  securityGroups: string[];
  subnetIds: string[];
  users: MqUser[];
  tags: Record<string, string>;
  configurations: { current?: { id: string; revision: number }; history: any[] };
  logs: { general: boolean; audit?: boolean };
  created: string;
}

export interface MqUser {
  username: string;
  consoleAccess: boolean;
  groups: string[];
}

export interface MqConfiguration {
  configurationId: string;
  configurationArn: string;
  name: string;
  engineType: string;
  engineVersion: string;
  latestRevision: { revision: number; description: string; created: string };
  created: string;
}

export class MqService {
  private brokers: StorageBackend<string, MqBroker>;
  private configurations: StorageBackend<string, MqConfiguration>;
  private tags = new Map<string, Record<string, string>>();

  constructor(
    private accountId: string,
    private region: string,
  ) {
    this.brokers = new InMemoryStorage();
    this.configurations = new InMemoryStorage();
  }

  // --- Brokers ---

  createBroker(params: {
    brokerName: string;
    deploymentMode?: string;
    engineType: string;
    engineVersion: string;
    hostInstanceType: string;
    autoMinorVersionUpgrade?: boolean;
    publiclyAccessible?: boolean;
    securityGroups?: string[];
    subnetIds?: string[];
    users?: Array<{ username: string; password?: string; consoleAccess?: boolean; groups?: string[] }>;
    tags?: Record<string, string>;
    configuration?: { id: string; revision: number };
    logs?: { general?: boolean; audit?: boolean };
  }): { brokerId: string; brokerArn: string } {
    const brokerId = `b-${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;
    const brokerArn = buildArn("mq", this.region, this.accountId, "broker:", brokerId);

    const users: MqUser[] = (params.users ?? []).map((u) => ({
      username: u.username,
      consoleAccess: u.consoleAccess ?? false,
      groups: u.groups ?? [],
    }));

    const broker: MqBroker = {
      brokerId,
      brokerArn,
      brokerName: params.brokerName,
      brokerState: "RUNNING",
      deploymentMode: params.deploymentMode ?? "SINGLE_INSTANCE",
      engineType: params.engineType,
      engineVersion: params.engineVersion,
      hostInstanceType: params.hostInstanceType,
      autoMinorVersionUpgrade: params.autoMinorVersionUpgrade ?? false,
      publiclyAccessible: params.publiclyAccessible ?? false,
      securityGroups: params.securityGroups ?? [],
      subnetIds: params.subnetIds ?? ["default-subnet"],
      users,
      tags: params.tags ?? {},
      configurations: { current: params.configuration, history: [] },
      logs: { general: params.logs?.general ?? false, audit: params.logs?.audit },
      created: new Date().toISOString(),
    };

    this.brokers.set(brokerId, broker);
    if (params.tags) this.tags.set(brokerArn, { ...params.tags });

    return { brokerId, brokerArn };
  }

  describeBroker(brokerId: string): MqBroker {
    const broker = this.brokers.get(brokerId);
    if (!broker) throw new AwsError("NotFoundException", `Broker ${brokerId} does not exist.`, 404);
    return broker;
  }

  listBrokers(): MqBroker[] {
    return this.brokers.values();
  }

  deleteBroker(brokerId: string): void {
    if (!this.brokers.has(brokerId)) {
      throw new AwsError("NotFoundException", `Broker ${brokerId} does not exist.`, 404);
    }
    this.brokers.delete(brokerId);
  }

  updateBroker(brokerId: string, updates: Partial<Pick<MqBroker, "engineVersion" | "hostInstanceType" | "autoMinorVersionUpgrade" | "securityGroups" | "logs">>): MqBroker {
    const broker = this.describeBroker(brokerId);
    if (updates.engineVersion !== undefined) broker.engineVersion = updates.engineVersion;
    if (updates.hostInstanceType !== undefined) broker.hostInstanceType = updates.hostInstanceType;
    if (updates.autoMinorVersionUpgrade !== undefined) broker.autoMinorVersionUpgrade = updates.autoMinorVersionUpgrade;
    if (updates.securityGroups !== undefined) broker.securityGroups = updates.securityGroups;
    if (updates.logs !== undefined) broker.logs = { ...broker.logs, ...updates.logs };
    this.brokers.set(brokerId, broker);
    return broker;
  }

  rebootBroker(brokerId: string): void {
    this.describeBroker(brokerId); // validates existence
  }

  // --- Users ---

  createUser(brokerId: string, username: string, consoleAccess?: boolean, groups?: string[]): void {
    const broker = this.describeBroker(brokerId);
    if (broker.users.some((u) => u.username === username)) {
      throw new AwsError("ConflictException", `User ${username} already exists.`, 409);
    }
    broker.users.push({ username, consoleAccess: consoleAccess ?? false, groups: groups ?? [] });
  }

  listUsers(brokerId: string): MqUser[] {
    return this.describeBroker(brokerId).users;
  }

  describeUser(brokerId: string, username: string): MqUser {
    const broker = this.describeBroker(brokerId);
    const user = broker.users.find((u) => u.username === username);
    if (!user) throw new AwsError("NotFoundException", `User ${username} does not exist.`, 404);
    return user;
  }

  deleteUser(brokerId: string, username: string): void {
    const broker = this.describeBroker(brokerId);
    const idx = broker.users.findIndex((u) => u.username === username);
    if (idx < 0) throw new AwsError("NotFoundException", `User ${username} does not exist.`, 404);
    broker.users.splice(idx, 1);
  }

  // --- Configurations ---

  createConfiguration(params: {
    name: string;
    engineType: string;
    engineVersion: string;
    tags?: Record<string, string>;
  }): MqConfiguration {
    const configId = `c-${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;
    const configArn = buildArn("mq", this.region, this.accountId, "configuration:", configId);
    const now = new Date().toISOString();

    const config: MqConfiguration = {
      configurationId: configId,
      configurationArn: configArn,
      name: params.name,
      engineType: params.engineType,
      engineVersion: params.engineVersion,
      latestRevision: { revision: 1, description: `Auto-generated default for ${params.name}`, created: now },
      created: now,
    };

    this.configurations.set(configId, config);
    if (params.tags) this.tags.set(configArn, { ...params.tags });
    return config;
  }

  describeConfiguration(configId: string): MqConfiguration {
    const config = this.configurations.get(configId);
    if (!config) throw new AwsError("NotFoundException", `Configuration ${configId} does not exist.`, 404);
    return config;
  }

  listConfigurations(): MqConfiguration[] {
    return this.configurations.values();
  }

  updateConfiguration(configId: string, data?: string, description?: string): MqConfiguration {
    const config = this.describeConfiguration(configId);
    config.latestRevision = {
      revision: config.latestRevision.revision + 1,
      description: description ?? "",
      created: new Date().toISOString(),
    };
    this.configurations.set(configId, config);
    return config;
  }

  // --- Tags ---

  createTags(resourceArn: string, tags: Record<string, string>): void {
    const existing = this.tags.get(resourceArn) ?? {};
    this.tags.set(resourceArn, { ...existing, ...tags });
  }

  listTags(resourceArn: string): Record<string, string> {
    return this.tags.get(resourceArn) ?? {};
  }
}
