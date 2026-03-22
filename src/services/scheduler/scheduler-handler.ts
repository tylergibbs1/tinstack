import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SchedulerService } from "./scheduler-service";

export class SchedulerHandler {
  constructor(private service: SchedulerService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Single schedule-group: GET/DELETE /schedule-groups/{name}
      const groupMatch = path.match(/^\/schedule-groups\/([^/]+)$/);
      if (groupMatch) {
        const name = decodeURIComponent(groupMatch[1]);
        if (method === "GET") {
          const group = this.service.getScheduleGroup(name);
          return this.json(group, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteScheduleGroup(name);
          return this.json({}, ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          const group = this.service.createScheduleGroup(name, ctx.region);
          return this.json({ ScheduleGroupArn: group.Arn }, ctx);
        }
      }

      // List/Create schedule-groups: GET/POST /schedule-groups
      if (path === "/schedule-groups" || path === "/schedule-groups/") {
        if (method === "GET") {
          const groups = this.service.listScheduleGroups();
          return this.json({ ScheduleGroups: groups }, ctx);
        }
      }

      // Single schedule: GET/PUT/DELETE /schedules/{name}
      const scheduleMatch = path.match(/^\/schedules\/([^/]+)$/);
      if (scheduleMatch) {
        const name = decodeURIComponent(scheduleMatch[1]);
        const groupName = url.searchParams.get("groupName") ?? "default";

        if (method === "GET") {
          const schedule = this.service.getSchedule(name, groupName);
          return this.json(schedule, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteSchedule(name, groupName);
          return this.json({}, ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          const schedule = this.service.createSchedule(name, body, ctx.region);
          return this.json({ ScheduleArn: schedule.Arn }, ctx);
        }
        if (method === "PUT") {
          const body = await req.json();
          const schedule = this.service.updateSchedule(name, body, ctx.region);
          return this.json({ ScheduleArn: schedule.Arn }, ctx);
        }
      }

      // List schedules: GET /schedules
      if ((path === "/schedules" || path === "/schedules/") && method === "GET") {
        const groupName = url.searchParams.get("ScheduleGroup") ?? undefined;
        const schedules = this.service.listSchedules(groupName);
        return this.json({
          Schedules: schedules.map((s) => ({
            Name: s.Name,
            GroupName: s.GroupName,
            Arn: s.Arn,
            State: s.State,
            ScheduleExpression: s.ScheduleExpression,
            Target: { Arn: s.Target.Arn },
            CreationDate: s.CreationDate,
            LastModificationDate: s.LastModificationDate,
          })),
        }, ctx);
      }

      // Tags: POST /tags/{arn}, DELETE /tags/{arn}?TagKeys=..., GET /tags/{arn}
      if (path.startsWith("/tags/")) {
        const arn = decodeURIComponent(path.slice("/tags/".length));
        if (method === "POST") {
          const body = await req.json();
          this.service.tagResource(arn, body.Tags ?? []);
          return this.json({}, ctx);
        }
        if (method === "DELETE") {
          const tagKeys = url.searchParams.getAll("TagKeys");
          this.service.untagResource(arn, tagKeys);
          return this.json({}, ctx);
        }
        if (method === "GET") {
          const tags = this.service.listTagsForResource(arn);
          return this.json({ Tags: tags }, ctx);
        }
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown Scheduler operation: ${method} ${path}`, 400),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
