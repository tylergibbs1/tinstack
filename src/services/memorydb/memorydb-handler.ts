import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { MemoryDBService } from "./memorydb-service";

export class MemoryDBHandler {
  constructor(private service: MemoryDBService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateCluster": {
          const c = this.service.createCluster(body.ClusterName, body.NodeType, body.ACLName, body.EngineVersion, body.NumShards, body.SubnetGroupName, body.ParameterGroupName, body.Tags, ctx.region);
          return this.json({ Cluster: this.fmtCluster(c) }, ctx);
        }
        case "DescribeClusters": {
          const clusters = this.service.describeClusters(body.ClusterName, ctx.region);
          return this.json({ Clusters: clusters.map((c) => this.fmtCluster(c)) }, ctx);
        }
        case "DeleteCluster": {
          const c = this.service.deleteCluster(body.ClusterName, ctx.region);
          return this.json({ Cluster: this.fmtCluster(c) }, ctx);
        }
        case "UpdateCluster": {
          const c = this.service.updateCluster(body.ClusterName, body, ctx.region);
          return this.json({ Cluster: this.fmtCluster(c) }, ctx);
        }
        case "CreateSubnetGroup": {
          const sg = this.service.createSubnetGroup(body.SubnetGroupName, body.SubnetIds ?? [], body.Description, ctx.region);
          return this.json({ SubnetGroup: { Name: sg.name, ARN: sg.arn, Description: sg.description, VpcId: sg.vpcId, Subnets: sg.subnetIds.map((id) => ({ Identifier: id })) } }, ctx);
        }
        case "DescribeSubnetGroups": {
          const groups = this.service.describeSubnetGroups(body.SubnetGroupName, ctx.region);
          return this.json({ SubnetGroups: groups.map((sg) => ({ Name: sg.name, ARN: sg.arn, Description: sg.description, VpcId: sg.vpcId })) }, ctx);
        }
        case "DeleteSubnetGroup":
          this.service.deleteSubnetGroup(body.SubnetGroupName, ctx.region);
          return this.json({}, ctx);
        case "CreateParameterGroup": {
          const pg = this.service.createParameterGroup(body.ParameterGroupName, body.Family, body.Description, ctx.region);
          return this.json({ ParameterGroup: { Name: pg.name, ARN: pg.arn, Family: pg.family, Description: pg.description } }, ctx);
        }
        case "DescribeParameterGroups": {
          const groups = this.service.describeParameterGroups(body.ParameterGroupName, ctx.region);
          return this.json({ ParameterGroups: groups.map((pg) => ({ Name: pg.name, ARN: pg.arn, Family: pg.family, Description: pg.description })) }, ctx);
        }
        case "CreateUser": {
          const u = this.service.createUser(body.UserName, body.AccessString, body.AuthenticationMode?.Type, ctx.region);
          return this.json({ User: { Name: u.name, ARN: u.arn, Status: u.status, AccessString: u.accessString, Authentication: u.authentication } }, ctx);
        }
        case "DescribeUsers": {
          const users = this.service.describeUsers(body.UserName, ctx.region);
          return this.json({ Users: users.map((u) => ({ Name: u.name, ARN: u.arn, Status: u.status, AccessString: u.accessString, Authentication: u.authentication })) }, ctx);
        }
        case "CreateACL": {
          const acl = this.service.createACL(body.ACLName, body.UserNames, ctx.region);
          return this.json({ ACL: { Name: acl.name, ARN: acl.arn, Status: acl.status, UserNames: acl.userNames } }, ctx);
        }
        case "DescribeACLs": {
          const acls = this.service.describeACLs(body.ACLName, ctx.region);
          return this.json({ ACLs: acls.map((a) => ({ Name: a.name, ARN: a.arn, Status: a.status, UserNames: a.userNames })) }, ctx);
        }
        case "TagResource": {
          const tags = this.service.tagResource(body.ResourceArn, body.Tags ?? []);
          return this.json({ TagList: tags }, ctx);
        }
        case "UntagResource": {
          const tags = this.service.untagResource(body.ResourceArn, body.TagKeys ?? []);
          return this.json({ TagList: tags }, ctx);
        }
        case "ListTags": {
          const tags = this.service.listTags(body.ResourceArn);
          return this.json({ TagList: tags }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private fmtCluster(c: any) {
    return { Name: c.name, ARN: c.arn, Status: c.status, NodeType: c.nodeType, EngineVersion: c.engineVersion, NumberOfShards: c.numberOfShards, SubnetGroupName: c.subnetGroupName, ParameterGroupName: c.parameterGroupName, ACLName: c.aclName };
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId } });
  }
}
