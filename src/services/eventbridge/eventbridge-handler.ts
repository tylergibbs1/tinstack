import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { EventBridgeService } from "./eventbridge-service";

export class EventBridgeHandler {
  constructor(private service: EventBridgeService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateEventBus": {
          const bus = this.service.createEventBus(body.Name, ctx.region);
          return this.json({ EventBusArn: bus.arn }, ctx);
        }
        case "DeleteEventBus": this.service.deleteEventBus(body.Name, ctx.region); return this.json({}, ctx);
        case "ListEventBuses": return this.json({ EventBuses: this.service.listEventBuses(ctx.region).map((b) => ({ Name: b.name, Arn: b.arn, State: b.state })) }, ctx);
        case "DescribeEventBus": {
          const bus = this.service.describeEventBus(body.Name, ctx.region);
          return this.json({ Name: bus.name, Arn: bus.arn, State: bus.state }, ctx);
        }
        case "PutRule": {
          const tags: Record<string, string> | undefined = body.Tags ? Object.fromEntries(body.Tags.map((t: any) => [t.Key, t.Value])) : undefined;
          const rule = this.service.putRule(body.Name, body.EventBusName, body.EventPattern, body.ScheduleExpression, body.State, body.Description, ctx.region, tags);
          return this.json({ RuleArn: rule.arn }, ctx);
        }
        case "DeleteRule": this.service.deleteRule(body.Name, body.EventBusName, ctx.region); return this.json({}, ctx);
        case "DescribeRule": {
          const rule = this.service.describeRule(body.Name, body.EventBusName, ctx.region);
          return this.json({ Name: rule.name, Arn: rule.arn, EventBusName: rule.eventBusName, EventPattern: rule.eventPattern, ScheduleExpression: rule.scheduleExpression, State: rule.state, Description: rule.description }, ctx);
        }
        case "ListRules": {
          const rules = this.service.listRules(body.EventBusName, ctx.region, body.NamePrefix);
          return this.json({ Rules: rules.map((r) => ({ Name: r.name, Arn: r.arn, State: r.state, EventBusName: r.eventBusName })) }, ctx);
        }
        case "PutTargets": return this.json(this.service.putTargets(body.Rule, body.EventBusName, body.Targets, ctx.region), ctx);
        case "RemoveTargets": return this.json(this.service.removeTargets(body.Rule, body.EventBusName, body.Ids, ctx.region), ctx);
        case "ListTargetsByRule": return this.json({ Targets: this.service.listTargetsByRule(body.Rule, body.EventBusName, ctx.region) }, ctx);
        case "PutEvents": {
          const r = this.service.putEvents(body.Entries, ctx.region);
          return this.json({ FailedEntryCount: r.failedEntryCount, Entries: r.entries.map((e) => ({ EventId: e.eventId })) }, ctx);
        }
        case "ListTagsForResource": return this.json({ Tags: this.service.listTagsForResource(body.ResourceARN) }, ctx);
        case "TagResource": this.service.tagResource(body.ResourceARN, body.Tags); return this.json({}, ctx);
        case "UntagResource": this.service.untagResource(body.ResourceARN, body.TagKeys); return this.json({}, ctx);
        case "CreateArchive": {
          const archive = this.service.createArchive(body.ArchiveName, body.EventSourceArn, body.EventPattern, body.Description, body.RetentionDays, ctx.region);
          return this.json({ ArchiveArn: archive.arn, State: archive.state, CreationTime: archive.creationTime }, ctx);
        }
        case "DescribeArchive": {
          const archive = this.service.describeArchive(body.ArchiveName, ctx.region);
          return this.json({ ArchiveName: archive.archiveName, ArchiveArn: archive.arn, EventSourceArn: archive.eventSourceArn, EventPattern: archive.eventPattern, Description: archive.description, RetentionDays: archive.retentionDays, State: archive.state, CreationTime: archive.creationTime, EventCount: archive.eventCount, SizeBytes: archive.sizeBytes }, ctx);
        }
        case "ListArchives":
          return this.json({ Archives: this.service.listArchives(ctx.region).map((a) => ({ ArchiveName: a.archiveName, EventSourceArn: a.eventSourceArn, State: a.state, RetentionDays: a.retentionDays, SizeBytes: a.sizeBytes, EventCount: a.eventCount, CreationTime: a.creationTime })) }, ctx);
        case "UpdateArchive": {
          const archive = this.service.updateArchive(body.ArchiveName, body.EventPattern, body.Description, body.RetentionDays, ctx.region);
          return this.json({ ArchiveArn: archive.arn, State: archive.state, CreationTime: archive.creationTime }, ctx);
        }
        case "DeleteArchive": this.service.deleteArchive(body.ArchiveName, ctx.region); return this.json({}, ctx);
        case "CreateConnection": {
          const conn = this.service.createConnection(body.Name, body.AuthorizationType, body.AuthParameters, ctx.region);
          return this.json({ ConnectionArn: conn.arn, ConnectionState: conn.connectionState, CreationTime: conn.creationTime, LastModifiedTime: conn.lastModifiedTime }, ctx);
        }
        case "DescribeConnection": {
          const conn = this.service.describeConnection(body.Name, ctx.region);
          return this.json({ Name: conn.name, ConnectionArn: conn.arn, ConnectionState: conn.connectionState, AuthorizationType: conn.authorizationType, AuthParameters: conn.authParameters, CreationTime: conn.creationTime, LastModifiedTime: conn.lastModifiedTime, LastAuthorizedTime: conn.lastAuthorizedTime }, ctx);
        }
        case "ListConnections":
          return this.json({ Connections: this.service.listConnections(ctx.region).map((c) => ({ Name: c.name, ConnectionArn: c.arn, ConnectionState: c.connectionState, AuthorizationType: c.authorizationType, CreationTime: c.creationTime, LastModifiedTime: c.lastModifiedTime })) }, ctx);
        case "DeleteConnection": {
          const conn = this.service.deleteConnection(body.Name, ctx.region);
          return this.json({ ConnectionArn: conn.arn, ConnectionState: "DELETING", CreationTime: conn.creationTime, LastModifiedTime: conn.lastModifiedTime, LastAuthorizedTime: conn.lastAuthorizedTime }, ctx);
        }
        case "CreateApiDestination": {
          const dest = this.service.createApiDestination(body.Name, body.ConnectionArn, body.InvocationEndpoint, body.HttpMethod, body.InvocationRateLimitPerSecond, ctx.region);
          return this.json({ ApiDestinationArn: dest.arn, ApiDestinationState: "ACTIVE", CreationTime: dest.creationTime, LastModifiedTime: dest.lastModifiedTime }, ctx);
        }
        case "DescribeApiDestination": {
          const dest = this.service.describeApiDestination(body.Name, ctx.region);
          return this.json({ Name: dest.name, ApiDestinationArn: dest.arn, ApiDestinationState: "ACTIVE", ConnectionArn: dest.connectionArn, InvocationEndpoint: dest.invocationEndpoint, HttpMethod: dest.httpMethod, InvocationRateLimitPerSecond: dest.invocationRateLimitPerSecond, CreationTime: dest.creationTime, LastModifiedTime: dest.lastModifiedTime }, ctx);
        }
        case "ListApiDestinations":
          return this.json({ ApiDestinations: this.service.listApiDestinations(ctx.region).map((d) => ({ Name: d.name, ApiDestinationArn: d.arn, ApiDestinationState: "ACTIVE", ConnectionArn: d.connectionArn, InvocationEndpoint: d.invocationEndpoint, HttpMethod: d.httpMethod, InvocationRateLimitPerSecond: d.invocationRateLimitPerSecond, CreationTime: d.creationTime, LastModifiedTime: d.lastModifiedTime })) }, ctx);
        case "DeleteApiDestination": this.service.deleteApiDestination(body.Name, ctx.region); return this.json({}, ctx);
        case "PutPermission": this.service.putPermission(body.EventBusName, body.StatementId, body.Action ?? "events:PutEvents", body.Principal, ctx.region); return this.json({}, ctx);
        case "RemovePermission": this.service.removePermission(body.EventBusName, body.StatementId, ctx.region); return this.json({}, ctx);
        case "ListRuleNamesByTarget":
          return this.json({ RuleNames: this.service.listRuleNamesByTarget(body.TargetArn, body.EventBusName, ctx.region) }, ctx);
        case "EnableRule":
          this.service.enableRule(body.Name, body.EventBusName, ctx.region);
          return this.json({}, ctx);
        case "DisableRule":
          this.service.disableRule(body.Name, body.EventBusName, ctx.region);
          return this.json({}, ctx);
        case "StartReplay": {
          const replay = this.service.startReplay(body.ReplayName, body.EventSourceArn, new Date(body.EventStartTime).getTime() / 1000, new Date(body.EventEndTime).getTime() / 1000, body.Destination, ctx.region);
          return this.json({ ReplayArn: replay.arn, State: replay.state, StateReason: replay.stateReason, ReplayStartTime: replay.replayStartTime }, ctx);
        }
        case "DescribeReplay": {
          const replay = this.service.describeReplay(body.ReplayName, ctx.region);
          return this.json({
            ReplayName: replay.replayName,
            ReplayArn: replay.arn,
            EventSourceArn: replay.eventSourceArn,
            EventStartTime: replay.eventStartTime,
            EventEndTime: replay.eventEndTime,
            Destination: replay.destination,
            State: replay.state,
            StateReason: replay.stateReason,
            EventLastReplayedTime: replay.eventLastReplayedTime,
            ReplayStartTime: replay.replayStartTime,
            ReplayEndTime: replay.replayEndTime,
          }, ctx);
        }
        case "ListReplays":
          return this.json({
            Replays: this.service.listReplays(ctx.region).map((r) => ({
              ReplayName: r.replayName, EventSourceArn: r.eventSourceArn, State: r.state, EventStartTime: r.eventStartTime, EventEndTime: r.eventEndTime, ReplayStartTime: r.replayStartTime, ReplayEndTime: r.replayEndTime,
            })),
          }, ctx);
        case "CancelReplay": {
          const replay = this.service.cancelReplay(body.ReplayName, ctx.region);
          return this.json({ ReplayArn: replay.arn, State: replay.state, StateReason: replay.stateReason }, ctx);
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
