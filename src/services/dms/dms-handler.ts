import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { DmsService } from "./dms-service";

export class DmsHandler {
  constructor(private service: DmsService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateReplicationInstance": {
          const inst = this.service.createReplicationInstance(
            body.ReplicationInstanceIdentifier,
            body.ReplicationInstanceClass,
            body.AllocatedStorage,
            body.EngineVersion,
            body.MultiAZ,
            body.PubliclyAccessible,
            body.Tags,
            ctx.region,
          );
          return this.json({ ReplicationInstance: instanceToJson(inst) }, ctx);
        }
        case "DescribeReplicationInstances": {
          const instances = this.service.describeReplicationInstances(body.Filters);
          return this.json({ ReplicationInstances: instances.map(instanceToJson) }, ctx);
        }
        case "DeleteReplicationInstance": {
          const inst = this.service.deleteReplicationInstance(body.ReplicationInstanceArn);
          return this.json({ ReplicationInstance: instanceToJson(inst) }, ctx);
        }
        case "CreateEndpoint": {
          const ep = this.service.createEndpoint(
            body.EndpointIdentifier,
            body.EndpointType,
            body.EngineName,
            body.ServerName,
            body.Port,
            body.DatabaseName,
            body.Username,
            body.SslMode,
            body.Tags,
            ctx.region,
          );
          return this.json({ Endpoint: endpointToJson(ep) }, ctx);
        }
        case "DescribeEndpoints": {
          const endpoints = this.service.describeEndpoints(body.Filters);
          return this.json({ Endpoints: endpoints.map(endpointToJson) }, ctx);
        }
        case "DeleteEndpoint": {
          const ep = this.service.deleteEndpoint(body.EndpointArn);
          return this.json({ Endpoint: endpointToJson(ep) }, ctx);
        }
        case "ModifyEndpoint": {
          const ep = this.service.modifyEndpoint(
            body.EndpointArn,
            body.EngineName,
            body.ServerName,
            body.Port,
            body.DatabaseName,
            body.Username,
            body.SslMode,
          );
          return this.json({ Endpoint: endpointToJson(ep) }, ctx);
        }
        case "CreateReplicationTask": {
          const task = this.service.createReplicationTask(
            body.ReplicationTaskIdentifier,
            body.SourceEndpointArn,
            body.TargetEndpointArn,
            body.ReplicationInstanceArn,
            body.MigrationType,
            body.TableMappings,
            body.ReplicationTaskSettings,
            body.Tags,
            ctx.region,
          );
          return this.json({ ReplicationTask: taskToJson(task) }, ctx);
        }
        case "DescribeReplicationTasks": {
          const tasks = this.service.describeReplicationTasks(body.Filters);
          return this.json({ ReplicationTasks: tasks.map(taskToJson) }, ctx);
        }
        case "DeleteReplicationTask": {
          const task = this.service.deleteReplicationTask(body.ReplicationTaskArn);
          return this.json({ ReplicationTask: taskToJson(task) }, ctx);
        }
        case "StartReplicationTask": {
          const task = this.service.startReplicationTask(body.ReplicationTaskArn, body.StartReplicationTaskType);
          return this.json({ ReplicationTask: taskToJson(task) }, ctx);
        }
        case "StopReplicationTask": {
          const task = this.service.stopReplicationTask(body.ReplicationTaskArn);
          return this.json({ ReplicationTask: taskToJson(task) }, ctx);
        }
        case "TestConnection": {
          const conn = this.service.testConnection(body.ReplicationInstanceArn, body.EndpointArn);
          return this.json({ Connection: connectionToJson(conn) }, ctx);
        }
        case "DescribeConnections": {
          const conns = this.service.describeConnections(body.Filters);
          return this.json({ Connections: conns.map(connectionToJson) }, ctx);
        }
        case "AddTagsToResource": {
          this.service.addTagsToResource(body.ResourceArn, body.Tags ?? []);
          return this.json({}, ctx);
        }
        case "ListTagsForResource": {
          const tags = this.service.listTagsForResource(body.ResourceArn);
          return this.json({ TagList: tags }, ctx);
        }
        case "RemoveTagsFromResource": {
          this.service.removeTagsFromResource(body.ResourceArn, body.TagKeys ?? []);
          return this.json({}, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}

function instanceToJson(inst: any): any {
  return {
    ReplicationInstanceIdentifier: inst.replicationInstanceIdentifier,
    ReplicationInstanceArn: inst.replicationInstanceArn,
    ReplicationInstanceClass: inst.replicationInstanceClass,
    ReplicationInstanceStatus: inst.replicationInstanceStatus,
    AllocatedStorage: inst.allocatedStorage,
    EngineVersion: inst.engineVersion,
    MultiAZ: inst.multiAZ,
    PubliclyAccessible: inst.publiclyAccessible,
    InstanceCreateTime: inst.createdAt,
  };
}

function endpointToJson(ep: any): any {
  return {
    EndpointIdentifier: ep.endpointIdentifier,
    EndpointArn: ep.endpointArn,
    EndpointType: ep.endpointType,
    EngineName: ep.engineName,
    ServerName: ep.serverName,
    Port: ep.port,
    DatabaseName: ep.databaseName,
    Username: ep.username,
    Status: ep.status,
    SslMode: ep.sslMode,
  };
}

function taskToJson(task: any): any {
  return {
    ReplicationTaskIdentifier: task.replicationTaskIdentifier,
    ReplicationTaskArn: task.replicationTaskArn,
    SourceEndpointArn: task.sourceEndpointArn,
    TargetEndpointArn: task.targetEndpointArn,
    ReplicationInstanceArn: task.replicationInstanceArn,
    MigrationType: task.migrationType,
    TableMappings: task.tableMappings,
    ReplicationTaskSettings: task.replicationTaskSettings,
    Status: task.status,
    ReplicationTaskCreationDate: task.createdAt,
  };
}

function connectionToJson(conn: any): any {
  return {
    ReplicationInstanceArn: conn.replicationInstanceArn,
    EndpointArn: conn.endpointArn,
    Status: conn.status,
    EndpointIdentifier: conn.endpointIdentifier,
    ReplicationInstanceIdentifier: conn.replicationInstanceIdentifier,
  };
}
