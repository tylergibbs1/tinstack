import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { WorkspacesService } from "./workspaces-service";

export class WorkspacesHandler {
  constructor(private service: WorkspacesService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateWorkspaces": return this.createWorkspaces(body, ctx);
        case "DescribeWorkspaces": return this.describeWorkspaces(body, ctx);
        case "TerminateWorkspaces": return this.terminateWorkspaces(body, ctx);
        case "StartWorkspaces": return this.startWorkspaces(body, ctx);
        case "StopWorkspaces": return this.stopWorkspaces(body, ctx);
        case "RebootWorkspaces": return this.rebootWorkspaces(body, ctx);
        case "CreateWorkspaceBundle": return this.createWorkspaceBundle(body, ctx);
        case "DescribeWorkspaceBundles": return this.describeWorkspaceBundles(body, ctx);
        case "CreateWorkspaceDirectory": return this.createWorkspaceDirectory(body, ctx);
        case "DescribeWorkspaceDirectories": return this.describeWorkspaceDirectories(body, ctx);
        case "RegisterWorkspaceDirectory": return this.registerWorkspaceDirectory(body, ctx);
        case "DeregisterWorkspaceDirectory": return this.deregisterWorkspaceDirectory(body, ctx);
        case "CreateTags": return this.createTags(body, ctx);
        case "DescribeTags": return this.describeTags(body, ctx);
        case "DeleteTags": return this.deleteTags(body, ctx);
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

  private createWorkspaces(body: any, ctx: RequestContext): Response {
    const result = this.service.createWorkspaces(body.Workspaces ?? []);
    return this.json(result, ctx);
  }

  private describeWorkspaces(body: any, ctx: RequestContext): Response {
    const workspaces = this.service.describeWorkspaces(body.WorkspaceIds, body.DirectoryId);
    return this.json({
      Workspaces: workspaces.map((ws) => ({
        WorkspaceId: ws.workspaceId,
        DirectoryId: ws.directoryId,
        BundleId: ws.bundleId,
        UserName: ws.userName,
        State: ws.state,
        WorkspaceProperties: ws.workspaceProperties,
      })),
    }, ctx);
  }

  private terminateWorkspaces(body: any, ctx: RequestContext): Response {
    const result = this.service.terminateWorkspaces(body.TerminateWorkspaceRequests ?? []);
    return this.json(result, ctx);
  }

  private startWorkspaces(body: any, ctx: RequestContext): Response {
    const result = this.service.startWorkspaces(body.StartWorkspaceRequests ?? []);
    return this.json(result, ctx);
  }

  private stopWorkspaces(body: any, ctx: RequestContext): Response {
    const result = this.service.stopWorkspaces(body.StopWorkspaceRequests ?? []);
    return this.json(result, ctx);
  }

  private rebootWorkspaces(body: any, ctx: RequestContext): Response {
    const result = this.service.rebootWorkspaces(body.RebootWorkspaceRequests ?? []);
    return this.json(result, ctx);
  }

  private createWorkspaceBundle(body: any, ctx: RequestContext): Response {
    const bundle = this.service.createWorkspaceBundle(
      body.BundleName,
      body.BundleDescription ?? "",
      body.ComputeType?.Name ?? "STANDARD",
      body.RootStorage?.Capacity ?? "80",
      body.UserStorage?.Capacity ?? "50",
    );
    return this.json({
      WorkspaceBundle: {
        BundleId: bundle.bundleId,
        Name: bundle.name,
        Owner: bundle.owner,
        Description: bundle.description,
        ComputeType: bundle.computeType,
        RootStorage: bundle.rootStorage,
        UserStorage: bundle.userStorage,
      },
    }, ctx);
  }

  private describeWorkspaceBundles(body: any, ctx: RequestContext): Response {
    const bundles = this.service.describeWorkspaceBundles(body.BundleIds);
    return this.json({
      Bundles: bundles.map((b) => ({
        BundleId: b.bundleId,
        Name: b.name,
        Owner: b.owner,
        Description: b.description,
        ComputeType: b.computeType,
        RootStorage: b.rootStorage,
        UserStorage: b.userStorage,
      })),
    }, ctx);
  }

  private createWorkspaceDirectory(body: any, ctx: RequestContext): Response {
    const dir = this.service.createWorkspaceDirectory(
      body.DirectoryId ?? `d-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
      body.DirectoryName ?? "test-directory",
      body.SubnetIds ?? [],
      body.Tags ?? [],
    );
    return this.json({
      WorkspaceDirectory: {
        DirectoryId: dir.directoryId,
        DirectoryName: dir.directoryName,
        Alias: dir.alias,
        DirectoryType: dir.directoryType,
        State: dir.state,
        RegistrationCode: dir.registrationCode,
        SubnetIds: dir.subnetIds,
      },
    }, ctx);
  }

  private describeWorkspaceDirectories(body: any, ctx: RequestContext): Response {
    const dirs = this.service.describeWorkspaceDirectories(body.DirectoryIds);
    return this.json({
      Directories: dirs.map((d) => ({
        DirectoryId: d.directoryId,
        DirectoryName: d.directoryName,
        Alias: d.alias,
        DirectoryType: d.directoryType,
        State: d.state,
        RegistrationCode: d.registrationCode,
        SubnetIds: d.subnetIds,
      })),
    }, ctx);
  }

  private registerWorkspaceDirectory(body: any, ctx: RequestContext): Response {
    this.service.registerWorkspaceDirectory(
      body.DirectoryId,
      body.SubnetIds ?? [],
      body.EnableSelfService ?? false,
      body.Tenancy ?? "SHARED",
      body.Tags ?? [],
    );
    return this.json({}, ctx);
  }

  private deregisterWorkspaceDirectory(body: any, ctx: RequestContext): Response {
    this.service.deregisterWorkspaceDirectory(body.DirectoryId);
    return this.json({}, ctx);
  }

  private createTags(body: any, ctx: RequestContext): Response {
    this.service.createTags(body.ResourceId, body.Tags ?? []);
    return this.json({}, ctx);
  }

  private describeTags(body: any, ctx: RequestContext): Response {
    const tags = this.service.describeTags(body.ResourceId);
    return this.json({ TagList: tags }, ctx);
  }

  private deleteTags(body: any, ctx: RequestContext): Response {
    this.service.deleteTags(body.ResourceId, body.TagKeys ?? []);
    return this.json({}, ctx);
  }
}
