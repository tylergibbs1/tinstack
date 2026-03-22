import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { IdentityStoreService } from "./identitystore-service";

export class IdentityStoreHandler {
  constructor(private service: IdentityStoreService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateUser": {
          const user = this.service.createUser(body.IdentityStoreId, body.UserName, body.DisplayName, body.Name, body.Emails);
          return this.json({ UserId: user.userId, IdentityStoreId: user.identityStoreId }, ctx);
        }
        case "DescribeUser": {
          const user = this.service.describeUser(body.IdentityStoreId, body.UserId);
          return this.json({
            UserId: user.userId, IdentityStoreId: user.identityStoreId,
            UserName: user.userName, DisplayName: user.displayName,
            Name: { FamilyName: user.name.familyName, GivenName: user.name.givenName },
            Emails: user.emails,
          }, ctx);
        }
        case "ListUsers": {
          const users = this.service.listUsers(body.IdentityStoreId);
          return this.json({
            Users: users.map(u => ({
              UserId: u.userId, UserName: u.userName, DisplayName: u.displayName,
              IdentityStoreId: u.identityStoreId,
            })),
          }, ctx);
        }
        case "DeleteUser": {
          this.service.deleteUser(body.IdentityStoreId, body.UserId);
          return this.json({}, ctx);
        }
        case "CreateGroup": {
          const group = this.service.createGroup(body.IdentityStoreId, body.DisplayName, body.Description);
          return this.json({ GroupId: group.groupId, IdentityStoreId: group.identityStoreId }, ctx);
        }
        case "DescribeGroup": {
          const group = this.service.describeGroup(body.IdentityStoreId, body.GroupId);
          return this.json({
            GroupId: group.groupId, IdentityStoreId: group.identityStoreId,
            DisplayName: group.displayName, Description: group.description,
          }, ctx);
        }
        case "ListGroups": {
          const groups = this.service.listGroups(body.IdentityStoreId);
          return this.json({
            Groups: groups.map(g => ({
              GroupId: g.groupId, DisplayName: g.displayName,
              IdentityStoreId: g.identityStoreId, Description: g.description,
            })),
          }, ctx);
        }
        case "DeleteGroup": {
          this.service.deleteGroup(body.IdentityStoreId, body.GroupId);
          return this.json({}, ctx);
        }
        case "CreateGroupMembership": {
          const m = this.service.createGroupMembership(body.IdentityStoreId, body.GroupId, body.MemberId?.UserId ?? "");
          return this.json({ MembershipId: m.membershipId, IdentityStoreId: m.identityStoreId }, ctx);
        }
        case "ListGroupMemberships": {
          const memberships = this.service.listGroupMemberships(body.IdentityStoreId, body.GroupId);
          return this.json({
            GroupMemberships: memberships.map(m => ({
              MembershipId: m.membershipId, GroupId: m.groupId,
              MemberId: { UserId: m.memberId.userId },
              IdentityStoreId: m.identityStoreId,
            })),
          }, ctx);
        }
        case "DeleteGroupMembership": {
          this.service.deleteGroupMembership(body.IdentityStoreId, body.MembershipId);
          return this.json({}, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown IdentityStore action: ${action}`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
