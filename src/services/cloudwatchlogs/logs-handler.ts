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
          const result = this.service.getLogEvents(body.logGroupName, body.logStreamName, body.startTime, body.endTime, body.limit, body.nextToken, ctx.region);
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
        case "ListTagsForResource": {
          // ARN-based tag API (newer). Extract log group name from ARN.
          const arn = body.resourceArn ?? "";
          const match = arn.match(/:log-group:([^:]+)/);
          const groupName = match ? match[1] : "";
          const tags = this.service.getLogGroupTags(groupName, ctx.region);
          return this.json({ tags }, ctx);
        }
        case "TagResource": {
          const arn = body.resourceArn ?? "";
          const match = arn.match(/:log-group:([^:]+)/);
          if (match) this.service.tagLogGroup(match[1], body.tags ?? {}, ctx.region);
          return this.json({}, ctx);
        }
        case "UntagResource": {
          const arn = body.resourceArn ?? "";
          const match = arn.match(/:log-group:([^:]+)/);
          if (match) this.service.untagLogGroup(match[1], body.tagKeys ?? [], ctx.region);
          return this.json({}, ctx);
        }
        case "PutMetricFilter":
          this.service.putMetricFilter(body.logGroupName, body.filterName, body.filterPattern, body.metricTransformations ?? [], ctx.region);
          return this.json({}, ctx);
        case "DescribeMetricFilters":
          return this.json({
            metricFilters: this.service.describeMetricFilters(body.logGroupName, ctx.region).map((f) => ({
              filterName: f.filterName, filterPattern: f.filterPattern, logGroupName: f.logGroupName,
              metricTransformations: f.metricTransformations, creationTime: f.creationTime,
            })),
          }, ctx);
        case "DeleteMetricFilter":
          this.service.deleteMetricFilter(body.logGroupName, body.filterName, ctx.region);
          return this.json({}, ctx);
        case "PutSubscriptionFilter":
          this.service.putSubscriptionFilter(body.logGroupName, body.filterName, body.filterPattern, body.destinationArn, body.roleArn, ctx.region);
          return this.json({}, ctx);
        case "DescribeSubscriptionFilters":
          return this.json({
            subscriptionFilters: this.service.describeSubscriptionFilters(body.logGroupName, ctx.region).map((f) => ({
              filterName: f.filterName, filterPattern: f.filterPattern, logGroupName: f.logGroupName,
              destinationArn: f.destinationArn, roleArn: f.roleArn, creationTime: f.creationTime,
            })),
          }, ctx);
        case "DeleteSubscriptionFilter":
          this.service.deleteSubscriptionFilter(body.logGroupName, body.filterName, ctx.region);
          return this.json({}, ctx);
        case "CreateExportTask": {
          const taskId = this.service.createExportTask(
            body.logGroupName, body.from, body.to, body.destination,
            body.destinationPrefix, body.taskName, ctx.region,
          );
          return this.json({ taskId }, ctx);
        }
        case "DescribeExportTasks":
          return this.json({
            exportTasks: this.service.describeExportTasks(body.taskId, ctx.region).map((t) => ({
              taskId: t.taskId, taskName: t.taskName, logGroupName: t.logGroupName,
              from: t.fromTime, to: t.to, destination: t.destination,
              destinationPrefix: t.destinationPrefix, status: t.status,
            })),
          }, ctx);
        case "CancelExportTask":
          this.service.cancelExportTask(body.taskId, ctx.region);
          return this.json({}, ctx);
        case "PutResourcePolicy": {
          const policy = this.service.putResourcePolicy(body.policyName, body.policyDocument, ctx.region);
          return this.json({ resourcePolicy: { policyName: policy.policyName, policyDocument: policy.policyDocument, lastUpdatedTime: policy.lastUpdatedTime } }, ctx);
        }
        case "DescribeResourcePolicies":
          return this.json({
            resourcePolicies: this.service.describeResourcePolicies(ctx.region).map((p) => ({
              policyName: p.policyName, policyDocument: p.policyDocument, lastUpdatedTime: p.lastUpdatedTime,
            })),
          }, ctx);
        case "DeleteResourcePolicy":
          this.service.deleteResourcePolicy(body.policyName, ctx.region);
          return this.json({}, ctx);
        case "PutDestination": {
          const dest = this.service.putDestination(body.destinationName, body.targetArn, body.roleArn, ctx.region);
          return this.json({ destination: { destinationName: dest.destinationName, targetArn: dest.targetArn, roleArn: dest.roleArn, arn: dest.arn, creationTime: dest.creationTime } }, ctx);
        }
        case "DescribeDestinations":
          return this.json({
            destinations: this.service.describeDestinations(body.DestinationNamePrefix, ctx.region).map((d) => ({
              destinationName: d.destinationName, targetArn: d.targetArn, roleArn: d.roleArn,
              arn: d.arn, creationTime: d.creationTime,
            })),
          }, ctx);
        case "DeleteDestination":
          this.service.deleteDestination(body.destinationName, ctx.region);
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
