import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlEnvelopeNoResult, xmlResponse } from "../../core/xml";
import type { ElastiCacheService, CacheCluster, ReplicationGroup, CacheSubnetGroup, CacheParameterGroup } from "./elasticache-service";

const NS = "http://elasticache.amazonaws.com/doc/2015-02-02/";

export class ElastiCacheQueryHandler {
  constructor(private service: ElastiCacheService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateCacheCluster": return this.createCacheCluster(params, ctx);
        case "DescribeCacheClusters": return this.describeCacheClusters(params, ctx);
        case "DeleteCacheCluster": return this.deleteCacheCluster(params, ctx);
        case "ModifyCacheCluster": return this.modifyCacheCluster(params, ctx);
        case "CreateReplicationGroup": return this.createReplicationGroup(params, ctx);
        case "DescribeReplicationGroups": return this.describeReplicationGroups(params, ctx);
        case "DeleteReplicationGroup": return this.deleteReplicationGroup(params, ctx);
        case "CreateCacheSubnetGroup": return this.createCacheSubnetGroup(params, ctx);
        case "DescribeCacheSubnetGroups": return this.describeCacheSubnetGroups(params, ctx);
        case "DeleteCacheSubnetGroup": return this.deleteCacheSubnetGroup(params, ctx);
        case "CreateCacheParameterGroup": return this.createCacheParameterGroup(params, ctx);
        case "DescribeCacheParameterGroups": return this.describeCacheParameterGroups(params, ctx);
        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private extractMembers(params: URLSearchParams, prefix: string): string[] {
    const result: string[] = [];
    let i = 1;
    while (params.has(`${prefix}.${i}`)) {
      result.push(params.get(`${prefix}.${i}`)!);
      i++;
    }
    return result;
  }

  // --- Cache Clusters ---

  private createCacheCluster(params: URLSearchParams, ctx: RequestContext): Response {
    const cluster = this.service.createCacheCluster(
      params.get("CacheClusterId")!,
      params.get("CacheNodeType") ?? undefined,
      params.get("Engine") ?? undefined,
      params.get("EngineVersion") ?? undefined,
      params.has("NumCacheNodes") ? parseInt(params.get("NumCacheNodes")!) : undefined,
      params.get("PreferredAvailabilityZone") ?? undefined,
      params.get("CacheSubnetGroupName") ?? undefined,
      params.get("CacheParameterGroupName") ?? undefined,
      params.has("Port") ? parseInt(params.get("Port")!) : undefined,
      ctx.region,
    );
    const xml = new XmlBuilder().raw(this.clusterXml(cluster));
    return xmlResponse(xmlEnvelope("CreateCacheCluster", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeCacheClusters(params: URLSearchParams, ctx: RequestContext): Response {
    const clusters = this.service.describeCacheClusters(
      params.get("CacheClusterId") ?? undefined,
      ctx.region,
    );
    const xml = new XmlBuilder().start("CacheClusters");
    for (const c of clusters) xml.raw(this.clusterXml(c));
    xml.end("CacheClusters");
    return xmlResponse(xmlEnvelope("DescribeCacheClusters", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteCacheCluster(params: URLSearchParams, ctx: RequestContext): Response {
    const cluster = this.service.deleteCacheCluster(params.get("CacheClusterId")!, ctx.region);
    const xml = new XmlBuilder().raw(this.clusterXml(cluster));
    return xmlResponse(xmlEnvelope("DeleteCacheCluster", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private modifyCacheCluster(params: URLSearchParams, ctx: RequestContext): Response {
    const cluster = this.service.modifyCacheCluster(
      params.get("CacheClusterId")!,
      params.has("NumCacheNodes") ? parseInt(params.get("NumCacheNodes")!) : undefined,
      params.get("CacheNodeType") ?? undefined,
      params.get("EngineVersion") ?? undefined,
      ctx.region,
    );
    const xml = new XmlBuilder().raw(this.clusterXml(cluster));
    return xmlResponse(xmlEnvelope("ModifyCacheCluster", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Replication Groups ---

  private createReplicationGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const rg = this.service.createReplicationGroup(
      params.get("ReplicationGroupId")!,
      params.get("ReplicationGroupDescription") ?? "",
      params.get("CacheNodeType") ?? undefined,
      params.has("NumNodeGroups") ? parseInt(params.get("NumNodeGroups")!) : undefined,
      params.get("AutomaticFailoverEnabled") === "true",
      ctx.region,
    );
    const xml = new XmlBuilder().raw(this.rgXml(rg));
    return xmlResponse(xmlEnvelope("CreateReplicationGroup", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeReplicationGroups(params: URLSearchParams, ctx: RequestContext): Response {
    const rgs = this.service.describeReplicationGroups(
      params.get("ReplicationGroupId") ?? undefined,
      ctx.region,
    );
    const xml = new XmlBuilder().start("ReplicationGroups");
    for (const rg of rgs) xml.raw(this.rgXml(rg));
    xml.end("ReplicationGroups");
    return xmlResponse(xmlEnvelope("DescribeReplicationGroups", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteReplicationGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const rg = this.service.deleteReplicationGroup(params.get("ReplicationGroupId")!, ctx.region);
    const xml = new XmlBuilder().raw(this.rgXml(rg));
    return xmlResponse(xmlEnvelope("DeleteReplicationGroup", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Subnet Groups ---

  private createCacheSubnetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const subnetIds = this.extractMembers(params, "SubnetIds.SubnetIdentifier");
    const sg = this.service.createCacheSubnetGroup(
      params.get("CacheSubnetGroupName")!,
      params.get("CacheSubnetGroupDescription") ?? "",
      subnetIds,
      ctx.region,
    );
    const xml = new XmlBuilder().raw(this.subnetGroupXml(sg));
    return xmlResponse(xmlEnvelope("CreateCacheSubnetGroup", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeCacheSubnetGroups(params: URLSearchParams, ctx: RequestContext): Response {
    const sgs = this.service.describeCacheSubnetGroups(
      params.get("CacheSubnetGroupName") ?? undefined,
      ctx.region,
    );
    const xml = new XmlBuilder().start("CacheSubnetGroups");
    for (const sg of sgs) xml.raw(this.subnetGroupXml(sg));
    xml.end("CacheSubnetGroups");
    return xmlResponse(xmlEnvelope("DescribeCacheSubnetGroups", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteCacheSubnetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteCacheSubnetGroup(params.get("CacheSubnetGroupName")!, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("DeleteCacheSubnetGroup", ctx.requestId, NS), ctx.requestId);
  }

  // --- Parameter Groups ---

  private createCacheParameterGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const pg = this.service.createCacheParameterGroup(
      params.get("CacheParameterGroupName")!,
      params.get("CacheParameterGroupFamily")!,
      params.get("Description") ?? "",
      ctx.region,
    );
    const xml = new XmlBuilder().raw(this.paramGroupXml(pg));
    return xmlResponse(xmlEnvelope("CreateCacheParameterGroup", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeCacheParameterGroups(params: URLSearchParams, ctx: RequestContext): Response {
    const pgs = this.service.describeCacheParameterGroups(
      params.get("CacheParameterGroupName") ?? undefined,
      ctx.region,
    );
    const xml = new XmlBuilder().start("CacheParameterGroups");
    for (const pg of pgs) xml.raw(this.paramGroupXml(pg));
    xml.end("CacheParameterGroups");
    return xmlResponse(xmlEnvelope("DescribeCacheParameterGroups", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- XML helpers ---

  private clusterXml(c: CacheCluster): string {
    const xml = new XmlBuilder()
      .start("CacheCluster")
      .elem("CacheClusterId", c.cacheClusterId)
      .elem("CacheClusterStatus", c.cacheClusterStatus)
      .elem("CacheNodeType", c.cacheNodeType)
      .elem("Engine", c.engine)
      .elem("EngineVersion", c.engineVersion)
      .elem("NumCacheNodes", c.numCacheNodes)
      .elem("PreferredAvailabilityZone", c.preferredAvailabilityZone)
      .elem("CacheClusterCreateTime", c.cacheClusterCreateTime)
      .elem("PreferredMaintenanceWindow", c.preferredMaintenanceWindow)
      .elem("ARN", c.cacheClusterArn);
    if (c.cacheSubnetGroupName) xml.elem("CacheSubnetGroupName", c.cacheSubnetGroupName);
    if (c.configurationEndpoint) {
      xml.start("ConfigurationEndpoint")
        .elem("Address", c.configurationEndpoint.address)
        .elem("Port", c.configurationEndpoint.port)
        .end("ConfigurationEndpoint");
    }
    xml.end("CacheCluster");
    return xml.build();
  }

  private rgXml(rg: ReplicationGroup): string {
    const xml = new XmlBuilder()
      .start("ReplicationGroup")
      .elem("ReplicationGroupId", rg.replicationGroupId)
      .elem("Description", rg.description)
      .elem("Status", rg.status)
      .elem("AutomaticFailover", rg.automaticFailover)
      .elem("ClusterEnabled", rg.clusterEnabled)
      .elem("ARN", rg.replicationGroupArn);
    if (rg.cacheNodeType) xml.elem("CacheNodeType", rg.cacheNodeType);
    xml.start("MemberClusters");
    for (const mc of rg.memberClusters) xml.elem("ClusterId", mc);
    xml.end("MemberClusters");
    xml.start("NodeGroups");
    for (const ng of rg.nodeGroups) {
      xml.start("NodeGroup")
        .elem("NodeGroupId", ng.nodeGroupId)
        .elem("Status", ng.status)
        .elem("Slots", ng.slots);
      if (ng.primaryEndpoint) {
        xml.start("PrimaryEndpoint")
          .elem("Address", ng.primaryEndpoint.address)
          .elem("Port", ng.primaryEndpoint.port)
          .end("PrimaryEndpoint");
      }
      xml.end("NodeGroup");
    }
    xml.end("NodeGroups");
    xml.end("ReplicationGroup");
    return xml.build();
  }

  private subnetGroupXml(sg: CacheSubnetGroup): string {
    const xml = new XmlBuilder()
      .start("CacheSubnetGroup")
      .elem("CacheSubnetGroupName", sg.cacheSubnetGroupName)
      .elem("CacheSubnetGroupDescription", sg.cacheSubnetGroupDescription)
      .elem("VpcId", sg.vpcId)
      .elem("ARN", sg.arn)
      .start("Subnets");
    for (const s of sg.subnets) {
      xml.start("Subnet")
        .elem("SubnetIdentifier", s.subnetIdentifier)
        .start("SubnetAvailabilityZone")
        .elem("Name", s.subnetAvailabilityZone.name)
        .end("SubnetAvailabilityZone")
        .end("Subnet");
    }
    xml.end("Subnets").end("CacheSubnetGroup");
    return xml.build();
  }

  private paramGroupXml(pg: CacheParameterGroup): string {
    return new XmlBuilder()
      .start("CacheParameterGroup")
      .elem("CacheParameterGroupName", pg.cacheParameterGroupName)
      .elem("CacheParameterGroupFamily", pg.cacheParameterGroupFamily)
      .elem("Description", pg.description)
      .elem("ARN", pg.arn)
      .elem("IsGlobal", pg.isGlobal)
      .end("CacheParameterGroup")
      .build();
  }
}
