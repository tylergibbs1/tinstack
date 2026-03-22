import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SsmService } from "./ssm-service";

export class SsmHandler {
  constructor(private service: SsmService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "PutParameter":
          return this.putParameter(body, ctx);
        case "GetParameter":
          return this.getParameter(body, ctx);
        case "GetParameters":
          return this.getParameters(body, ctx);
        case "GetParametersByPath":
          return this.getParametersByPath(body, ctx);
        case "DeleteParameter":
          return this.deleteParameter(body, ctx);
        case "DeleteParameters":
          return this.deleteParameters(body, ctx);
        case "DescribeParameters":
          return this.describeParameters(body, ctx);
        case "GetParameterHistory":
          return this.getParameterHistory(body, ctx);
        case "AddTagsToResource":
          return this.addTagsToResource(body, ctx);
        case "ListTagsForResource":
          return this.listTagsForResource(body, ctx);
        case "RemoveTagsFromResource":
          return this.removeTagsFromResource(body, ctx);
        case "CreateDocument":
          return this.createDocument(body, ctx);
        case "GetDocument":
          return this.getDocumentHandler(body, ctx);
        case "DescribeDocument":
          return this.describeDocument(body, ctx);
        case "ListDocuments":
          return this.listDocumentsHandler(body, ctx);
        case "UpdateDocument":
          return this.updateDocument(body, ctx);
        case "DeleteDocument":
          return this.deleteDocument(body, ctx);
        case "SendCommand":
          return this.sendCommand(body, ctx);
        case "GetCommandInvocation":
          return this.getCommandInvocation(body, ctx);
        case "ListCommands":
          return this.listCommands(body, ctx);
        case "ListCommandInvocations":
          return this.listCommandInvocations(body, ctx);
        case "CreateMaintenanceWindow":
          return this.createMaintenanceWindow(body, ctx);
        case "GetMaintenanceWindow":
          return this.getMaintenanceWindow(body, ctx);
        case "DescribeMaintenanceWindows":
          return this.describeMaintenanceWindows(body, ctx);
        case "UpdateMaintenanceWindow":
          return this.updateMaintenanceWindow(body, ctx);
        case "DeleteMaintenanceWindow":
          return this.deleteMaintenanceWindow(body, ctx);
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

  private putParameter(body: any, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    if (body.Tags) {
      for (const tag of body.Tags) tags[tag.Key] = tag.Value;
    }
    const result = this.service.putParameter(
      body.Name, body.Value, body.Type ?? "String",
      body.Description, body.Overwrite ?? false, tags, ctx.region,
    );
    return this.json({ Version: result.version, Tier: result.tier }, ctx);
  }

  private getParameter(body: any, ctx: RequestContext): Response {
    const param = this.service.getParameter(body.Name, body.WithDecryption ?? false, ctx.region);
    return this.json({
      Parameter: {
        Name: param.name,
        Type: param.type,
        Value: param.value,
        Version: param.version,
        LastModifiedDate: param.lastModifiedDate,
        ARN: param.arn,
        DataType: param.dataType,
      },
    }, ctx);
  }

  private getParameters(body: any, ctx: RequestContext): Response {
    const result = this.service.getParameters(body.Names, ctx.region);
    return this.json({
      Parameters: result.parameters.map((p) => ({
        Name: p.name, Type: p.type, Value: p.value, Version: p.version,
        LastModifiedDate: p.lastModifiedDate, ARN: p.arn, DataType: p.dataType,
      })),
      InvalidParameters: result.invalidParameters,
    }, ctx);
  }

  private getParametersByPath(body: any, ctx: RequestContext): Response {
    const result = this.service.getParametersByPath(body.Path, body.Recursive ?? false, ctx.region, body.MaxResults, body.NextToken);
    return this.json({
      Parameters: result.parameters.map((p) => ({
        Name: p.name, Type: p.type, Value: p.value, Version: p.version,
        LastModifiedDate: p.lastModifiedDate, ARN: p.arn, DataType: p.dataType,
      })),
      NextToken: result.nextToken,
    }, ctx);
  }

  private deleteParameter(body: any, ctx: RequestContext): Response {
    this.service.deleteParameter(body.Name, ctx.region);
    return this.json({}, ctx);
  }

  private deleteParameters(body: any, ctx: RequestContext): Response {
    const result = this.service.deleteParameters(body.Names, ctx.region);
    return this.json({
      DeletedParameters: result.deletedParameters,
      InvalidParameters: result.invalidParameters,
    }, ctx);
  }

  private describeParameters(body: any, ctx: RequestContext): Response {
    const result = this.service.describeParameters(ctx.region, body.ParameterFilters, body.MaxResults, body.NextToken);
    return this.json({
      Parameters: result.parameters,
      NextToken: result.nextToken,
    }, ctx);
  }

  private getParameterHistory(body: any, ctx: RequestContext): Response {
    const history = this.service.getParameterHistory(body.Name, ctx.region);
    return this.json({
      Parameters: history.map((h) => ({
        Name: h.name, Value: h.value, Type: h.type, Version: h.version,
        LastModifiedDate: h.lastModifiedDate, Description: h.description,
      })),
    }, ctx);
  }

  private addTagsToResource(body: any, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    for (const tag of body.Tags ?? []) tags[tag.Key] = tag.Value;
    this.service.addTagsToResource(body.ResourceId, tags, ctx.region);
    return this.json({}, ctx);
  }

  private listTagsForResource(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTagsForResource(body.ResourceId, ctx.region);
    return this.json({
      TagList: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
    }, ctx);
  }

  private removeTagsFromResource(body: any, ctx: RequestContext): Response {
    const tagKeys: string[] = (body.TagKeys ?? []);
    this.service.removeTagsFromResource(body.ResourceId, tagKeys, ctx.region);
    return this.json({}, ctx);
  }

  private createDocument(body: any, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    if (body.Tags) for (const t of body.Tags) tags[t.Key] = t.Value;
    const doc = this.service.createDocument(body.Name, body.Content, body.DocumentType, body.DocumentFormat, tags, ctx.region);
    return this.json({
      DocumentDescription: {
        Name: doc.name, DocumentType: doc.documentType, DocumentFormat: doc.documentFormat,
        DocumentVersion: doc.version, Status: doc.status, Description: doc.description,
        CreatedDate: doc.createdDate, Tags: Object.entries(doc.tags).map(([Key, Value]) => ({ Key, Value })),
      },
    }, ctx);
  }

  private getDocumentHandler(body: any, ctx: RequestContext): Response {
    const doc = this.service.getDocument(body.Name, ctx.region);
    return this.json({
      Name: doc.name, Content: doc.content, DocumentType: doc.documentType,
      DocumentFormat: doc.documentFormat, DocumentVersion: doc.version, Status: doc.status,
    }, ctx);
  }

  private describeDocument(body: any, ctx: RequestContext): Response {
    const doc = this.service.describeDocument(body.Name, ctx.region);
    return this.json({
      Document: {
        Name: doc.name, DocumentType: doc.documentType, DocumentFormat: doc.documentFormat,
        DocumentVersion: doc.version, Status: doc.status, Description: doc.description,
        CreatedDate: doc.createdDate,
      },
    }, ctx);
  }

  private listDocumentsHandler(body: any, ctx: RequestContext): Response {
    const docs = this.service.listDocuments(ctx.region);
    return this.json({
      DocumentIdentifiers: docs.map((d) => ({
        Name: d.name, DocumentType: d.documentType, DocumentFormat: d.documentFormat,
        DocumentVersion: d.version,
      })),
    }, ctx);
  }

  private updateDocument(body: any, ctx: RequestContext): Response {
    const doc = this.service.updateDocument(body.Name, body.Content, body.DocumentVersion, ctx.region);
    return this.json({
      DocumentDescription: {
        Name: doc.name, DocumentType: doc.documentType, DocumentFormat: doc.documentFormat,
        DocumentVersion: doc.version, Status: doc.status, Description: doc.description,
        CreatedDate: doc.createdDate,
      },
    }, ctx);
  }

  private deleteDocument(body: any, ctx: RequestContext): Response {
    this.service.deleteDocument(body.Name, ctx.region);
    return this.json({}, ctx);
  }

  // --- Commands ---

  private sendCommand(body: any, ctx: RequestContext): Response {
    const cmd = this.service.sendCommand(
      body.DocumentName,
      body.InstanceIds ?? [],
      body.Parameters ?? {},
      body.Comment,
      body.TimeoutSeconds,
      ctx.region,
    );
    return this.json({
      Command: {
        CommandId: cmd.commandId,
        DocumentName: cmd.documentName,
        InstanceIds: cmd.instanceIds,
        Parameters: cmd.parameters,
        Comment: cmd.comment,
        StatusDetails: cmd.status,
        Status: cmd.status,
        RequestedDateTime: cmd.requestedDateTime,
      },
    }, ctx);
  }

  private getCommandInvocation(body: any, ctx: RequestContext): Response {
    const inv = this.service.getCommandInvocation(body.CommandId, body.InstanceId, ctx.region);
    return this.json({
      CommandId: inv.commandId,
      InstanceId: inv.instanceId,
      Status: inv.status,
      StatusDetails: inv.statusDetails,
      StandardOutputContent: inv.standardOutputContent,
      StandardErrorContent: inv.standardErrorContent,
      ResponseCode: inv.responseCode,
    }, ctx);
  }

  private listCommands(body: any, ctx: RequestContext): Response {
    const cmds = this.service.listCommands(body.CommandId, ctx.region);
    return this.json({
      Commands: cmds.map((c) => ({
        CommandId: c.commandId,
        DocumentName: c.documentName,
        InstanceIds: c.instanceIds,
        Status: c.status,
        StatusDetails: c.status,
        RequestedDateTime: c.requestedDateTime,
        Comment: c.comment,
      })),
    }, ctx);
  }

  private listCommandInvocations(body: any, ctx: RequestContext): Response {
    const invs = this.service.listCommandInvocations(body.CommandId, ctx.region);
    return this.json({
      CommandInvocations: invs.map((i) => ({
        CommandId: i.commandId,
        InstanceId: i.instanceId,
        Status: i.status,
        StatusDetails: i.statusDetails,
      })),
    }, ctx);
  }

  // --- Maintenance Windows ---

  private createMaintenanceWindow(body: any, ctx: RequestContext): Response {
    const mw = this.service.createMaintenanceWindow(
      body.Name,
      body.Schedule,
      body.Duration,
      body.Cutoff,
      body.AllowUnassociatedTargets ?? false,
      ctx.region,
    );
    return this.json({ WindowId: mw.windowId }, ctx);
  }

  private getMaintenanceWindow(body: any, ctx: RequestContext): Response {
    const mw = this.service.getMaintenanceWindow(body.WindowId, ctx.region);
    return this.json({
      WindowId: mw.windowId,
      Name: mw.name,
      Schedule: mw.schedule,
      Duration: mw.duration,
      Cutoff: mw.cutoff,
      AllowUnassociatedTargets: mw.allowUnassociatedTargets,
      Enabled: mw.enabled,
      CreatedDate: mw.createdDate,
      ModifiedDate: mw.modifiedDate,
    }, ctx);
  }

  private describeMaintenanceWindows(body: any, ctx: RequestContext): Response {
    const windows = this.service.describeMaintenanceWindows(ctx.region);
    return this.json({
      WindowIdentities: windows.map((mw) => ({
        WindowId: mw.windowId,
        Name: mw.name,
        Schedule: mw.schedule,
        Duration: mw.duration,
        Cutoff: mw.cutoff,
        Enabled: mw.enabled,
      })),
    }, ctx);
  }

  private updateMaintenanceWindow(body: any, ctx: RequestContext): Response {
    const mw = this.service.updateMaintenanceWindow(
      body.WindowId,
      body.Name,
      body.Schedule,
      body.Duration,
      body.Cutoff,
      body.Enabled,
      ctx.region,
    );
    return this.json({
      WindowId: mw.windowId,
      Name: mw.name,
      Schedule: mw.schedule,
      Duration: mw.duration,
      Cutoff: mw.cutoff,
      AllowUnassociatedTargets: mw.allowUnassociatedTargets,
      Enabled: mw.enabled,
    }, ctx);
  }

  private deleteMaintenanceWindow(body: any, ctx: RequestContext): Response {
    this.service.deleteMaintenanceWindow(body.WindowId, ctx.region);
    return this.json({ WindowId: body.WindowId }, ctx);
  }
}
