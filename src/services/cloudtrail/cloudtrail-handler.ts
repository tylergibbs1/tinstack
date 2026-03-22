import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CloudTrailService } from "./cloudtrail-service";

export class CloudTrailHandler {
  constructor(private service: CloudTrailService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateTrail": return this.createTrail(body, ctx);
        case "GetTrail": return this.getTrail(body, ctx);
        case "DescribeTrails": return this.describeTrails(body, ctx);
        case "UpdateTrail": return this.updateTrail(body, ctx);
        case "DeleteTrail":
          this.service.deleteTrail(body.Name, ctx.region);
          return this.json({}, ctx);
        case "StartLogging":
          this.service.startLogging(body.Name, ctx.region);
          return this.json({}, ctx);
        case "StopLogging":
          this.service.stopLogging(body.Name, ctx.region);
          return this.json({}, ctx);
        case "GetTrailStatus": return this.getTrailStatus(body, ctx);
        case "PutEventSelectors": return this.putEventSelectors(body, ctx);
        case "GetEventSelectors": return this.getEventSelectors(body, ctx);
        case "LookupEvents": return this.lookupEvents(body, ctx);
        case "ListTrails": return this.listTrails(ctx);
        case "AddTags":
          this.service.addTags(body.ResourceId, body.TagsList ?? []);
          return this.json({}, ctx);
        case "RemoveTags":
          this.service.removeTags(body.ResourceId, body.TagsList ?? []);
          return this.json({}, ctx);
        case "ListTags": return this.listTags(body, ctx);
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

  private trailResponse(t: any): any {
    return {
      Name: t.name, TrailARN: t.arn, S3BucketName: t.s3BucketName,
      S3KeyPrefix: t.s3KeyPrefix, IsMultiRegionTrail: t.isMultiRegionTrail,
      IncludeGlobalServiceEvents: t.includeGlobalServiceEvents,
      LogFileValidationEnabled: t.logFileValidationEnabled,
      IsOrganizationTrail: t.isOrganizationTrail,
      CloudWatchLogsLogGroupArn: t.cloudWatchLogsLogGroupArn,
      CloudWatchLogsRoleArn: t.cloudWatchLogsRoleArn,
      KmsKeyId: t.kmsKeyId, HomeRegion: t.homeRegion,
    };
  }

  private createTrail(body: any, ctx: RequestContext): Response {
    const trail = this.service.createTrail(body, ctx.region);
    return this.json(this.trailResponse(trail), ctx);
  }

  private getTrail(body: any, ctx: RequestContext): Response {
    const trail = this.service.getTrail(body.Name, ctx.region);
    return this.json({ Trail: this.trailResponse(trail) }, ctx);
  }

  private describeTrails(body: any, ctx: RequestContext): Response {
    const trails = this.service.describeTrails(ctx.region, body.trailNameList, body.includeShadowTrails);
    return this.json({ trailList: trails.map((t) => this.trailResponse(t)) }, ctx);
  }

  private updateTrail(body: any, ctx: RequestContext): Response {
    const trail = this.service.updateTrail(body, ctx.region);
    return this.json(this.trailResponse(trail), ctx);
  }

  private getTrailStatus(body: any, ctx: RequestContext): Response {
    const status = this.service.getTrailStatus(body.Name, ctx.region);
    return this.json({
      IsLogging: status.isLogging,
      StartLoggingTime: status.startLoggingTime,
      StopLoggingTime: status.stopLoggingTime,
      LatestDeliveryTime: status.latestDeliveryTime,
    }, ctx);
  }

  private putEventSelectors(body: any, ctx: RequestContext): Response {
    const trail = this.service.getTrail(body.TrailName, ctx.region);
    const selectors = this.service.putEventSelectors(body.TrailName, body.EventSelectors ?? [], ctx.region);
    return this.json({ TrailARN: trail.arn, EventSelectors: selectors }, ctx);
  }

  private getEventSelectors(body: any, ctx: RequestContext): Response {
    const trail = this.service.getTrail(body.TrailName, ctx.region);
    const selectors = this.service.getEventSelectors(body.TrailName, ctx.region);
    return this.json({ TrailARN: trail.arn, EventSelectors: selectors }, ctx);
  }

  private lookupEvents(body: any, ctx: RequestContext): Response {
    const events = this.service.lookupEvents(body);
    return this.json({ Events: events }, ctx);
  }

  private listTrails(ctx: RequestContext): Response {
    const trails = this.service.listTrails(ctx.region);
    return this.json({ Trails: trails }, ctx);
  }

  private listTags(body: any, ctx: RequestContext): Response {
    const result = this.service.listTags(body.ResourceIdList ?? []);
    return this.json({ ResourceTagList: result }, ctx);
  }
}
