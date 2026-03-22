import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ConnectService } from "./connect-service";

export class ConnectHandler {
  constructor(private service: ConnectService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // PUT /instance — CreateInstance
      if (path === "/instance" && method === "PUT") {
        const body = await req.json();
        const inst = this.service.createInstance(body.IdentityManagementType, body.InstanceAlias, body.InboundCallsEnabled, body.OutboundCallsEnabled, ctx.region);
        return this.json({ Id: inst.id, Arn: inst.arn }, ctx);
      }

      // GET /instance — ListInstances
      if (path === "/instance" && method === "GET") {
        const instances = this.service.listInstances();
        return this.json({ InstanceSummaryList: instances.map((i) => ({ Id: i.id, Arn: i.arn, InstanceAlias: i.instanceAlias, InstanceStatus: i.instanceStatus, IdentityManagementType: i.identityManagementType, CreatedTime: i.createdTime })) }, ctx);
      }

      // Users: PUT /users/{instanceId} — CreateUser
      const createUserMatch = path.match(/^\/users\/([^/]+)$/);
      if (createUserMatch && method === "PUT") {
        const body = await req.json();
        const user = this.service.createUser(createUserMatch[1], body.Username, body.IdentityInfo, body.PhoneConfig, body.RoutingProfileId, body.SecurityProfileIds, ctx.region);
        return this.json({ UserId: user.id, UserArn: user.arn }, ctx);
      }

      // GET /users-summary/{instanceId} — ListUsers
      const listUsersMatch = path.match(/^\/users-summary\/([^/]+)$/);
      if (listUsersMatch && method === "GET") {
        const users = this.service.listUsers(listUsersMatch[1]);
        return this.json({ UserSummaryList: users.map((u) => ({ Id: u.id, Arn: u.arn, Username: u.username })) }, ctx);
      }

      // GET /users/{instanceId}/{userId} — DescribeUser
      const describeUserMatch = path.match(/^\/users\/([^/]+)\/([^/]+)$/);
      if (describeUserMatch && method === "GET") {
        const user = this.service.describeUser(describeUserMatch[1], describeUserMatch[2]);
        return this.json({ User: { Id: user.id, Arn: user.arn, Username: user.username, IdentityInfo: user.identityInfo, PhoneConfig: user.phoneConfig, RoutingProfileId: user.routingProfileId, SecurityProfileIds: user.securityProfileIds } }, ctx);
      }

      // DELETE /users/{instanceId}/{userId} — DeleteUser
      const deleteUserMatch = path.match(/^\/users\/([^/]+)\/([^/]+)$/);
      if (deleteUserMatch && method === "DELETE") {
        this.service.deleteUser(deleteUserMatch[1], deleteUserMatch[2]);
        return this.json({}, ctx);
      }

      // Queues: PUT /queues/{instanceId} — CreateQueue
      const createQueueMatch = path.match(/^\/queues\/([^/]+)$/);
      if (createQueueMatch && method === "PUT") {
        const body = await req.json();
        const queue = this.service.createQueue(createQueueMatch[1], body.Name, body.Description, ctx.region);
        return this.json({ QueueId: queue.queueId, QueueArn: queue.queueArn }, ctx);
      }

      // GET /queues-summary/{instanceId} — ListQueues
      const listQueuesMatch = path.match(/^\/queues-summary\/([^/]+)$/);
      if (listQueuesMatch && method === "GET") {
        const queues = this.service.listQueues(listQueuesMatch[1]);
        return this.json({ QueueSummaryList: queues.map((q) => ({ Id: q.queueId, Arn: q.queueArn, Name: q.name, QueueType: "STANDARD" })) }, ctx);
      }

      // Single instance: GET/DELETE /instance/{id}
      const instanceMatch = path.match(/^\/instance\/([^/]+)$/);
      if (instanceMatch) {
        if (method === "GET") {
          const inst = this.service.describeInstance(instanceMatch[1]);
          return this.json({ Instance: { Id: inst.id, Arn: inst.arn, IdentityManagementType: inst.identityManagementType, InstanceAlias: inst.instanceAlias, CreatedTime: inst.createdTime, InstanceStatus: inst.instanceStatus, InboundCallsEnabled: inst.inboundCallsEnabled, OutboundCallsEnabled: inst.outboundCallsEnabled } }, ctx);
        }
        if (method === "DELETE") { this.service.deleteInstance(instanceMatch[1]); return this.json({}, ctx); }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown Connect op: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }
}
