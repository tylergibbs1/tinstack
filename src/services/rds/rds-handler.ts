import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlEnvelopeNoResult, xmlResponse, AWS_NAMESPACES } from "../../core/xml";
import type { RdsService } from "./rds-service";

const NS = AWS_NAMESPACES.RDS;

export class RdsQueryHandler {
  constructor(private service: RdsService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateDBInstance": return this.createDbInstance(params, ctx);
        case "DescribeDBInstances": return this.describeDbInstances(params, ctx);
        case "ModifyDBInstance": return this.modifyDbInstance(params, ctx);
        case "DeleteDBInstance": return this.deleteDbInstance(params, ctx);
        case "CreateDBCluster": return this.createDbCluster(params, ctx);
        case "DescribeDBClusters": return this.describeDbClusters(params, ctx);
        case "DeleteDBCluster": return this.deleteDbCluster(params, ctx);
        case "CreateDBSubnetGroup": return this.createDbSubnetGroup(params, ctx);
        case "DescribeDBSubnetGroups": return this.describeDbSubnetGroups(params, ctx);
        case "DeleteDBSubnetGroup": return this.deleteDbSubnetGroup(params, ctx);
        case "CreateDBSnapshot": return this.createDbSnapshot(params, ctx);
        case "DescribeDBSnapshots": return this.describeDbSnapshots(params, ctx);
        case "DeleteDBSnapshot": return this.deleteDbSnapshot(params, ctx);
        case "DescribeDBEngineVersions": return this.describeDbEngineVersions(params, ctx);
        case "CreateDBInstanceReadReplica": return this.createDbInstanceReadReplica(params, ctx);
        case "PromoteReadReplica": return this.promoteReadReplica(params, ctx);
        case "RebootDBInstance": return this.rebootDbInstance(params, ctx);
        case "StartDBInstance": return this.startDbInstance(params, ctx);
        case "StopDBInstance": return this.stopDbInstance(params, ctx);
        case "ModifyDBCluster": return this.modifyDbCluster(params, ctx);
        case "CreateDBClusterSnapshot": return this.createDbClusterSnapshot(params, ctx);
        case "DescribeDBClusterSnapshots": return this.describeDbClusterSnapshots(params, ctx);
        case "DeleteDBClusterSnapshot": return this.deleteDbClusterSnapshot(params, ctx);
        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private instanceXml(inst: any): string {
    const xml = new XmlBuilder()
      .start("DBInstance")
        .elem("DBInstanceIdentifier", inst.dbInstanceIdentifier)
        .elem("DBInstanceClass", inst.dbInstanceClass)
        .elem("Engine", inst.engine)
        .elem("EngineVersion", inst.engineVersion)
        .elem("MasterUsername", inst.masterUsername)
        .elem("AllocatedStorage", inst.allocatedStorage)
        .elem("DBInstanceStatus", inst.dbInstanceStatus)
        .elem("DBInstanceArn", inst.arn)
        .elem("AvailabilityZone", inst.availabilityZone)
        .elem("MultiAZ", inst.multiAZ)
        .elem("StorageType", inst.storageType)
        .start("Endpoint")
          .elem("Address", inst.endpoint.address)
          .elem("Port", inst.endpoint.port)
        .end("Endpoint");
    if (inst.readReplicaSourceDBInstanceIdentifier) {
      xml.elem("ReadReplicaSourceDBInstanceIdentifier", inst.readReplicaSourceDBInstanceIdentifier);
    }
    if (inst.dbSubnetGroupName) {
      xml.start("DBSubnetGroup")
        .elem("DBSubnetGroupName", inst.dbSubnetGroupName)
      .end("DBSubnetGroup");
    }
    if (inst.vpcSecurityGroupIds.length > 0) {
      xml.start("VpcSecurityGroups");
      for (const sgId of inst.vpcSecurityGroupIds) {
        xml.start("VpcSecurityGroupMembership")
          .elem("VpcSecurityGroupId", sgId)
          .elem("Status", "active")
        .end("VpcSecurityGroupMembership");
      }
      xml.end("VpcSecurityGroups");
    }
    xml.end("DBInstance");
    return xml.build();
  }

  private clusterXml(cluster: any): string {
    const xml = new XmlBuilder()
      .start("DBCluster")
        .elem("DBClusterIdentifier", cluster.dbClusterIdentifier)
        .elem("Engine", cluster.engine)
        .elem("EngineVersion", cluster.engineVersion)
        .elem("MasterUsername", cluster.masterUsername)
        .elem("Status", cluster.status)
        .elem("Endpoint", cluster.endpoint)
        .elem("ReaderEndpoint", cluster.readerEndpoint)
        .elem("DBClusterArn", cluster.arn)
        .elem("Port", cluster.port)
        .start("AvailabilityZones");
    for (const az of cluster.availabilityZones) {
      xml.elem("AvailabilityZone", az);
    }
    xml.end("AvailabilityZones");
    if (cluster.vpcSecurityGroupIds.length > 0) {
      xml.start("VpcSecurityGroups");
      for (const sgId of cluster.vpcSecurityGroupIds) {
        xml.start("VpcSecurityGroupMembership")
          .elem("VpcSecurityGroupId", sgId)
          .elem("Status", "active")
        .end("VpcSecurityGroupMembership");
      }
      xml.end("VpcSecurityGroups");
    }
    xml.end("DBCluster");
    return xml.build();
  }

  private subnetGroupXml(group: any): string {
    const xml = new XmlBuilder()
      .start("DBSubnetGroup")
        .elem("DBSubnetGroupName", group.dbSubnetGroupName)
        .elem("DBSubnetGroupDescription", group.dbSubnetGroupDescription)
        .elem("DBSubnetGroupArn", group.arn)
        .elem("SubnetGroupStatus", group.status)
        .elem("VpcId", group.vpcId)
        .start("Subnets");
    for (const subnetId of group.subnetIds) {
      xml.start("Subnet")
        .elem("SubnetIdentifier", subnetId)
        .elem("SubnetStatus", "Active")
      .end("Subnet");
    }
    xml.end("Subnets")
      .end("DBSubnetGroup");
    return xml.build();
  }

  private snapshotXml(snap: any): string {
    return new XmlBuilder()
      .start("DBSnapshot")
        .elem("DBSnapshotIdentifier", snap.dbSnapshotIdentifier)
        .elem("DBInstanceIdentifier", snap.dbInstanceIdentifier)
        .elem("Engine", snap.engine)
        .elem("EngineVersion", snap.engineVersion)
        .elem("AllocatedStorage", snap.allocatedStorage)
        .elem("Status", snap.status)
        .elem("DBSnapshotArn", snap.arn)
        .elem("SnapshotType", snap.snapshotType)
        .elem("SnapshotCreateTime", snap.createdAt)
      .end("DBSnapshot")
      .build();
  }

  private createDbInstance(params: URLSearchParams, ctx: RequestContext): Response {
    const vpcSgIds = this.extractMemberList(params, "VpcSecurityGroupIds.VpcSecurityGroupId");
    const inst = this.service.createDbInstance(
      params.get("DBInstanceIdentifier")!,
      params.get("DBInstanceClass") ?? "db.t3.micro",
      params.get("Engine") ?? "mysql",
      params.get("MasterUsername") ?? "admin",
      parseInt(params.get("AllocatedStorage") ?? "20", 10),
      ctx.region,
      vpcSgIds,
      params.get("DBSubnetGroupName") ?? undefined,
      params.get("EngineVersion") ?? undefined,
    );
    return xmlResponse(xmlEnvelope("CreateDBInstance", ctx.requestId, this.instanceXml(inst), NS), ctx.requestId);
  }

  private describeDbInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const identifier = params.get("DBInstanceIdentifier") ?? undefined;
    const instances = this.service.describeDbInstances(identifier);
    const xml = new XmlBuilder().start("DBInstances");
    for (const inst of instances) xml.raw(this.instanceXml(inst));
    xml.end("DBInstances");
    return xmlResponse(xmlEnvelope("DescribeDBInstances", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private modifyDbInstance(params: URLSearchParams, ctx: RequestContext): Response {
    const inst = this.service.modifyDbInstance(params.get("DBInstanceIdentifier")!, {
      dbInstanceClass: params.get("DBInstanceClass") ?? undefined,
      allocatedStorage: params.has("AllocatedStorage") ? parseInt(params.get("AllocatedStorage")!, 10) : undefined,
      engineVersion: params.get("EngineVersion") ?? undefined,
    });
    return xmlResponse(xmlEnvelope("ModifyDBInstance", ctx.requestId, this.instanceXml(inst), NS), ctx.requestId);
  }

  private deleteDbInstance(params: URLSearchParams, ctx: RequestContext): Response {
    const inst = this.service.deleteDbInstance(params.get("DBInstanceIdentifier")!);
    return xmlResponse(xmlEnvelope("DeleteDBInstance", ctx.requestId, this.instanceXml(inst), NS), ctx.requestId);
  }

  private createDbCluster(params: URLSearchParams, ctx: RequestContext): Response {
    const vpcSgIds = this.extractMemberList(params, "VpcSecurityGroupIds.VpcSecurityGroupId");
    const cluster = this.service.createDbCluster(
      params.get("DBClusterIdentifier")!,
      params.get("Engine") ?? "aurora-mysql",
      params.get("MasterUsername") ?? "admin",
      ctx.region,
      vpcSgIds,
      params.get("EngineVersion") ?? undefined,
    );
    return xmlResponse(xmlEnvelope("CreateDBCluster", ctx.requestId, this.clusterXml(cluster), NS), ctx.requestId);
  }

  private describeDbClusters(params: URLSearchParams, ctx: RequestContext): Response {
    const identifier = params.get("DBClusterIdentifier") ?? undefined;
    const clusters = this.service.describeDbClusters(identifier);
    const xml = new XmlBuilder().start("DBClusters");
    for (const c of clusters) xml.raw(this.clusterXml(c));
    xml.end("DBClusters");
    return xmlResponse(xmlEnvelope("DescribeDBClusters", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteDbCluster(params: URLSearchParams, ctx: RequestContext): Response {
    const cluster = this.service.deleteDbCluster(params.get("DBClusterIdentifier")!);
    return xmlResponse(xmlEnvelope("DeleteDBCluster", ctx.requestId, this.clusterXml(cluster), NS), ctx.requestId);
  }

  private createDbSubnetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const subnetIds = this.extractMemberList(params, "SubnetIds.member");
    const group = this.service.createDbSubnetGroup(
      params.get("DBSubnetGroupName")!,
      params.get("DBSubnetGroupDescription") ?? "",
      subnetIds,
      ctx.region,
    );
    return xmlResponse(xmlEnvelope("CreateDBSubnetGroup", ctx.requestId, this.subnetGroupXml(group), NS), ctx.requestId);
  }

  private describeDbSubnetGroups(params: URLSearchParams, ctx: RequestContext): Response {
    const name = params.get("DBSubnetGroupName") ?? undefined;
    const groups = this.service.describeDbSubnetGroups(name);
    const xml = new XmlBuilder().start("DBSubnetGroups");
    for (const g of groups) xml.raw(this.subnetGroupXml(g));
    xml.end("DBSubnetGroups");
    return xmlResponse(xmlEnvelope("DescribeDBSubnetGroups", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteDbSubnetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteDbSubnetGroup(params.get("DBSubnetGroupName")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteDBSubnetGroup", ctx.requestId, NS), ctx.requestId);
  }

  private createDbSnapshot(params: URLSearchParams, ctx: RequestContext): Response {
    const snap = this.service.createDbSnapshot(
      params.get("DBSnapshotIdentifier")!,
      params.get("DBInstanceIdentifier")!,
      ctx.region,
    );
    return xmlResponse(xmlEnvelope("CreateDBSnapshot", ctx.requestId, this.snapshotXml(snap), NS), ctx.requestId);
  }

  private describeDbSnapshots(params: URLSearchParams, ctx: RequestContext): Response {
    const snapshotId = params.get("DBSnapshotIdentifier") ?? undefined;
    const instanceId = params.get("DBInstanceIdentifier") ?? undefined;
    const snapshots = this.service.describeDbSnapshots(snapshotId, instanceId);
    const xml = new XmlBuilder().start("DBSnapshots");
    for (const s of snapshots) xml.raw(this.snapshotXml(s));
    xml.end("DBSnapshots");
    return xmlResponse(xmlEnvelope("DescribeDBSnapshots", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteDbSnapshot(params: URLSearchParams, ctx: RequestContext): Response {
    const snap = this.service.deleteDbSnapshot(params.get("DBSnapshotIdentifier")!);
    return xmlResponse(xmlEnvelope("DeleteDBSnapshot", ctx.requestId, this.snapshotXml(snap), NS), ctx.requestId);
  }

  private describeDbEngineVersions(params: URLSearchParams, ctx: RequestContext): Response {
    const engine = params.get("Engine") ?? undefined;
    const versions = this.service.describeDbEngineVersions(engine);
    const xml = new XmlBuilder().start("DBEngineVersions");
    for (const v of versions) {
      xml.start("DBEngineVersion")
        .elem("Engine", v.engine)
        .elem("EngineVersion", v.engineVersion)
        .elem("DBEngineDescription", v.description)
        .elem("DBEngineVersionDescription", `${v.description} ${v.engineVersion}`)
      .end("DBEngineVersion");
    }
    xml.end("DBEngineVersions");
    return xmlResponse(xmlEnvelope("DescribeDBEngineVersions", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private clusterSnapshotXml(snap: any): string {
    return new XmlBuilder()
      .start("DBClusterSnapshot")
        .elem("DBClusterSnapshotIdentifier", snap.dbClusterSnapshotIdentifier)
        .elem("DBClusterIdentifier", snap.dbClusterIdentifier)
        .elem("Engine", snap.engine)
        .elem("EngineVersion", snap.engineVersion)
        .elem("Status", snap.status)
        .elem("DBClusterSnapshotArn", snap.arn)
        .elem("SnapshotType", snap.snapshotType)
        .elem("SnapshotCreateTime", snap.createdAt)
      .end("DBClusterSnapshot")
      .build();
  }

  private createDbInstanceReadReplica(params: URLSearchParams, ctx: RequestContext): Response {
    const inst = this.service.createDbInstanceReadReplica(
      params.get("DBInstanceIdentifier")!,
      params.get("SourceDBInstanceIdentifier")!,
      ctx.region,
      params.get("DBInstanceClass") ?? undefined,
    );
    return xmlResponse(xmlEnvelope("CreateDBInstanceReadReplica", ctx.requestId, this.instanceXml(inst), NS), ctx.requestId);
  }

  private promoteReadReplica(params: URLSearchParams, ctx: RequestContext): Response {
    const inst = this.service.promoteReadReplica(params.get("DBInstanceIdentifier")!);
    return xmlResponse(xmlEnvelope("PromoteReadReplica", ctx.requestId, this.instanceXml(inst), NS), ctx.requestId);
  }

  private rebootDbInstance(params: URLSearchParams, ctx: RequestContext): Response {
    const inst = this.service.rebootDbInstance(params.get("DBInstanceIdentifier")!);
    return xmlResponse(xmlEnvelope("RebootDBInstance", ctx.requestId, this.instanceXml(inst), NS), ctx.requestId);
  }

  private startDbInstance(params: URLSearchParams, ctx: RequestContext): Response {
    const inst = this.service.startDbInstance(params.get("DBInstanceIdentifier")!);
    return xmlResponse(xmlEnvelope("StartDBInstance", ctx.requestId, this.instanceXml(inst), NS), ctx.requestId);
  }

  private stopDbInstance(params: URLSearchParams, ctx: RequestContext): Response {
    const inst = this.service.stopDbInstance(params.get("DBInstanceIdentifier")!);
    return xmlResponse(xmlEnvelope("StopDBInstance", ctx.requestId, this.instanceXml(inst), NS), ctx.requestId);
  }

  private modifyDbCluster(params: URLSearchParams, ctx: RequestContext): Response {
    const cluster = this.service.modifyDbCluster(params.get("DBClusterIdentifier")!, {
      engineVersion: params.get("EngineVersion") ?? undefined,
      deletionProtection: params.has("DeletionProtection") ? params.get("DeletionProtection") === "true" : undefined,
    });
    return xmlResponse(xmlEnvelope("ModifyDBCluster", ctx.requestId, this.clusterXml(cluster), NS), ctx.requestId);
  }

  private createDbClusterSnapshot(params: URLSearchParams, ctx: RequestContext): Response {
    const snap = this.service.createDbClusterSnapshot(
      params.get("DBClusterSnapshotIdentifier")!,
      params.get("DBClusterIdentifier")!,
      ctx.region,
    );
    return xmlResponse(xmlEnvelope("CreateDBClusterSnapshot", ctx.requestId, this.clusterSnapshotXml(snap), NS), ctx.requestId);
  }

  private describeDbClusterSnapshots(params: URLSearchParams, ctx: RequestContext): Response {
    const snapshotId = params.get("DBClusterSnapshotIdentifier") ?? undefined;
    const clusterId = params.get("DBClusterIdentifier") ?? undefined;
    const snapshots = this.service.describeDbClusterSnapshots(snapshotId, clusterId);
    const xml = new XmlBuilder().start("DBClusterSnapshots");
    for (const s of snapshots) xml.raw(this.clusterSnapshotXml(s));
    xml.end("DBClusterSnapshots");
    return xmlResponse(xmlEnvelope("DescribeDBClusterSnapshots", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteDbClusterSnapshot(params: URLSearchParams, ctx: RequestContext): Response {
    const snap = this.service.deleteDbClusterSnapshot(params.get("DBClusterSnapshotIdentifier")!);
    return xmlResponse(xmlEnvelope("DeleteDBClusterSnapshot", ctx.requestId, this.clusterSnapshotXml(snap), NS), ctx.requestId);
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
}
