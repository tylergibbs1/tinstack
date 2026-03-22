import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { TransferService } from "./transfer-service";

export class TransferHandler {
  constructor(private service: TransferService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateServer":
          return this.createServer(body, ctx);
        case "DescribeServer":
          return this.describeServer(body, ctx);
        case "ListServers":
          return this.listServers(ctx);
        case "UpdateServer":
          return this.updateServer(body, ctx);
        case "DeleteServer":
          return this.deleteServer(body, ctx);
        case "StartServer":
          return this.startServer(body, ctx);
        case "StopServer":
          return this.stopServer(body, ctx);
        case "CreateUser":
          return this.createUser(body, ctx);
        case "DescribeUser":
          return this.describeUser(body, ctx);
        case "ListUsers":
          return this.listUsers(body, ctx);
        case "UpdateUser":
          return this.updateUser(body, ctx);
        case "DeleteUser":
          return this.deleteUser(body, ctx);
        case "TagResource":
          return this.tagResource(body, ctx);
        case "UntagResource":
          return this.untagResource(body, ctx);
        case "ListTagsForResource":
          return this.listTagsForResource(body, ctx);
        default:
          return jsonErrorResponse(
            new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400),
            ctx.requestId,
          );
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private createServer(body: any, ctx: RequestContext): Response {
    const serverId = this.service.createServer({
      domain: body.Domain,
      endpointType: body.EndpointType,
      identityProviderType: body.IdentityProviderType,
      loggingRole: body.LoggingRole,
      protocols: body.Protocols,
      securityPolicyName: body.SecurityPolicyName,
      tags: body.Tags,
    });
    return this.json({ ServerId: serverId }, ctx);
  }

  private describeServer(body: any, ctx: RequestContext): Response {
    const server = this.service.describeServer(body.ServerId);
    return this.json({
      Server: {
        Arn: server.arn,
        Domain: server.domain,
        EndpointType: server.endpointType,
        IdentityProviderType: server.identityProviderType,
        LoggingRole: server.loggingRole,
        Protocols: server.protocols,
        SecurityPolicyName: server.securityPolicyName,
        ServerId: server.serverId,
        State: server.state,
        Tags: server.tags,
        UserCount: server.userCount,
      },
    }, ctx);
  }

  private listServers(ctx: RequestContext): Response {
    const servers = this.service.listServers();
    return this.json({
      Servers: servers.map((s) => ({
        Arn: s.arn,
        Domain: s.domain,
        EndpointType: s.endpointType,
        IdentityProviderType: s.identityProviderType,
        LoggingRole: s.loggingRole,
        Protocols: s.protocols,
        ServerId: s.serverId,
        State: s.state,
        UserCount: s.userCount,
      })),
    }, ctx);
  }

  private updateServer(body: any, ctx: RequestContext): Response {
    const serverId = this.service.updateServer(body.ServerId, {
      endpointType: body.EndpointType,
      loggingRole: body.LoggingRole,
      protocols: body.Protocols,
      securityPolicyName: body.SecurityPolicyName,
    });
    return this.json({ ServerId: serverId }, ctx);
  }

  private deleteServer(body: any, ctx: RequestContext): Response {
    this.service.deleteServer(body.ServerId);
    return this.json({}, ctx);
  }

  private startServer(body: any, ctx: RequestContext): Response {
    this.service.startServer(body.ServerId);
    return this.json({}, ctx);
  }

  private stopServer(body: any, ctx: RequestContext): Response {
    this.service.stopServer(body.ServerId);
    return this.json({}, ctx);
  }

  private createUser(body: any, ctx: RequestContext): Response {
    const result = this.service.createUser({
      serverId: body.ServerId,
      userName: body.UserName,
      homeDirectory: body.HomeDirectory,
      homeDirectoryType: body.HomeDirectoryType,
      role: body.Role,
      tags: body.Tags,
    });
    return this.json({ ServerId: result.serverId, UserName: result.userName }, ctx);
  }

  private describeUser(body: any, ctx: RequestContext): Response {
    const user = this.service.describeUser(body.ServerId, body.UserName);
    return this.json({
      ServerId: body.ServerId,
      User: {
        Arn: user.arn,
        HomeDirectory: user.homeDirectory,
        HomeDirectoryType: user.homeDirectoryType,
        Role: user.role,
        Tags: user.tags,
        UserName: user.userName,
      },
    }, ctx);
  }

  private listUsers(body: any, ctx: RequestContext): Response {
    const users = this.service.listUsers(body.ServerId);
    return this.json({
      ServerId: body.ServerId,
      Users: users.map((u) => ({
        Arn: u.arn,
        HomeDirectory: u.homeDirectory,
        HomeDirectoryType: u.homeDirectoryType,
        Role: u.role,
        UserName: u.userName,
      })),
    }, ctx);
  }

  private updateUser(body: any, ctx: RequestContext): Response {
    const result = this.service.updateUser(body.ServerId, body.UserName, {
      homeDirectory: body.HomeDirectory,
      homeDirectoryType: body.HomeDirectoryType,
      role: body.Role,
    });
    return this.json({ ServerId: result.serverId, UserName: result.userName }, ctx);
  }

  private deleteUser(body: any, ctx: RequestContext): Response {
    this.service.deleteUser(body.ServerId, body.UserName);
    return this.json({}, ctx);
  }

  private tagResource(body: any, ctx: RequestContext): Response {
    this.service.tagResource(body.Arn, body.Tags ?? []);
    return this.json({}, ctx);
  }

  private untagResource(body: any, ctx: RequestContext): Response {
    this.service.untagResource(body.Arn, body.TagKeys ?? []);
    return this.json({}, ctx);
  }

  private listTagsForResource(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTagsForResource(body.Arn);
    return this.json({ Arn: body.Arn, Tags: tags }, ctx);
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
