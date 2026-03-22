import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ResourceGroupsService } from "./resource-groups-service";

export class ResourceGroupsHandler {
  constructor(private service: ResourceGroupsService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /groups — CreateGroup
      if (path === "/groups" && method === "POST") {
        const body = await req.json();
        const group = this.service.createGroup(body.Name, body.Description, body.ResourceQuery, body.Tags, ctx.region);
        return this.json({ Group: this.groupToJson(group), ResourceQuery: group.resourceQuery, Tags: group.tags }, ctx, 201);
      }

      // POST /groups-list — ListGroups
      if (path === "/groups-list" && method === "POST") {
        const groups = this.service.listGroups();
        return this.json({ GroupIdentifiers: groups.map((g) => ({ GroupName: g.name, GroupArn: g.groupArn })), Groups: groups.map((g) => this.groupToJson(g)) }, ctx);
      }

      // POST /get-group — GetGroup
      if (path === "/get-group" && method === "POST") {
        const body = await req.json();
        const name = body.GroupName ?? body.Group;
        return this.json({ Group: this.groupToJson(this.service.getGroup(name)) }, ctx);
      }

      // POST /update-group — UpdateGroup
      if (path === "/update-group" && method === "POST") {
        const body = await req.json();
        const name = body.GroupName ?? body.Group;
        const group = this.service.updateGroup(name, body.Description);
        return this.json({ Group: this.groupToJson(group) }, ctx);
      }

      // POST /delete-group — DeleteGroup
      if (path === "/delete-group" && method === "POST") {
        const body = await req.json();
        const name = body.GroupName ?? body.Group;
        const group = this.service.deleteGroup(name);
        return this.json({ Group: this.groupToJson(group) }, ctx);
      }

      // Tags: PUT/PATCH/GET on /resources/{arn}/tags
      const tagsMatch = path.match(/^\/resources\/(.+)\/tags$/);
      if (tagsMatch) {
        const arn = decodeURIComponent(tagsMatch[1]);
        if (method === "PUT") {
          const body = await req.json();
          this.service.tag(arn, body.Tags ?? {});
          return this.json({ Arn: arn, Tags: this.service.getTags(arn) }, ctx);
        }
        if (method === "PATCH") {
          const body = await req.json();
          this.service.untag(arn, body.Keys ?? []);
          return this.json({ Arn: arn, Keys: body.Keys }, ctx);
        }
        if (method === "GET") {
          return this.json({ Arn: arn, Tags: this.service.getTags(arn) }, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown Resource Groups op: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }

  private groupToJson(g: any): any {
    return { GroupArn: g.groupArn, Name: g.name, Description: g.description };
  }
}
