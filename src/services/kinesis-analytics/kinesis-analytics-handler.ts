import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { KinesisAnalyticsService } from "./kinesis-analytics-service";

export class KinesisAnalyticsHandler {
  constructor(private service: KinesisAnalyticsService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateApplication": {
          const app = this.service.createApplication(body.ApplicationName, body.RuntimeEnvironment, body.ServiceExecutionRole, body.Tags, ctx.region);
          return this.json({ ApplicationDetail: this.fmt(app) }, ctx);
        }
        case "DescribeApplication": {
          const app = this.service.describeApplication(body.ApplicationName, ctx.region);
          return this.json({ ApplicationDetail: this.fmt(app) }, ctx);
        }
        case "ListApplications": {
          const apps = this.service.listApplications(ctx.region);
          return this.json({ ApplicationSummaries: apps.map((a) => ({ ApplicationName: a.applicationName, ApplicationARN: a.applicationARN, ApplicationStatus: a.applicationStatus, RuntimeEnvironment: a.runtimeEnvironment, ApplicationVersionId: a.applicationVersionId })) }, ctx);
        }
        case "DeleteApplication":
          this.service.deleteApplication(body.ApplicationName, ctx.region);
          return this.json({}, ctx);
        case "UpdateApplication": {
          const app = this.service.updateApplication(body.ApplicationName, body.CurrentApplicationVersionId, ctx.region);
          return this.json({ ApplicationDetail: this.fmt(app) }, ctx);
        }
        case "StartApplication":
          this.service.startApplication(body.ApplicationName, ctx.region);
          return this.json({}, ctx);
        case "StopApplication":
          this.service.stopApplication(body.ApplicationName, ctx.region);
          return this.json({}, ctx);
        case "AddApplicationInput":
          this.service.addApplicationInput(body.ApplicationName, body.Input, ctx.region);
          return this.json({}, ctx);
        case "AddApplicationOutput":
          this.service.addApplicationOutput(body.ApplicationName, body.Output, ctx.region);
          return this.json({}, ctx);
        case "TagResource":
          this.service.tagResource(body.ResourceARN, body.Tags ?? []);
          return this.json({}, ctx);
        case "UntagResource":
          this.service.untagResource(body.ResourceARN, body.TagKeys ?? []);
          return this.json({}, ctx);
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private fmt(a: any) {
    return { ApplicationName: a.applicationName, ApplicationARN: a.applicationARN, ApplicationStatus: a.applicationStatus, RuntimeEnvironment: a.runtimeEnvironment, ApplicationVersionId: a.applicationVersionId, CreateTimestamp: a.createTimestamp, LastUpdateTimestamp: a.lastUpdateTimestamp };
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId } });
  }
}
