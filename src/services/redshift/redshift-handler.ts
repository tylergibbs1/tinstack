import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlEnvelopeNoResult, xmlResponse } from "../../core/xml";
import type { RedshiftService, RedshiftCluster, ClusterSubnetGroup, ClusterParameterGroup, ClusterSnapshot } from "./redshift-service";

const NS = "http://redshift.amazonaws.com/doc/2012-12-01/";

export class RedshiftQueryHandler {
  constructor(private service: RedshiftService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateCluster": return this.createCluster(params, ctx);
        case "DescribeClusters": return this.describeClusters(params, ctx);
        case "DeleteCluster": return this.deleteCluster(params, ctx);
        case "ModifyCluster": return this.modifyCluster(params, ctx);
        case "PauseCluster": return this.pauseCluster(params, ctx);
        case "ResumeCluster": return this.resumeCluster(params, ctx);
        case "CreateClusterSubnetGroup": return this.createClusterSubnetGroup(params, ctx);
        case "DescribeClusterSubnetGroups": return this.describeClusterSubnetGroups(params, ctx);
        case "DeleteClusterSubnetGroup": return this.deleteClusterSubnetGroup(params, ctx);
        case "CreateClusterParameterGroup": return this.createClusterParameterGroup(params, ctx);
        case "DescribeClusterParameterGroups": return this.describeClusterParameterGroups(params, ctx);
        case "CreateClusterSnapshot": return this.createClusterSnapshot(params, ctx);
        case "DescribeClusterSnapshots": return this.describeClusterSnapshots(params, ctx);
        case "DeleteClusterSnapshot": return this.deleteClusterSnapshot(params, ctx);
        case "RestoreFromClusterSnapshot": return this.restoreFromClusterSnapshot(params, ctx);
        case "CreateTags": return this.createTags(params, ctx);
        case "DescribeTags": return this.describeTags(params, ctx);
        case "DeleteTags": return this.deleteTags(params, ctx);
        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private clusterXml(c: RedshiftCluster): string {
    const xml = new XmlBuilder()
      .start("Cluster")
        .elem("ClusterIdentifier", c.clusterIdentifier)
        .elem("NodeType", c.nodeType)
        .elem("MasterUsername", c.masterUsername)
        .elem("DBName", c.dbName)
        .elem("ClusterStatus", c.clusterStatus)
        .start("Endpoint")
          .elem("Address", c.endpoint.address)
          .elem("Port", c.endpoint.port)
        .end("Endpoint")
        .elem("ClusterArn", c.arn)
        .elem("NumberOfNodes", c.numberOfNodes)
        .elem("ClusterVersion", c.clusterVersion)
        .elem("Encrypted", c.encrypted)
        .elem("PubliclyAccessible", c.publiclyAccessible);
    if (c.clusterSubnetGroupName) {
      xml.elem("ClusterSubnetGroupName", c.clusterSubnetGroupName);
    }
    if (c.tags.length > 0) {
      xml.start("Tags");
      for (const t of c.tags) {
        xml.start("Tag").elem("Key", t.Key).elem("Value", t.Value).end("Tag");
      }
      xml.end("Tags");
    }
    xml.end("Cluster");
    return xml.build();
  }

  private subnetGroupXml(g: ClusterSubnetGroup): string {
    const xml = new XmlBuilder()
      .start("ClusterSubnetGroup")
        .elem("ClusterSubnetGroupName", g.clusterSubnetGroupName)
        .elem("Description", g.description)
        .elem("VpcId", g.vpcId)
        .elem("SubnetGroupStatus", g.status)
        .start("Subnets");
    for (const s of g.subnetIds) {
      xml.start("Subnet").elem("SubnetIdentifier", s).elem("SubnetStatus", "Active").end("Subnet");
    }
    xml.end("Subnets").end("ClusterSubnetGroup");
    return xml.build();
  }

  private parameterGroupXml(pg: ClusterParameterGroup): string {
    return new XmlBuilder()
      .start("ClusterParameterGroup")
        .elem("ParameterGroupName", pg.parameterGroupName)
        .elem("ParameterGroupFamily", pg.parameterGroupFamily)
        .elem("Description", pg.description)
      .end("ClusterParameterGroup")
      .build();
  }

  private snapshotXml(s: ClusterSnapshot): string {
    return new XmlBuilder()
      .start("Snapshot")
        .elem("SnapshotIdentifier", s.snapshotIdentifier)
        .elem("ClusterIdentifier", s.clusterIdentifier)
        .elem("Status", s.status)
        .elem("SnapshotType", s.snapshotType)
        .elem("NodeType", s.nodeType)
        .elem("NumberOfNodes", s.numberOfNodes)
        .elem("MasterUsername", s.masterUsername)
        .elem("DBName", s.dbName)
        .elem("Encrypted", s.encrypted)
        .elem("SnapshotCreateTime", s.createdAt)
      .end("Snapshot")
      .build();
  }

  private createCluster(params: URLSearchParams, ctx: RequestContext): Response {
    const tags = this.extractTags(params);
    const cluster = this.service.createCluster(
      params.get("ClusterIdentifier")!,
      params.get("NodeType") ?? "dc2.large",
      params.get("MasterUsername") ?? "admin",
      params.get("MasterUserPassword") ?? "password",
      ctx.region,
      params.get("DBName") ?? undefined,
      params.has("NumberOfNodes") ? parseInt(params.get("NumberOfNodes")!, 10) : undefined,
      params.get("ClusterSubnetGroupName") ?? undefined,
      params.get("Encrypted") === "true",
      params.get("PubliclyAccessible") === "true",
      tags.length > 0 ? tags : undefined,
    );
    return xmlResponse(xmlEnvelope("CreateCluster", ctx.requestId, this.clusterXml(cluster), NS), ctx.requestId);
  }

  private describeClusters(params: URLSearchParams, ctx: RequestContext): Response {
    const identifier = params.get("ClusterIdentifier") ?? undefined;
    const clusters = this.service.describeClusters(identifier);
    const xml = new XmlBuilder().start("Clusters");
    for (const c of clusters) xml.raw(this.clusterXml(c));
    xml.end("Clusters");
    return xmlResponse(xmlEnvelope("DescribeClusters", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteCluster(params: URLSearchParams, ctx: RequestContext): Response {
    const cluster = this.service.deleteCluster(params.get("ClusterIdentifier")!);
    return xmlResponse(xmlEnvelope("DeleteCluster", ctx.requestId, this.clusterXml(cluster), NS), ctx.requestId);
  }

  private modifyCluster(params: URLSearchParams, ctx: RequestContext): Response {
    const cluster = this.service.modifyCluster(params.get("ClusterIdentifier")!, {
      nodeType: params.get("NodeType") ?? undefined,
      numberOfNodes: params.has("NumberOfNodes") ? parseInt(params.get("NumberOfNodes")!, 10) : undefined,
      encrypted: params.has("Encrypted") ? params.get("Encrypted") === "true" : undefined,
    });
    return xmlResponse(xmlEnvelope("ModifyCluster", ctx.requestId, this.clusterXml(cluster), NS), ctx.requestId);
  }

  private pauseCluster(params: URLSearchParams, ctx: RequestContext): Response {
    const cluster = this.service.pauseCluster(params.get("ClusterIdentifier")!);
    return xmlResponse(xmlEnvelope("PauseCluster", ctx.requestId, this.clusterXml(cluster), NS), ctx.requestId);
  }

  private resumeCluster(params: URLSearchParams, ctx: RequestContext): Response {
    const cluster = this.service.resumeCluster(params.get("ClusterIdentifier")!);
    return xmlResponse(xmlEnvelope("ResumeCluster", ctx.requestId, this.clusterXml(cluster), NS), ctx.requestId);
  }

  private createClusterSubnetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const subnetIds = this.extractMemberList(params, "SubnetIds.SubnetIdentifier");
    const group = this.service.createClusterSubnetGroup(
      params.get("ClusterSubnetGroupName")!,
      params.get("Description") ?? "",
      subnetIds,
      ctx.region,
    );
    return xmlResponse(xmlEnvelope("CreateClusterSubnetGroup", ctx.requestId, this.subnetGroupXml(group), NS), ctx.requestId);
  }

  private describeClusterSubnetGroups(params: URLSearchParams, ctx: RequestContext): Response {
    const name = params.get("ClusterSubnetGroupName") ?? undefined;
    const groups = this.service.describeClusterSubnetGroups(name);
    const xml = new XmlBuilder().start("ClusterSubnetGroups");
    for (const g of groups) xml.raw(this.subnetGroupXml(g));
    xml.end("ClusterSubnetGroups");
    return xmlResponse(xmlEnvelope("DescribeClusterSubnetGroups", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteClusterSubnetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteClusterSubnetGroup(params.get("ClusterSubnetGroupName")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteClusterSubnetGroup", ctx.requestId, NS), ctx.requestId);
  }

  private createClusterParameterGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const pg = this.service.createClusterParameterGroup(
      params.get("ParameterGroupName")!,
      params.get("ParameterGroupFamily") ?? "redshift-1.0",
      params.get("Description") ?? "",
      ctx.region,
    );
    return xmlResponse(xmlEnvelope("CreateClusterParameterGroup", ctx.requestId, this.parameterGroupXml(pg), NS), ctx.requestId);
  }

  private describeClusterParameterGroups(params: URLSearchParams, ctx: RequestContext): Response {
    const name = params.get("ParameterGroupName") ?? undefined;
    const groups = this.service.describeClusterParameterGroups(name);
    const xml = new XmlBuilder().start("ParameterGroups");
    for (const pg of groups) xml.raw(this.parameterGroupXml(pg));
    xml.end("ParameterGroups");
    return xmlResponse(xmlEnvelope("DescribeClusterParameterGroups", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private createClusterSnapshot(params: URLSearchParams, ctx: RequestContext): Response {
    const snap = this.service.createClusterSnapshot(
      params.get("SnapshotIdentifier")!,
      params.get("ClusterIdentifier")!,
      ctx.region,
    );
    return xmlResponse(xmlEnvelope("CreateClusterSnapshot", ctx.requestId, this.snapshotXml(snap), NS), ctx.requestId);
  }

  private describeClusterSnapshots(params: URLSearchParams, ctx: RequestContext): Response {
    const snapshotId = params.get("SnapshotIdentifier") ?? undefined;
    const clusterId = params.get("ClusterIdentifier") ?? undefined;
    const snaps = this.service.describeClusterSnapshots(snapshotId, clusterId);
    const xml = new XmlBuilder().start("Snapshots");
    for (const s of snaps) xml.raw(this.snapshotXml(s));
    xml.end("Snapshots");
    return xmlResponse(xmlEnvelope("DescribeClusterSnapshots", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteClusterSnapshot(params: URLSearchParams, ctx: RequestContext): Response {
    const snap = this.service.deleteClusterSnapshot(params.get("SnapshotIdentifier")!);
    return xmlResponse(xmlEnvelope("DeleteClusterSnapshot", ctx.requestId, this.snapshotXml(snap), NS), ctx.requestId);
  }

  private restoreFromClusterSnapshot(params: URLSearchParams, ctx: RequestContext): Response {
    const cluster = this.service.restoreFromClusterSnapshot(
      params.get("ClusterIdentifier")!,
      params.get("SnapshotIdentifier")!,
      ctx.region,
    );
    return xmlResponse(xmlEnvelope("RestoreFromClusterSnapshot", ctx.requestId, this.clusterXml(cluster), NS), ctx.requestId);
  }

  private createTags(params: URLSearchParams, ctx: RequestContext): Response {
    const resourceName = params.get("ResourceName")!;
    const tags = this.extractTags(params);
    this.service.createTags(resourceName, tags);
    return xmlResponse(xmlEnvelopeNoResult("CreateTags", ctx.requestId, NS), ctx.requestId);
  }

  private describeTags(params: URLSearchParams, ctx: RequestContext): Response {
    const resourceName = params.get("ResourceName") ?? undefined;
    const resourceType = params.get("ResourceType") ?? undefined;
    const tags = this.service.describeTags(resourceName, resourceType);
    const xml = new XmlBuilder().start("TaggedResources");
    for (const t of tags) {
      xml.start("TaggedResource")
        .elem("ResourceName", t.resourceName)
        .elem("ResourceType", t.resourceType)
        .start("Tag").elem("Key", t.Key).elem("Value", t.Value).end("Tag")
      .end("TaggedResource");
    }
    xml.end("TaggedResources");
    return xmlResponse(xmlEnvelope("DescribeTags", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteTags(params: URLSearchParams, ctx: RequestContext): Response {
    const resourceName = params.get("ResourceName")!;
    const tagKeys = this.extractMemberList(params, "TagKeys.TagKey");
    this.service.deleteTags(resourceName, tagKeys);
    return xmlResponse(xmlEnvelopeNoResult("DeleteTags", ctx.requestId, NS), ctx.requestId);
  }

  private extractMemberList(params: URLSearchParams, prefix: string): string[] {
    const result: string[] = [];
    let i = 1;
    while (params.has(`${prefix}.${i}`)) {
      result.push(params.get(`${prefix}.${i}`)!);
      i++;
    }
    return result;
  }

  private extractTags(params: URLSearchParams): { Key: string; Value: string }[] {
    const tags: { Key: string; Value: string }[] = [];
    let i = 1;
    while (params.has(`Tags.Tag.${i}.Key`)) {
      tags.push({
        Key: params.get(`Tags.Tag.${i}.Key`)!,
        Value: params.get(`Tags.Tag.${i}.Value`) ?? "",
      });
      i++;
    }
    return tags;
  }
}
