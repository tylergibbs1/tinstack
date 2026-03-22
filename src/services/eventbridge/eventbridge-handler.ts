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
          const rule = this.service.putRule(body.Name, body.EventBusName, body.EventPattern, body.ScheduleExpression, body.State, body.Description, ctx.region);
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
