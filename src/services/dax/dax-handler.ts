import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { DaxService } from "./dax-service";

export class DaxHandler {
  constructor(private service: DaxService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateCluster": {
          const cluster = this.service.createCluster(
            body.ClusterName,
            body.NodeType,
            body.ReplicationFactor,
            body.Description,
            body.IamRoleArn,
            body.SubnetGroupName,
            body.SSESpecification,
            body.Tags,
            ctx.region,
          );
          return this.json({ Cluster: clusterToJson(cluster) }, ctx);
        }
        case "DescribeClusters": {
          const clusters = this.service.describeClusters(body.ClusterNames);
          return this.json({ Clusters: clusters.map(clusterToJson) }, ctx);
        }
        case "DeleteCluster": {
          const cluster = this.service.deleteCluster(body.ClusterName);
          return this.json({ Cluster: clusterToJson(cluster) }, ctx);
        }
        case "IncreaseReplicationFactor": {
          const cluster = this.service.increaseReplicationFactor(body.ClusterName, body.NewReplicationFactor, ctx.region);
          return this.json({ Cluster: clusterToJson(cluster) }, ctx);
        }
        case "DecreaseReplicationFactor": {
          const cluster = this.service.decreaseReplicationFactor(body.ClusterName, body.NewReplicationFactor);
          return this.json({ Cluster: clusterToJson(cluster) }, ctx);
        }
        case "CreateSubnetGroup": {
          const sg = this.service.createSubnetGroup(body.SubnetGroupName, body.Description, body.SubnetIds ?? []);
          return this.json({ SubnetGroup: subnetGroupToJson(sg) }, ctx);
        }
        case "DescribeSubnetGroups": {
          const groups = this.service.describeSubnetGroups(body.SubnetGroupNames);
          return this.json({ SubnetGroups: groups.map(subnetGroupToJson) }, ctx);
        }
        case "DeleteSubnetGroup": {
          this.service.deleteSubnetGroup(body.SubnetGroupName);
          return this.json({}, ctx);
        }
        case "CreateParameterGroup": {
          const pg = this.service.createParameterGroup(body.ParameterGroupName, body.Description);
          return this.json({ ParameterGroup: parameterGroupToJson(pg) }, ctx);
        }
        case "DescribeParameterGroups": {
          const groups = this.service.describeParameterGroups(body.ParameterGroupNames);
          return this.json({ ParameterGroups: groups.map(parameterGroupToJson) }, ctx);
        }
        case "DeleteParameterGroup": {
          this.service.deleteParameterGroup(body.ParameterGroupName);
          return this.json({}, ctx);
        }
        case "TagResource": {
          const tags = this.service.tagResource(body.ResourceName, body.Tags ?? []);
          return this.json({ Tags: tags }, ctx);
        }
        case "UntagResource": {
          const tags = this.service.untagResource(body.ResourceName, body.TagKeys ?? []);
          return this.json({ Tags: tags }, ctx);
        }
        case "ListTags": {
          const tags = this.service.listTags(body.ResourceName);
          return this.json({ Tags: tags }, ctx);
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

function clusterToJson(c: any): any {
  return {
    ClusterName: c.clusterName,
    ClusterArn: c.clusterArn,
    Description: c.description,
    NodeType: c.nodeType,
    Status: c.status,
    TotalNodes: c.totalNodes,
    ActiveNodes: c.activeNodes,
    Nodes: c.nodes.map((n: any) => ({
      NodeId: n.nodeId,
      Endpoint: n.endpoint,
      NodeCreateTime: n.nodeCreateTime,
      AvailabilityZone: n.availabilityZone,
      NodeStatus: n.nodeStatus,
    })),
    ClusterDiscoveryEndpoint: c.clusterDiscoveryEndpoint,
    IamRoleArn: c.iamRoleArn,
    ParameterGroup: c.parameterGroup,
    SubnetGroup: c.subnetGroup,
    SSEDescription: c.sseDescription,
    ClusterEndpointEncryptionType: c.clusterEndpointEncryptionType,
  };
}

function subnetGroupToJson(sg: any): any {
  return {
    SubnetGroupName: sg.subnetGroupName,
    Description: sg.description,
    Subnets: sg.subnets,
  };
}

function parameterGroupToJson(pg: any): any {
  return {
    ParameterGroupName: pg.parameterGroupName,
    Description: pg.description,
  };
}
