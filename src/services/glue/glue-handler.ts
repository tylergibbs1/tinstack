import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { GlueService, GlueStorageDescriptor } from "./glue-service";

export class GlueHandler {
  constructor(private service: GlueService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateDatabase": return this.createDatabase(body, ctx);
        case "GetDatabase": return this.getDatabase(body, ctx);
        case "GetDatabases": return this.getDatabases(ctx);
        case "DeleteDatabase": return this.deleteDatabase(body, ctx);
        case "UpdateDatabase": return this.updateDatabase(body, ctx);
        case "CreateTable": return this.createTable(body, ctx);
        case "GetTable": return this.getTable(body, ctx);
        case "GetTables": return this.getTables(body, ctx);
        case "DeleteTable": return this.deleteTable(body, ctx);
        case "UpdateTable": return this.updateTable(body, ctx);
        case "CreatePartition": return this.createPartition(body, ctx);
        case "GetPartition": return this.getPartition(body, ctx);
        case "GetPartitions": return this.getPartitions(body, ctx);
        case "BatchCreatePartition": return this.batchCreatePartition(body, ctx);
        case "CreateCrawler": return this.createCrawler(body, ctx);
        case "GetCrawler": return this.getCrawler(body, ctx);
        case "ListCrawlers": return this.listCrawlers(ctx);
        case "StartCrawler": return this.startCrawler(body, ctx);
        case "StopCrawler": return this.stopCrawler(body, ctx);
        case "DeleteCrawler": return this.deleteCrawler(body, ctx);
        case "CreateJob": return this.createJob(body, ctx);
        case "GetJob": return this.getJob(body, ctx);
        case "GetJobs": return this.getJobs(ctx);
        case "DeleteJob": return this.deleteJob(body, ctx);
        case "StartJobRun": return this.startJobRun(body, ctx);
        case "GetJobRun": return this.getJobRun(body, ctx);
        case "CreateTrigger": return this.createTrigger(body, ctx);
        case "GetTrigger": return this.getTrigger(body, ctx);
        case "ListTriggers": return this.listTriggers(ctx);
        case "UpdateTrigger": return this.updateTrigger(body, ctx);
        case "StartTrigger": return this.startTrigger(body, ctx);
        case "StopTrigger": return this.stopTrigger(body, ctx);
        case "DeleteTrigger": return this.deleteTrigger(body, ctx);
        case "CreateConnection": return this.createConnection(body, ctx);
        case "GetConnection": return this.getConnection(body, ctx);
        case "GetConnections": return this.getConnections(ctx);
        case "DeleteConnection": return this.deleteConnection(body, ctx);
        case "GetJobBookmark": return this.getJobBookmark(body, ctx);
        case "ResetJobBookmark": return this.resetJobBookmark(body, ctx);
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

  // --- Databases ---

  private createDatabase(body: any, ctx: RequestContext): Response {
    const input = body.DatabaseInput;
    this.service.createDatabase(input.Name, input.Description, input.LocationUri, ctx.region);
    return this.json({}, ctx);
  }

  private getDatabase(body: any, ctx: RequestContext): Response {
    const db = this.service.getDatabase(body.Name, ctx.region);
    return this.json({
      Database: {
        Name: db.name,
        Description: db.description,
        LocationUri: db.locationUri,
        CreateTime: db.createTime,
      },
    }, ctx);
  }

  private getDatabases(ctx: RequestContext): Response {
    const databases = this.service.getDatabases(ctx.region);
    return this.json({
      DatabaseList: databases.map((db) => ({
        Name: db.name,
        Description: db.description,
        LocationUri: db.locationUri,
        CreateTime: db.createTime,
      })),
    }, ctx);
  }

  private deleteDatabase(body: any, ctx: RequestContext): Response {
    this.service.deleteDatabase(body.Name, ctx.region);
    return this.json({}, ctx);
  }

  private updateDatabase(body: any, ctx: RequestContext): Response {
    const input = body.DatabaseInput;
    this.service.updateDatabase(body.Name, input?.Description, ctx.region);
    return this.json({}, ctx);
  }

  // --- Tables ---

  private createTable(body: any, ctx: RequestContext): Response {
    const input = body.TableInput;
    this.service.createTable(
      body.DatabaseName,
      input.Name,
      this.parseStorageDescriptor(input.StorageDescriptor ?? {}),
      input.PartitionKeys?.map((k: any) => ({ name: k.Name, type: k.Type, comment: k.Comment })),
      input.Description,
      ctx.region,
    );
    return this.json({}, ctx);
  }

  private getTable(body: any, ctx: RequestContext): Response {
    const table = this.service.getTable(body.DatabaseName, body.Name, ctx.region);
    return this.json({ Table: this.formatTable(table) }, ctx);
  }

  private getTables(body: any, ctx: RequestContext): Response {
    const tables = this.service.getTables(body.DatabaseName, ctx.region);
    return this.json({ TableList: tables.map((t) => this.formatTable(t)) }, ctx);
  }

  private deleteTable(body: any, ctx: RequestContext): Response {
    this.service.deleteTable(body.DatabaseName, body.Name, ctx.region);
    return this.json({}, ctx);
  }

  private updateTable(body: any, ctx: RequestContext): Response {
    const input = body.TableInput;
    this.service.updateTable(
      body.DatabaseName,
      input.Name,
      input.StorageDescriptor ? this.parseStorageDescriptor(input.StorageDescriptor) : undefined,
      input.Description,
      ctx.region,
    );
    return this.json({}, ctx);
  }

  // --- Partitions ---

  private createPartition(body: any, ctx: RequestContext): Response {
    const input = body.PartitionInput;
    this.service.createPartition(
      body.DatabaseName,
      body.TableName,
      input.Values,
      input.StorageDescriptor ? this.parseStorageDescriptor(input.StorageDescriptor) : undefined,
      ctx.region,
    );
    return this.json({}, ctx);
  }

  private getPartition(body: any, ctx: RequestContext): Response {
    const partition = this.service.getPartition(body.DatabaseName, body.TableName, body.PartitionValues, ctx.region);
    return this.json({
      Partition: {
        DatabaseName: partition.databaseName,
        TableName: partition.tableName,
        Values: partition.values,
        StorageDescriptor: this.formatStorageDescriptor(partition.storageDescriptor),
        CreationTime: partition.creationTime,
      },
    }, ctx);
  }

  private getPartitions(body: any, ctx: RequestContext): Response {
    const partitions = this.service.getPartitions(body.DatabaseName, body.TableName, ctx.region);
    return this.json({
      Partitions: partitions.map((p) => ({
        DatabaseName: p.databaseName,
        TableName: p.tableName,
        Values: p.values,
        StorageDescriptor: this.formatStorageDescriptor(p.storageDescriptor),
        CreationTime: p.creationTime,
      })),
    }, ctx);
  }

  private batchCreatePartition(body: any, ctx: RequestContext): Response {
    const result = this.service.batchCreatePartition(
      body.DatabaseName,
      body.TableName,
      body.PartitionInputList,
      ctx.region,
    );
    return this.json({ Errors: result.errors }, ctx);
  }

  // --- Crawlers ---

  private createCrawler(body: any, ctx: RequestContext): Response {
    const s3Targets = (body.Targets?.S3Targets ?? []).map((t: any) => ({ path: t.Path }));
    this.service.createCrawler(body.Name, body.Role, body.DatabaseName, { s3Targets }, ctx.region);
    return this.json({}, ctx);
  }

  private getCrawler(body: any, ctx: RequestContext): Response {
    const crawler = this.service.getCrawler(body.Name, ctx.region);
    return this.json({
      Crawler: {
        Name: crawler.name,
        Role: crawler.role,
        DatabaseName: crawler.databaseName,
        Targets: {
          S3Targets: crawler.targets.s3Targets.map((t) => ({ Path: t.path })),
        },
        State: crawler.state,
        CreationTime: crawler.creationTime,
      },
    }, ctx);
  }

  private listCrawlers(ctx: RequestContext): Response {
    const names = this.service.listCrawlers(ctx.region);
    return this.json({ CrawlerNames: names }, ctx);
  }

  private startCrawler(body: any, ctx: RequestContext): Response {
    this.service.startCrawler(body.Name, ctx.region);
    return this.json({}, ctx);
  }

  private stopCrawler(body: any, ctx: RequestContext): Response {
    this.service.stopCrawler(body.Name, ctx.region);
    return this.json({}, ctx);
  }

  private deleteCrawler(body: any, ctx: RequestContext): Response {
    this.service.deleteCrawler(body.Name, ctx.region);
    return this.json({}, ctx);
  }

  // --- Jobs ---

  private createJob(body: any, ctx: RequestContext): Response {
    const job = this.service.createJob(
      body.Name,
      body.Role,
      {
        name: body.Command?.Name ?? "glueetl",
        scriptLocation: body.Command?.ScriptLocation ?? "",
      },
      body.DefaultArguments,
      ctx.region,
    );
    return this.json({ Name: job.name }, ctx);
  }

  private getJob(body: any, ctx: RequestContext): Response {
    const job = this.service.getJob(body.JobName, ctx.region);
    return this.json({
      Job: {
        Name: job.name,
        Role: job.role,
        Command: {
          Name: job.command.name,
          ScriptLocation: job.command.scriptLocation,
        },
        DefaultArguments: job.defaultArguments,
        CreatedOn: job.creationTime,
      },
    }, ctx);
  }

  private getJobs(ctx: RequestContext): Response {
    const jobs = this.service.getJobs(ctx.region);
    return this.json({
      Jobs: jobs.map((j) => ({
        Name: j.name,
        Role: j.role,
        Command: {
          Name: j.command.name,
          ScriptLocation: j.command.scriptLocation,
        },
        DefaultArguments: j.defaultArguments,
        CreatedOn: j.creationTime,
      })),
    }, ctx);
  }

  private deleteJob(body: any, ctx: RequestContext): Response {
    this.service.deleteJob(body.JobName, ctx.region);
    return this.json({ JobName: body.JobName }, ctx);
  }

  private startJobRun(body: any, ctx: RequestContext): Response {
    const runId = this.service.startJobRun(body.JobName, ctx.region);
    return this.json({ JobRunId: runId }, ctx);
  }

  private getJobRun(body: any, ctx: RequestContext): Response {
    const run = this.service.getJobRun(body.JobName, body.RunId, ctx.region);
    return this.json({
      JobRun: {
        Id: run.id,
        JobName: run.jobName,
        JobRunState: run.status,
        StartedOn: run.startedOn,
        CompletedOn: run.completedOn,
      },
    }, ctx);
  }

  // --- Triggers ---

  private createTrigger(body: any, ctx: RequestContext): Response {
    const trigger = this.service.createTrigger(
      body.Name,
      body.Type ?? "ON_DEMAND",
      body.Schedule,
      body.Predicate ? {
        logical: body.Predicate.Logical,
        conditions: (body.Predicate.Conditions ?? []).map((c: any) => ({
          logicalOperator: c.LogicalOperator,
          jobName: c.JobName,
          state: c.State,
        })),
      } : undefined,
      (body.Actions ?? []).map((a: any) => ({
        jobName: a.JobName,
        arguments: a.Arguments,
      })),
      ctx.region,
    );
    return this.json({ Name: trigger.name }, ctx);
  }

  private getTrigger(body: any, ctx: RequestContext): Response {
    const trigger = this.service.getTrigger(body.Name, ctx.region);
    return this.json({
      Trigger: {
        Name: trigger.name,
        Type: trigger.type,
        State: trigger.state,
        Schedule: trigger.schedule,
        Predicate: trigger.predicate ? {
          Logical: trigger.predicate.logical,
          Conditions: trigger.predicate.conditions.map((c) => ({
            LogicalOperator: c.logicalOperator,
            JobName: c.jobName,
            State: c.state,
          })),
        } : undefined,
        Actions: trigger.actions.map((a) => ({
          JobName: a.jobName,
          Arguments: a.arguments,
        })),
      },
    }, ctx);
  }

  private listTriggers(ctx: RequestContext): Response {
    const names = this.service.listTriggers(ctx.region);
    return this.json({ TriggerNames: names }, ctx);
  }

  private updateTrigger(body: any, ctx: RequestContext): Response {
    const update = body.TriggerUpdate;
    const trigger = this.service.updateTrigger(
      body.Name,
      update?.Schedule,
      update?.Actions?.map((a: any) => ({ jobName: a.JobName, arguments: a.Arguments })),
      ctx.region,
    );
    return this.json({
      Trigger: {
        Name: trigger.name,
        Type: trigger.type,
        State: trigger.state,
        Schedule: trigger.schedule,
        Actions: trigger.actions.map((a) => ({
          JobName: a.jobName,
          Arguments: a.arguments,
        })),
      },
    }, ctx);
  }

  private startTrigger(body: any, ctx: RequestContext): Response {
    this.service.startTrigger(body.Name, ctx.region);
    return this.json({ Name: body.Name }, ctx);
  }

  private stopTrigger(body: any, ctx: RequestContext): Response {
    this.service.stopTrigger(body.Name, ctx.region);
    return this.json({ Name: body.Name }, ctx);
  }

  private deleteTrigger(body: any, ctx: RequestContext): Response {
    this.service.deleteTrigger(body.Name, ctx.region);
    return this.json({ Name: body.Name }, ctx);
  }

  // --- Connections ---

  private createConnection(body: any, ctx: RequestContext): Response {
    const input = body.ConnectionInput;
    const pcr = input.PhysicalConnectionRequirements;
    this.service.createConnection(
      input.Name,
      input.ConnectionType ?? "JDBC",
      input.ConnectionProperties ?? {},
      pcr ? {
        subnetId: pcr.SubnetId,
        securityGroupIdList: pcr.SecurityGroupIdList,
        availabilityZone: pcr.AvailabilityZone,
      } : undefined,
      ctx.region,
    );
    return this.json({}, ctx);
  }

  private getConnection(body: any, ctx: RequestContext): Response {
    const conn = this.service.getConnection(body.Name, ctx.region);
    return this.json({
      Connection: {
        Name: conn.name,
        ConnectionType: conn.connectionType,
        ConnectionProperties: conn.connectionProperties,
        PhysicalConnectionRequirements: conn.physicalConnectionRequirements ? {
          SubnetId: conn.physicalConnectionRequirements.subnetId,
          SecurityGroupIdList: conn.physicalConnectionRequirements.securityGroupIdList,
          AvailabilityZone: conn.physicalConnectionRequirements.availabilityZone,
        } : undefined,
        CreationTime: conn.creationTime,
      },
    }, ctx);
  }

  private getConnections(ctx: RequestContext): Response {
    const connections = this.service.getConnections(ctx.region);
    return this.json({
      ConnectionList: connections.map((c) => ({
        Name: c.name,
        ConnectionType: c.connectionType,
        ConnectionProperties: c.connectionProperties,
        CreationTime: c.creationTime,
      })),
    }, ctx);
  }

  private deleteConnection(body: any, ctx: RequestContext): Response {
    this.service.deleteConnection(body.ConnectionName, ctx.region);
    return this.json({}, ctx);
  }

  // --- Job Bookmarks ---

  private getJobBookmark(body: any, ctx: RequestContext): Response {
    const bookmark = this.service.getJobBookmark(body.JobName, ctx.region);
    return this.json({
      JobBookmarkEntry: {
        JobName: bookmark.jobName,
        Run: bookmark.run,
        Attempt: bookmark.attempt,
        PreviousRunId: bookmark.previousRunId,
        RunId: bookmark.runId,
        Version: bookmark.version,
        JobBookmark: bookmark.jobBookmark,
      },
    }, ctx);
  }

  private resetJobBookmark(body: any, ctx: RequestContext): Response {
    const bookmark = this.service.resetJobBookmark(body.JobName, ctx.region);
    return this.json({
      JobBookmarkEntry: {
        JobName: bookmark.jobName,
        Run: bookmark.run,
        Attempt: bookmark.attempt,
        Version: bookmark.version,
      },
    }, ctx);
  }

  // --- Helpers ---

  private parseStorageDescriptor(sd: any): GlueStorageDescriptor {
    return {
      columns: (sd.Columns ?? []).map((c: any) => ({ name: c.Name, type: c.Type, comment: c.Comment })),
      location: sd.Location,
      inputFormat: sd.InputFormat,
      outputFormat: sd.OutputFormat,
      serdeInfo: sd.SerdeInfo ? {
        serializationLibrary: sd.SerdeInfo.SerializationLibrary,
        parameters: sd.SerdeInfo.Parameters,
      } : undefined,
    };
  }

  private formatStorageDescriptor(sd: GlueStorageDescriptor): any {
    return {
      Columns: sd.columns.map((c) => ({ Name: c.name, Type: c.type, Comment: c.comment })),
      Location: sd.location,
      InputFormat: sd.inputFormat,
      OutputFormat: sd.outputFormat,
      SerdeInfo: sd.serdeInfo ? {
        SerializationLibrary: sd.serdeInfo.serializationLibrary,
        Parameters: sd.serdeInfo.parameters,
      } : undefined,
    };
  }

  private formatTable(table: any): any {
    return {
      DatabaseName: table.databaseName,
      Name: table.name,
      Description: table.description,
      StorageDescriptor: this.formatStorageDescriptor(table.storageDescriptor),
      PartitionKeys: table.partitionKeys.map((k: any) => ({ Name: k.name, Type: k.type, Comment: k.comment })),
      CreateTime: table.createTime,
      UpdateTime: table.updateTime,
    };
  }
}
