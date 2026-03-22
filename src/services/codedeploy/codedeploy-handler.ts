import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CodeDeployService } from "./codedeploy-service";

export class CodeDeployHandler {
  constructor(private service: CodeDeployService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateApplication": return this.createApplication(body, ctx);
        case "GetApplication": return this.getApplication(body, ctx);
        case "ListApplications": return this.listApplications(ctx);
        case "DeleteApplication":
          this.service.deleteApplication(body.applicationName, ctx.region);
          return this.json({}, ctx);
        case "CreateDeploymentGroup": return this.createDeploymentGroup(body, ctx);
        case "GetDeploymentGroup": return this.getDeploymentGroup(body, ctx);
        case "ListDeploymentGroups": return this.listDeploymentGroups(body, ctx);
        case "DeleteDeploymentGroup":
          this.service.deleteDeploymentGroup(body.applicationName, body.deploymentGroupName, ctx.region);
          return this.json({}, ctx);
        case "CreateDeployment": return this.createDeployment(body, ctx);
        case "GetDeployment": return this.getDeployment(body, ctx);
        case "ListDeployments": return this.listDeployments(body, ctx);
        case "StopDeployment": return this.stopDeployment(body, ctx);
        case "TagResource":
          this.service.tagResource(body.ResourceArn, body.Tags ?? []);
          return this.json({}, ctx);
        case "UntagResource":
          this.service.untagResource(body.ResourceArn, body.TagKeys ?? []);
          return this.json({}, ctx);
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

  private createApplication(body: any, ctx: RequestContext): Response {
    const app = this.service.createApplication(body, ctx.region);
    return this.json({ applicationId: app.applicationId }, ctx);
  }

  private getApplication(body: any, ctx: RequestContext): Response {
    const app = this.service.getApplication(body.applicationName, ctx.region);
    return this.json({
      application: {
        applicationId: app.applicationId,
        applicationName: app.applicationName,
        computePlatform: app.computePlatform,
        createTime: app.createTime,
      },
    }, ctx);
  }

  private listApplications(ctx: RequestContext): Response {
    const names = this.service.listApplications(ctx.region);
    return this.json({ applications: names }, ctx);
  }

  private createDeploymentGroup(body: any, ctx: RequestContext): Response {
    const dgId = this.service.createDeploymentGroup(body, ctx.region);
    return this.json({ deploymentGroupId: dgId }, ctx);
  }

  private getDeploymentGroup(body: any, ctx: RequestContext): Response {
    const dg = this.service.getDeploymentGroup(body.applicationName, body.deploymentGroupName, ctx.region);
    return this.json({
      deploymentGroupInfo: {
        deploymentGroupId: dg.deploymentGroupId,
        deploymentGroupName: dg.deploymentGroupName,
        applicationName: dg.applicationName,
        deploymentConfigName: dg.deploymentConfigName,
        serviceRoleArn: dg.serviceRoleArn,
        ec2TagFilters: dg.ec2TagFilters,
        autoScalingGroups: dg.autoScalingGroups,
        deploymentStyle: dg.deploymentStyle,
        autoRollbackConfiguration: dg.autoRollbackConfiguration,
      },
    }, ctx);
  }

  private listDeploymentGroups(body: any, ctx: RequestContext): Response {
    const names = this.service.listDeploymentGroups(body.applicationName, ctx.region);
    return this.json({
      applicationName: body.applicationName,
      deploymentGroups: names,
    }, ctx);
  }

  private createDeployment(body: any, ctx: RequestContext): Response {
    const deploymentId = this.service.createDeployment(body, ctx.region);
    return this.json({ deploymentId }, ctx);
  }

  private getDeployment(body: any, ctx: RequestContext): Response {
    const dep = this.service.getDeployment(body.deploymentId);
    return this.json({
      deploymentInfo: {
        deploymentId: dep.deploymentId,
        applicationName: dep.applicationName,
        deploymentGroupName: dep.deploymentGroupName,
        deploymentConfigName: dep.deploymentConfigName,
        revision: dep.revision,
        status: dep.status,
        createTime: dep.createTime,
        startTime: dep.startTime,
        completeTime: dep.completeTime,
        description: dep.description,
      },
    }, ctx);
  }

  private listDeployments(body: any, ctx: RequestContext): Response {
    const ids = this.service.listDeployments(body.applicationName, body.deploymentGroupName, ctx.region);
    return this.json({ deployments: ids }, ctx);
  }

  private stopDeployment(body: any, ctx: RequestContext): Response {
    const dep = this.service.stopDeployment(body.deploymentId);
    return this.json({ status: dep.status, statusMessage: "Deployment stopped." }, ctx);
  }
}
