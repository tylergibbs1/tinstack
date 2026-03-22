import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CodeBuildService } from "./codebuild-service";

export class CodeBuildHandler {
  constructor(private service: CodeBuildService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateProject": return this.createProject(body, ctx);
        case "BatchGetProjects": return this.batchGetProjects(body, ctx);
        case "ListProjects": return this.listProjects(ctx);
        case "UpdateProject": return this.updateProject(body, ctx);
        case "DeleteProject":
          this.service.deleteProject(body.name, ctx.region);
          return this.json({}, ctx);
        case "StartBuild": return this.startBuild(body, ctx);
        case "BatchGetBuilds": return this.batchGetBuilds(body, ctx);
        case "ListBuildsForProject": return this.listBuildsForProject(body, ctx);
        case "StopBuild": return this.stopBuild(body, ctx);
        case "CreateReportGroup": return this.createReportGroup(body, ctx);
        case "BatchGetReportGroups": return this.batchGetReportGroups(body, ctx);
        case "ListReportGroups": return this.listReportGroups(ctx);
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

  private projectResponse(p: any): any {
    return {
      name: p.name, arn: p.arn, description: p.description,
      source: p.source, artifacts: p.artifacts, environment: p.environment,
      serviceRole: p.serviceRole, timeoutInMinutes: p.timeoutInMinutes,
      encryptionKey: p.encryptionKey, tags: p.tags,
      created: p.created, lastModified: p.lastModified,
      cache: p.cache,
    };
  }

  private buildResponse(b: any): any {
    return {
      id: b.id, arn: b.arn, buildNumber: b.buildNumber,
      projectName: b.projectName, buildStatus: b.buildStatus,
      currentPhase: b.currentPhase, startTime: b.startTime, endTime: b.endTime,
      source: b.source, artifacts: b.artifacts, environment: b.environment,
      serviceRole: b.serviceRole, timeoutInMinutes: b.timeoutInMinutes,
      phases: b.phases, logs: b.logs, sourceVersion: b.sourceVersion,
      buildComplete: b.buildComplete, initiator: b.initiator,
    };
  }

  private createProject(body: any, ctx: RequestContext): Response {
    const project = this.service.createProject(body, ctx.region);
    return this.json({ project: this.projectResponse(project) }, ctx);
  }

  private batchGetProjects(body: any, ctx: RequestContext): Response {
    const result = this.service.batchGetProjects(body.names ?? [], ctx.region);
    return this.json({
      projects: result.projects.map((p) => this.projectResponse(p)),
      projectsNotFound: result.projectsNotFound,
    }, ctx);
  }

  private listProjects(ctx: RequestContext): Response {
    const names = this.service.listProjects(ctx.region);
    return this.json({ projects: names }, ctx);
  }

  private updateProject(body: any, ctx: RequestContext): Response {
    const project = this.service.updateProject(body, ctx.region);
    return this.json({ project: this.projectResponse(project) }, ctx);
  }

  private startBuild(body: any, ctx: RequestContext): Response {
    const build = this.service.startBuild(body, ctx.region);
    return this.json({ build: this.buildResponse(build) }, ctx);
  }

  private batchGetBuilds(body: any, ctx: RequestContext): Response {
    const result = this.service.batchGetBuilds(body.ids ?? []);
    return this.json({
      builds: result.builds.map((b) => this.buildResponse(b)),
      buildsNotFound: result.buildsNotFound,
    }, ctx);
  }

  private listBuildsForProject(body: any, ctx: RequestContext): Response {
    const ids = this.service.listBuildsForProject(body.projectName, ctx.region);
    return this.json({ ids }, ctx);
  }

  private stopBuild(body: any, ctx: RequestContext): Response {
    const build = this.service.stopBuild(body.id);
    return this.json({ build: this.buildResponse(build) }, ctx);
  }

  private createReportGroup(body: any, ctx: RequestContext): Response {
    const rg = this.service.createReportGroup(body, ctx.region);
    return this.json({
      reportGroup: {
        arn: rg.arn, name: rg.name, type: rg.type,
        exportConfig: rg.exportConfig, created: rg.created,
        lastModified: rg.lastModified, tags: rg.tags,
      },
    }, ctx);
  }

  private batchGetReportGroups(body: any, ctx: RequestContext): Response {
    const result = this.service.batchGetReportGroups(body.reportGroupArns ?? [], ctx.region);
    return this.json({
      reportGroups: result.reportGroups.map((rg) => ({
        arn: rg.arn, name: rg.name, type: rg.type,
        exportConfig: rg.exportConfig, created: rg.created,
        lastModified: rg.lastModified, tags: rg.tags,
      })),
      reportGroupsNotFound: result.reportGroupsNotFound,
    }, ctx);
  }

  private listReportGroups(ctx: RequestContext): Response {
    const arns = this.service.listReportGroups(ctx.region);
    return this.json({ reportGroups: arns }, ctx);
  }
}
