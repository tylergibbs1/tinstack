import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface ReplicationInstance {
  replicationInstanceIdentifier: string;
  replicationInstanceArn: string;
  replicationInstanceClass: string;
  replicationInstanceStatus: string;
  allocatedStorage: number;
  engineVersion: string;
  multiAZ: boolean;
  publiclyAccessible: boolean;
  createdAt: number;
  tags: { Key: string; Value: string }[];
}

export interface ReplicationTask {
  replicationTaskIdentifier: string;
  replicationTaskArn: string;
  sourceEndpointArn: string;
  targetEndpointArn: string;
  replicationInstanceArn: string;
  migrationType: string;
  tableMappings: string;
  replicationTaskSettings: string;
  status: string;
  createdAt: number;
  tags: { Key: string; Value: string }[];
}

export interface DmsEndpoint {
  endpointIdentifier: string;
  endpointArn: string;
  endpointType: string;
  engineName: string;
  serverName: string;
  port: number;
  databaseName: string;
  username: string;
  status: string;
  sslMode: string;
  tags: { Key: string; Value: string }[];
}

export interface DmsConnection {
  replicationInstanceArn: string;
  endpointArn: string;
  status: string;
  endpointIdentifier: string;
  replicationInstanceIdentifier: string;
}

export class DmsService {
  private instances: StorageBackend<string, ReplicationInstance>;
  private tasks: StorageBackend<string, ReplicationTask>;
  private endpoints: StorageBackend<string, DmsEndpoint>;
  private connections: DmsConnection[] = [];

  constructor(private accountId: string) {
    this.instances = new InMemoryStorage();
    this.tasks = new InMemoryStorage();
    this.endpoints = new InMemoryStorage();
  }

  createReplicationInstance(
    identifier: string,
    instanceClass: string,
    allocatedStorage: number | undefined,
    engineVersion: string | undefined,
    multiAZ: boolean | undefined,
    publiclyAccessible: boolean | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): ReplicationInstance {
    const arn = buildArn("dms", region, this.accountId, "rep:", identifier);
    if (this.instances.has(arn)) {
      throw new AwsError("ResourceAlreadyExistsFault", `Replication instance ${identifier} already exists.`, 400);
    }

    const inst: ReplicationInstance = {
      replicationInstanceIdentifier: identifier,
      replicationInstanceArn: arn,
      replicationInstanceClass: instanceClass,
      replicationInstanceStatus: "available",
      allocatedStorage: allocatedStorage ?? 50,
      engineVersion: engineVersion ?? "3.4.7",
      multiAZ: multiAZ ?? false,
      publiclyAccessible: publiclyAccessible ?? true,
      createdAt: Date.now() / 1000,
      tags: tags ?? [],
    };
    this.instances.set(arn, inst);
    return inst;
  }

  describeReplicationInstances(filters?: { Name: string; Values: string[] }[]): ReplicationInstance[] {
    let result = this.instances.values();
    if (filters) {
      for (const f of filters) {
        if (f.Name === "replication-instance-id") {
          result = result.filter((i) => f.Values.includes(i.replicationInstanceIdentifier));
        }
      }
    }
    return result;
  }

  deleteReplicationInstance(arn: string): ReplicationInstance {
    const inst = this.instances.get(arn);
    if (!inst) throw new AwsError("ResourceNotFoundFault", `Replication instance ${arn} not found.`, 400);
    this.instances.delete(arn);
    inst.replicationInstanceStatus = "deleting";
    return inst;
  }

  createEndpoint(
    identifier: string,
    endpointType: string,
    engineName: string,
    serverName: string | undefined,
    port: number | undefined,
    databaseName: string | undefined,
    username: string | undefined,
    sslMode: string | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): DmsEndpoint {
    const arn = buildArn("dms", region, this.accountId, "endpoint:", identifier);
    if (this.endpoints.has(arn)) {
      throw new AwsError("ResourceAlreadyExistsFault", `Endpoint ${identifier} already exists.`, 400);
    }

    const ep: DmsEndpoint = {
      endpointIdentifier: identifier,
      endpointArn: arn,
      endpointType: endpointType.toLowerCase() === "source" ? "SOURCE" : "TARGET",
      engineName: engineName ?? "mysql",
      serverName: serverName ?? "localhost",
      port: port ?? 3306,
      databaseName: databaseName ?? "",
      username: username ?? "",
      status: "active",
      sslMode: sslMode ?? "none",
      tags: tags ?? [],
    };
    this.endpoints.set(arn, ep);
    return ep;
  }

  describeEndpoints(filters?: { Name: string; Values: string[] }[]): DmsEndpoint[] {
    let result = this.endpoints.values();
    if (filters) {
      for (const f of filters) {
        if (f.Name === "endpoint-id") {
          result = result.filter((e) => f.Values.includes(e.endpointIdentifier));
        }
        if (f.Name === "endpoint-arn") {
          result = result.filter((e) => f.Values.includes(e.endpointArn));
        }
      }
    }
    return result;
  }

  deleteEndpoint(arn: string): DmsEndpoint {
    const ep = this.endpoints.get(arn);
    if (!ep) throw new AwsError("ResourceNotFoundFault", `Endpoint ${arn} not found.`, 400);
    this.endpoints.delete(arn);
    return ep;
  }

  modifyEndpoint(
    arn: string,
    engineName?: string,
    serverName?: string,
    port?: number,
    databaseName?: string,
    username?: string,
    sslMode?: string,
  ): DmsEndpoint {
    const ep = this.endpoints.get(arn);
    if (!ep) throw new AwsError("ResourceNotFoundFault", `Endpoint ${arn} not found.`, 400);
    if (engineName !== undefined) ep.engineName = engineName;
    if (serverName !== undefined) ep.serverName = serverName;
    if (port !== undefined) ep.port = port;
    if (databaseName !== undefined) ep.databaseName = databaseName;
    if (username !== undefined) ep.username = username;
    if (sslMode !== undefined) ep.sslMode = sslMode;
    return ep;
  }

  createReplicationTask(
    identifier: string,
    sourceEndpointArn: string,
    targetEndpointArn: string,
    replicationInstanceArn: string,
    migrationType: string,
    tableMappings: string,
    replicationTaskSettings: string | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): ReplicationTask {
    const arn = buildArn("dms", region, this.accountId, "task:", identifier);
    if (this.tasks.has(arn)) {
      throw new AwsError("ResourceAlreadyExistsFault", `Replication task ${identifier} already exists.`, 400);
    }

    const task: ReplicationTask = {
      replicationTaskIdentifier: identifier,
      replicationTaskArn: arn,
      sourceEndpointArn,
      targetEndpointArn,
      replicationInstanceArn,
      migrationType,
      tableMappings,
      replicationTaskSettings: replicationTaskSettings ?? "{}",
      status: "ready",
      createdAt: Date.now() / 1000,
      tags: tags ?? [],
    };
    this.tasks.set(arn, task);
    return task;
  }

  describeReplicationTasks(filters?: { Name: string; Values: string[] }[]): ReplicationTask[] {
    let result = this.tasks.values();
    if (filters) {
      for (const f of filters) {
        if (f.Name === "replication-task-id") {
          result = result.filter((t) => f.Values.includes(t.replicationTaskIdentifier));
        }
        if (f.Name === "replication-task-arn") {
          result = result.filter((t) => f.Values.includes(t.replicationTaskArn));
        }
      }
    }
    return result;
  }

  deleteReplicationTask(arn: string): ReplicationTask {
    const task = this.tasks.get(arn);
    if (!task) throw new AwsError("ResourceNotFoundFault", `Replication task ${arn} not found.`, 400);
    this.tasks.delete(arn);
    task.status = "deleting";
    return task;
  }

  startReplicationTask(arn: string, startType: string | undefined): ReplicationTask {
    const task = this.tasks.get(arn);
    if (!task) throw new AwsError("ResourceNotFoundFault", `Replication task ${arn} not found.`, 400);
    task.status = "running";
    return task;
  }

  stopReplicationTask(arn: string): ReplicationTask {
    const task = this.tasks.get(arn);
    if (!task) throw new AwsError("ResourceNotFoundFault", `Replication task ${arn} not found.`, 400);
    if (task.status !== "running") {
      throw new AwsError("InvalidResourceStateFault", `Task ${arn} is not running.`, 400);
    }
    task.status = "stopped";
    return task;
  }

  testConnection(replicationInstanceArn: string, endpointArn: string): DmsConnection {
    const inst = this.instances.get(replicationInstanceArn);
    if (!inst) throw new AwsError("ResourceNotFoundFault", `Replication instance ${replicationInstanceArn} not found.`, 400);
    const ep = this.endpoints.get(endpointArn);
    if (!ep) throw new AwsError("ResourceNotFoundFault", `Endpoint ${endpointArn} not found.`, 400);

    const conn: DmsConnection = {
      replicationInstanceArn,
      endpointArn,
      status: "successful",
      endpointIdentifier: ep.endpointIdentifier,
      replicationInstanceIdentifier: inst.replicationInstanceIdentifier,
    };
    this.connections.push(conn);
    return conn;
  }

  describeConnections(filters?: { Name: string; Values: string[] }[]): DmsConnection[] {
    let result = [...this.connections];
    if (filters) {
      for (const f of filters) {
        if (f.Name === "endpoint-arn") {
          result = result.filter((c) => f.Values.includes(c.endpointArn));
        }
        if (f.Name === "replication-instance-arn") {
          result = result.filter((c) => f.Values.includes(c.replicationInstanceArn));
        }
      }
    }
    return result;
  }

  addTagsToResource(arn: string, tags: { Key: string; Value: string }[]): void {
    const resource = this.resolveResource(arn);
    if (!resource) throw new AwsError("ResourceNotFoundFault", `Resource ${arn} not found.`, 400);
    for (const tag of tags) {
      const existing = resource.tags.find((t) => t.Key === tag.Key);
      if (existing) existing.Value = tag.Value;
      else resource.tags.push(tag);
    }
  }

  listTagsForResource(arn: string): { Key: string; Value: string }[] {
    const resource = this.resolveResource(arn);
    if (!resource) throw new AwsError("ResourceNotFoundFault", `Resource ${arn} not found.`, 400);
    return resource.tags;
  }

  removeTagsFromResource(arn: string, tagKeys: string[]): void {
    const resource = this.resolveResource(arn);
    if (!resource) throw new AwsError("ResourceNotFoundFault", `Resource ${arn} not found.`, 400);
    resource.tags = resource.tags.filter((t) => !tagKeys.includes(t.Key));
  }

  private resolveResource(arn: string): { tags: { Key: string; Value: string }[] } | undefined {
    return this.instances.get(arn) ?? this.tasks.get(arn) ?? this.endpoints.get(arn) ?? undefined;
  }
}
