import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { MqService } from "./mq-service";

export class MqHandler {
  constructor(private service: MqService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- Brokers ---

      // POST /v1/brokers/{brokerId}/reboot
      const rebootMatch = path.match(/^\/v1\/brokers\/([^/]+)\/reboot$/);
      if (rebootMatch && method === "POST") {
        const brokerId = decodeURIComponent(rebootMatch[1]);
        this.service.rebootBroker(brokerId);
        return this.json({}, ctx);
      }

      // Broker users: /v1/brokers/{brokerId}/users/{username}
      const userMatch = path.match(/^\/v1\/brokers\/([^/]+)\/users\/([^/]+)$/);
      if (userMatch) {
        const brokerId = decodeURIComponent(userMatch[1]);
        const username = decodeURIComponent(userMatch[2]);
        if (method === "POST" || method === "PUT") {
          const body = await req.json().catch(() => ({}));
          this.service.createUser(brokerId, username, body.consoleAccess, body.groups);
          return this.json({}, ctx);
        }
        if (method === "GET") {
          const user = this.service.describeUser(brokerId, username);
          return this.json({
            brokerId,
            username: user.username,
            consoleAccess: user.consoleAccess,
            groups: user.groups,
          }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteUser(brokerId, username);
          return this.json({}, ctx);
        }
      }

      // Broker users list: /v1/brokers/{brokerId}/users
      const usersListMatch = path.match(/^\/v1\/brokers\/([^/]+)\/users$/);
      if (usersListMatch && method === "GET") {
        const brokerId = decodeURIComponent(usersListMatch[1]);
        const users = this.service.listUsers(brokerId);
        return this.json({
          brokerId,
          users: users.map((u) => ({ username: u.username })),
        }, ctx);
      }

      // Single broker: /v1/brokers/{brokerId}
      const brokerMatch = path.match(/^\/v1\/brokers\/([^/]+)$/);
      if (brokerMatch) {
        const brokerId = decodeURIComponent(brokerMatch[1]);
        if (method === "GET") {
          const broker = this.service.describeBroker(brokerId);
          return this.json({
            brokerId: broker.brokerId,
            brokerArn: broker.brokerArn,
            brokerName: broker.brokerName,
            brokerState: broker.brokerState,
            deploymentMode: broker.deploymentMode,
            engineType: broker.engineType,
            engineVersion: broker.engineVersion,
            hostInstanceType: broker.hostInstanceType,
            autoMinorVersionUpgrade: broker.autoMinorVersionUpgrade,
            publiclyAccessible: broker.publiclyAccessible,
            securityGroups: broker.securityGroups,
            subnetIds: broker.subnetIds,
            users: broker.users.map((u) => ({ username: u.username })),
            tags: broker.tags,
            configurations: broker.configurations,
            logs: broker.logs,
            created: broker.created,
          }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteBroker(brokerId);
          return this.json({ brokerId }, ctx);
        }
        if (method === "PUT") {
          const body = await req.json();
          const broker = this.service.updateBroker(brokerId, {
            engineVersion: body.engineVersion,
            hostInstanceType: body.hostInstanceType,
            autoMinorVersionUpgrade: body.autoMinorVersionUpgrade,
            securityGroups: body.securityGroups,
            logs: body.logs,
          });
          return this.json({ brokerId: broker.brokerId }, ctx);
        }
      }

      // List/Create brokers: /v1/brokers
      if (path === "/v1/brokers" || path === "/v1/brokers/") {
        if (method === "GET") {
          const brokers = this.service.listBrokers();
          return this.json({
            brokerSummaries: brokers.map((b) => ({
              brokerId: b.brokerId,
              brokerArn: b.brokerArn,
              brokerName: b.brokerName,
              brokerState: b.brokerState,
              deploymentMode: b.deploymentMode,
              engineType: b.engineType,
              hostInstanceType: b.hostInstanceType,
              created: b.created,
            })),
          }, ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          const result = this.service.createBroker({
            brokerName: body.brokerName,
            deploymentMode: body.deploymentMode,
            engineType: body.engineType,
            engineVersion: body.engineVersion,
            hostInstanceType: body.hostInstanceType,
            autoMinorVersionUpgrade: body.autoMinorVersionUpgrade,
            publiclyAccessible: body.publiclyAccessible,
            securityGroups: body.securityGroups,
            subnetIds: body.subnetIds,
            users: body.users,
            tags: body.tags,
            configuration: body.configuration,
            logs: body.logs,
          });
          return this.json({ brokerId: result.brokerId, brokerArn: result.brokerArn }, ctx);
        }
      }

      // --- Configurations ---

      // Single configuration: /v1/configurations/{configId}
      const configMatch = path.match(/^\/v1\/configurations\/([^/]+)$/);
      if (configMatch) {
        const configId = decodeURIComponent(configMatch[1]);
        if (method === "GET") {
          const config = this.service.describeConfiguration(configId);
          return this.json({
            id: config.configurationId,
            arn: config.configurationArn,
            name: config.name,
            engineType: config.engineType,
            engineVersion: config.engineVersion,
            latestRevision: config.latestRevision,
            created: config.created,
          }, ctx);
        }
        if (method === "PUT") {
          const body = await req.json();
          const config = this.service.updateConfiguration(configId, body.data, body.description);
          return this.json({
            id: config.configurationId,
            arn: config.configurationArn,
            latestRevision: config.latestRevision,
          }, ctx);
        }
      }

      // List/Create configurations: /v1/configurations
      if (path === "/v1/configurations" || path === "/v1/configurations/") {
        if (method === "GET") {
          const configs = this.service.listConfigurations();
          return this.json({
            configurations: configs.map((c) => ({
              id: c.configurationId,
              arn: c.configurationArn,
              name: c.name,
              engineType: c.engineType,
              engineVersion: c.engineVersion,
              latestRevision: c.latestRevision,
              created: c.created,
            })),
          }, ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          const config = this.service.createConfiguration({
            name: body.name,
            engineType: body.engineType,
            engineVersion: body.engineVersion,
            tags: body.tags,
          });
          return this.json({
            id: config.configurationId,
            arn: config.configurationArn,
            name: config.name,
            latestRevision: config.latestRevision,
            created: config.created,
          }, ctx);
        }
      }

      // --- Tags ---

      const tagsMatch = path.match(/^\/v1\/tags\/(.+)$/);
      if (tagsMatch) {
        const resourceArn = decodeURIComponent(tagsMatch[1]);
        if (method === "POST") {
          const body = await req.json();
          this.service.createTags(resourceArn, body.tags ?? {});
          return this.json({}, ctx);
        }
        if (method === "GET") {
          const tags = this.service.listTags(resourceArn);
          return this.json({ tags }, ctx);
        }
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown MQ operation: ${method} ${path}`, 400),
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
