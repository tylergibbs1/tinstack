import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CloudWatchLogsService } from "./logs-service";

export class CloudWatchLogsHandler {
  constructor(private service: CloudWatchLogsService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateLogGroup":
          this.service.createLogGroup(body.logGroupName, body.tags ?? {}, body.retentionInDays, ctx.region);
          return this.json({}, ctx);
        case "DeleteLogGroup":
          this.service.deleteLogGroup(body.logGroupName, ctx.region);
          return this.json({}, ctx);
        case "DescribeLogGroups":
          return this.json({ logGroups: this.service.describeLogGroups(body.logGroupNamePrefix, ctx.region).map(groupToJson) }, ctx);
        case "PutRetentionPolicy":
          this.service.putRetentionPolicy(body.logGroupName, body.retentionInDays, ctx.region);
          return this.json({}, ctx);
        case "CreateLogStream":
          this.service.createLogStream(body.logGroupName, body.logStreamName, ctx.region);
          return this.json({}, ctx);
        case "DeleteLogStream":
          this.service.deleteLogStream(body.logGroupName, body.logStreamName, ctx.region);
          return this.json({}, ctx);
        case "DescribeLogStreams":
          return this.json({
            logStreams: this.service.describeLogStreams(body.logGroupName, body.logStreamNamePrefix, ctx.region).map((s) => ({
              logStreamName: s.logStreamName, creationTime: s.creationTime,
              firstEventTimestamp: s.firstEventTimestamp, lastEventTimestamp: s.lastEventTimestamp,
              lastIngestionTime: s.lastIngestionTime, uploadSequenceToken: s.uploadSequenceToken,
              storedBytes: s.storedBytes,
            })),
          }, ctx);
        case "PutLogEvents": {
          const result = this.service.putLogEvents(body.logGroupName, body.logStreamName, body.logEvents, ctx.region);
          return this.json({ nextSequenceToken: result.nextSequenceToken }, ctx);
        }
        case "GetLogEvents": {
          const result = this.service.getLogEvents(body.logGroupName, body.logStreamName, body.startTime, body.endTime, body.limit, ctx.region);
          return this.json({
            events: result.events.map((e) => ({ timestamp: e.timestamp, message: e.message, ingestionTime: e.ingestionTime })),
            nextForwardToken: result.nextForwardToken, nextBackwardToken: result.nextBackwardToken,
          }, ctx);
        }
        case "FilterLogEvents":
          return this.json(this.service.filterLogEvents(body.logGroupName, body.filterPattern, body.startTime, body.endTime, body.limit, ctx.region), ctx);
        case "TagLogGroup":
          this.service.tagLogGroup(body.logGroupName, body.tags ?? {}, ctx.region);
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
}

function groupToJson(g: any) {
  return {
    logGroupName: g.logGroupName, arn: g.arn, creationTime: g.creationTime,
    retentionInDays: g.retentionInDays, storedBytes: g.storedBytes,
  };
}
