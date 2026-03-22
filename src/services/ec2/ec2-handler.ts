import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlResponse } from "../../core/xml";
import type { Ec2Service, IpPermission, Ec2Tag, Ec2Instance, InstanceState, Volume, Image, NetworkInterface, VpcEndpoint, MockInstanceType } from "./ec2-service";

const NS = "http://ec2.amazonaws.com/doc/2016-11-15/";

function ec2Envelope(action: string, requestId: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><${action}Response xmlns="${NS}"><requestId>${requestId}</requestId>${body}</${action}Response>`;
}

function ec2ReturnTrue(action: string, requestId: string): string {
  return ec2Envelope(action, requestId, `<return>true</return>`);
}

export class Ec2QueryHandler {
  constructor(private service: Ec2Service) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        // VPC
        case "CreateVpc": return this.createVpc(params, ctx);
        case "DescribeVpcs": return this.describeVpcs(params, ctx);
        case "DeleteVpc": return this.deleteVpc(params, ctx);
        case "ModifyVpcAttribute": return this.modifyVpcAttribute(params, ctx);

        // Tags
        case "CreateTags": return this.createTags(params, ctx);
        case "DescribeTags": return this.describeTags(params, ctx);

        // Subnets
        case "CreateSubnet": return this.createSubnet(params, ctx);
        case "DescribeSubnets": return this.describeSubnets(params, ctx);
        case "DeleteSubnet": return this.deleteSubnet(params, ctx);
        case "ModifySubnetAttribute": return this.modifySubnetAttribute(params, ctx);

        // Security Groups
        case "CreateSecurityGroup": return this.createSecurityGroup(params, ctx);
        case "DescribeSecurityGroups": return this.describeSecurityGroups(params, ctx);
        case "DeleteSecurityGroup": return this.deleteSecurityGroup(params, ctx);
        case "AuthorizeSecurityGroupIngress": return this.authorizeSecurityGroupIngress(params, ctx);
        case "AuthorizeSecurityGroupEgress": return this.authorizeSecurityGroupEgress(params, ctx);
        case "RevokeSecurityGroupIngress": return this.revokeSecurityGroupIngress(params, ctx);
        case "RevokeSecurityGroupEgress": return this.revokeSecurityGroupEgress(params, ctx);

        // Internet Gateways
        case "CreateInternetGateway": return this.createInternetGateway(params, ctx);
        case "DescribeInternetGateways": return this.describeInternetGateways(params, ctx);
        case "DeleteInternetGateway": return this.deleteInternetGateway(params, ctx);
        case "AttachInternetGateway": return this.attachInternetGateway(params, ctx);
        case "DetachInternetGateway": return this.detachInternetGateway(params, ctx);

        // Route Tables
        case "CreateRouteTable": return this.createRouteTable(params, ctx);
        case "DescribeRouteTables": return this.describeRouteTables(params, ctx);
        case "DeleteRouteTable": return this.deleteRouteTable(params, ctx);
        case "CreateRoute": return this.createRoute(params, ctx);
        case "DeleteRoute": return this.deleteRoute(params, ctx);
        case "AssociateRouteTable": return this.associateRouteTable(params, ctx);
        case "DisassociateRouteTable": return this.disassociateRouteTable(params, ctx);

        // NAT Gateways
        case "CreateNatGateway": return this.createNatGateway(params, ctx);
        case "DescribeNatGateways": return this.describeNatGateways(params, ctx);
        case "DeleteNatGateway": return this.deleteNatGateway(params, ctx);

        // Elastic IPs
        case "AllocateAddress": return this.allocateAddress(params, ctx);
        case "DescribeAddresses": return this.describeAddresses(params, ctx);
        case "ReleaseAddress": return this.releaseAddress(params, ctx);

        // Network ACLs
        case "DescribeNetworkAcls": return this.describeNetworkAcls(params, ctx);

        // Availability Zones & Regions
        case "DescribeAvailabilityZones": return this.describeAvailabilityZones(params, ctx);
        case "DescribeRegions": return this.describeRegions(params, ctx);

        // Account Attributes
        case "DescribeAccountAttributes": return this.describeAccountAttributes(params, ctx);

        // Instances
        case "RunInstances": return this.runInstances(params, ctx);
        case "DescribeInstances": return this.describeInstances(params, ctx);
        case "TerminateInstances": return this.terminateInstances(params, ctx);
        case "StartInstances": return this.startInstances(params, ctx);
        case "StopInstances": return this.stopInstances(params, ctx);
        case "RebootInstances": return this.rebootInstances(params, ctx);
        case "DescribeInstanceStatus": return this.describeInstanceStatus(params, ctx);
        case "ModifyInstanceAttribute": return this.modifyInstanceAttribute(params, ctx);

        // Key Pairs
        case "CreateKeyPair": return this.createKeyPair(params, ctx);
        case "DescribeKeyPairs": return this.describeKeyPairs(params, ctx);
        case "DeleteKeyPair": return this.deleteKeyPair(params, ctx);
        case "ImportKeyPair": return this.importKeyPair(params, ctx);

        // EBS Volumes
        case "CreateVolume": return this.createVolume(params, ctx);
        case "DescribeVolumes": return this.describeVolumes(params, ctx);
        case "DeleteVolume": return this.deleteVolume(params, ctx);
        case "AttachVolume": return this.attachVolume(params, ctx);
        case "DetachVolume": return this.detachVolume(params, ctx);
        case "ModifyVolume": return this.modifyVolume(params, ctx);

        // AMIs
        case "CreateImage": return this.createImage(params, ctx);
        case "DescribeImages": return this.describeImages(params, ctx);
        case "DeregisterImage": return this.deregisterImage(params, ctx);
        case "CopyImage": return this.copyImage(params, ctx);

        // Network Interfaces
        case "CreateNetworkInterface": return this.createNetworkInterface(params, ctx);
        case "DescribeNetworkInterfaces": return this.describeNetworkInterfaces(params, ctx);
        case "DeleteNetworkInterface": return this.deleteNetworkInterface(params, ctx);
        case "AttachNetworkInterface": return this.attachNetworkInterface(params, ctx);
        case "DetachNetworkInterface": return this.detachNetworkInterface(params, ctx);

        // VPC Endpoints
        case "CreateVpcEndpoint": return this.createVpcEndpoint(params, ctx);
        case "DescribeVpcEndpoints": return this.describeVpcEndpoints(params, ctx);
        case "DeleteVpcEndpoints": return this.deleteVpcEndpoints(params, ctx);
        case "ModifyVpcEndpoint": return this.modifyVpcEndpoint(params, ctx);

        // Instance Types
        case "DescribeInstanceTypes": return this.describeInstanceTypes(params, ctx);

        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  // --- Helpers ---

  private parseListParam(params: URLSearchParams, prefix: string): string[] {
    const result: string[] = [];
    let i = 1;
    while (params.has(`${prefix}.${i}`)) {
      result.push(params.get(`${prefix}.${i}`)!);
      i++;
    }
    return result;
  }

  private parseFilters(params: URLSearchParams): { name: string; values: string[] }[] {
    const filters: { name: string; values: string[] }[] = [];
    let i = 1;
    while (params.has(`Filter.${i}.Name`)) {
      const name = params.get(`Filter.${i}.Name`)!;
      const values: string[] = [];
      let j = 1;
      while (params.has(`Filter.${i}.Value.${j}`)) {
        values.push(params.get(`Filter.${i}.Value.${j}`)!);
        j++;
      }
      filters.push({ name, values });
      i++;
    }
    return filters;
  }

  private parseIpPermissions(params: URLSearchParams): IpPermission[] {
    const perms: IpPermission[] = [];
    let i = 1;
    while (params.has(`IpPermissions.${i}.IpProtocol`)) {
      const perm: IpPermission = {
        ipProtocol: params.get(`IpPermissions.${i}.IpProtocol`)!,
        fromPort: params.has(`IpPermissions.${i}.FromPort`) ? parseInt(params.get(`IpPermissions.${i}.FromPort`)!) : undefined,
        toPort: params.has(`IpPermissions.${i}.ToPort`) ? parseInt(params.get(`IpPermissions.${i}.ToPort`)!) : undefined,
        ipRanges: [],
        ipv6Ranges: [],
        prefixListIds: [],
        userIdGroupPairs: [],
      };
      let j = 1;
      while (params.has(`IpPermissions.${i}.IpRanges.${j}.CidrIp`)) {
        perm.ipRanges.push({
          cidrIp: params.get(`IpPermissions.${i}.IpRanges.${j}.CidrIp`)!,
          description: params.get(`IpPermissions.${i}.IpRanges.${j}.Description`) ?? undefined,
        });
        j++;
      }
      j = 1;
      while (params.has(`IpPermissions.${i}.Ipv6Ranges.${j}.CidrIpv6`)) {
        perm.ipv6Ranges.push({
          cidrIpv6: params.get(`IpPermissions.${i}.Ipv6Ranges.${j}.CidrIpv6`)!,
          description: params.get(`IpPermissions.${i}.Ipv6Ranges.${j}.Description`) ?? undefined,
        });
        j++;
      }
      j = 1;
      while (params.has(`IpPermissions.${i}.UserIdGroupPairs.${j}.GroupId`)) {
        perm.userIdGroupPairs.push({
          groupId: params.get(`IpPermissions.${i}.UserIdGroupPairs.${j}.GroupId`)!,
          userId: params.get(`IpPermissions.${i}.UserIdGroupPairs.${j}.UserId`) ?? undefined,
        });
        j++;
      }
      perms.push(perm);
      i++;
    }
    return perms;
  }

  private parseTags(params: URLSearchParams): Ec2Tag[] {
    const tags: Ec2Tag[] = [];
    let i = 1;
    while (params.has(`Tag.${i}.Key`)) {
      tags.push({
        key: params.get(`Tag.${i}.Key`)!,
        value: params.get(`Tag.${i}.Value`) ?? "",
      });
      i++;
    }
    return tags;
  }

  private tagsXml(tags: { key: string; value: string }[]): string {
    if (tags.length === 0) return "<tagSet/>";
    const xml = new XmlBuilder().start("tagSet");
    for (const t of tags) {
      xml.start("item").elem("key", t.key).elem("value", t.value).end("item");
    }
    xml.end("tagSet");
    return xml.build();
  }

  private ipPermissionsXml(perms: IpPermission[]): string {
    const xml = new XmlBuilder();
    for (const p of perms) {
      xml.start("item");
      xml.elem("ipProtocol", p.ipProtocol);
      if (p.fromPort !== undefined) xml.elem("fromPort", p.fromPort);
      if (p.toPort !== undefined) xml.elem("toPort", p.toPort);
      xml.start("ipRanges");
      for (const r of p.ipRanges) {
        xml.start("item").elem("cidrIp", r.cidrIp);
        if (r.description) xml.elem("description", r.description);
        xml.end("item");
      }
      xml.end("ipRanges");
      xml.start("ipv6Ranges");
      for (const r of p.ipv6Ranges) {
        xml.start("item").elem("cidrIpv6", r.cidrIpv6);
        if (r.description) xml.elem("description", r.description);
        xml.end("item");
      }
      xml.end("ipv6Ranges");
      xml.start("prefixListIds").end("prefixListIds");
      xml.start("groups");
      for (const g of p.userIdGroupPairs) {
        xml.start("item").elem("groupId", g.groupId);
        if (g.userId) xml.elem("userId", g.userId);
        xml.end("item");
      }
      xml.end("groups");
      xml.end("item");
    }
    return xml.build();
  }

  // --- VPC ---

  private createVpc(params: URLSearchParams, ctx: RequestContext): Response {
    const cidrBlock = params.get("CidrBlock") ?? "10.0.0.0/16";
    const instanceTenancy = params.get("InstanceTenancy") ?? undefined;
    const vpc = this.service.createVpc(cidrBlock, instanceTenancy);
    const body = `<vpc>` +
      `<vpcId>${vpc.vpcId}</vpcId>` +
      `<state>${vpc.state}</state>` +
      `<cidrBlock>${vpc.cidrBlock}</cidrBlock>` +
      `<cidrBlockAssociationSet><item><cidrBlock>${vpc.cidrBlock}</cidrBlock><cidrBlockState><state>associated</state></cidrBlockState><associationId>${vpc.vpcId}-cidr-assoc</associationId></item></cidrBlockAssociationSet>` +
      `<dhcpOptionsId>${vpc.dhcpOptionsId}</dhcpOptionsId>` +
      `<instanceTenancy>${vpc.instanceTenancy}</instanceTenancy>` +
      `<isDefault>${vpc.isDefault}</isDefault>` +
      `<ownerId>${vpc.ownerId}</ownerId>` +
      `${this.tagsXml(vpc.tags)}` +
      `</vpc>`;
    return xmlResponse(ec2Envelope("CreateVpc", ctx.requestId, body), ctx.requestId);
  }

  private describeVpcs(params: URLSearchParams, ctx: RequestContext): Response {
    const vpcIds = this.parseListParam(params, "VpcId");
    const vpcs = this.service.describeVpcs(vpcIds.length > 0 ? vpcIds : undefined);
    const xml = new XmlBuilder().start("vpcSet");
    for (const vpc of vpcs) {
      xml.start("item")
        .elem("vpcId", vpc.vpcId)
        .elem("state", vpc.state)
        .elem("cidrBlock", vpc.cidrBlock)
        .raw(`<cidrBlockAssociationSet><item><cidrBlock>${vpc.cidrBlock}</cidrBlock><cidrBlockState><state>associated</state></cidrBlockState><associationId>${vpc.vpcId}-cidr-assoc</associationId></item></cidrBlockAssociationSet>`)
        .elem("dhcpOptionsId", vpc.dhcpOptionsId)
        .elem("instanceTenancy", vpc.instanceTenancy)
        .elem("isDefault", vpc.isDefault)
        .elem("ownerId", vpc.ownerId)
        .raw(this.tagsXml(vpc.tags))
        .end("item");
    }
    xml.end("vpcSet");
    return xmlResponse(ec2Envelope("DescribeVpcs", ctx.requestId, xml.build()), ctx.requestId);
  }

  private deleteVpc(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteVpc(params.get("VpcId")!);
    return xmlResponse(ec2ReturnTrue("DeleteVpc", ctx.requestId), ctx.requestId);
  }

  private modifyVpcAttribute(params: URLSearchParams, ctx: RequestContext): Response {
    const vpcId = params.get("VpcId")!;
    const dnsSupport = params.get("EnableDnsSupport.Value");
    const dnsHostnames = params.get("EnableDnsHostnames.Value");
    this.service.modifyVpcAttribute(
      vpcId,
      dnsSupport !== null ? dnsSupport === "true" : undefined,
      dnsHostnames !== null ? dnsHostnames === "true" : undefined,
    );
    return xmlResponse(ec2ReturnTrue("ModifyVpcAttribute", ctx.requestId), ctx.requestId);
  }

  // --- Tags ---

  private createTags(params: URLSearchParams, ctx: RequestContext): Response {
    const resourceIds = this.parseListParam(params, "ResourceId");
    const tags = this.parseTags(params);
    this.service.createTags(resourceIds, tags);
    return xmlResponse(ec2ReturnTrue("CreateTags", ctx.requestId), ctx.requestId);
  }

  private describeTags(params: URLSearchParams, ctx: RequestContext): Response {
    const filters = this.parseFilters(params);
    const tags = this.service.describeTags(filters.length > 0 ? filters : undefined);
    const xml = new XmlBuilder().start("tagSet");
    for (const t of tags) {
      xml.start("item")
        .elem("resourceId", t.resourceId)
        .elem("resourceType", t.resourceType)
        .elem("key", t.key)
        .elem("value", t.value)
        .end("item");
    }
    xml.end("tagSet");
    return xmlResponse(ec2Envelope("DescribeTags", ctx.requestId, xml.build()), ctx.requestId);
  }

  // --- Subnets ---

  private createSubnet(params: URLSearchParams, ctx: RequestContext): Response {
    const subnet = this.service.createSubnet(
      params.get("VpcId")!,
      params.get("CidrBlock")!,
      params.get("AvailabilityZone") ?? undefined,
    );
    const body = `<subnet>` +
      `<subnetId>${subnet.subnetId}</subnetId>` +
      `<vpcId>${subnet.vpcId}</vpcId>` +
      `<state>${subnet.state}</state>` +
      `<cidrBlock>${subnet.cidrBlock}</cidrBlock>` +
      `<availabilityZone>${subnet.availabilityZone}</availabilityZone>` +
      `<availableIpAddressCount>${subnet.availableIpAddressCount}</availableIpAddressCount>` +
      `<mapPublicIpOnLaunch>${subnet.mapPublicIpOnLaunch}</mapPublicIpOnLaunch>` +
      `<ownerId>${subnet.ownerId}</ownerId>` +
      `${this.tagsXml(subnet.tags)}` +
      `</subnet>`;
    return xmlResponse(ec2Envelope("CreateSubnet", ctx.requestId, body), ctx.requestId);
  }

  private describeSubnets(params: URLSearchParams, ctx: RequestContext): Response {
    const subnetIds = this.parseListParam(params, "SubnetId");
    const filters = this.parseFilters(params);
    const subnets = this.service.describeSubnets(
      subnetIds.length > 0 ? subnetIds : undefined,
      filters.length > 0 ? filters : undefined,
    );
    const xml = new XmlBuilder().start("subnetSet");
    for (const s of subnets) {
      xml.start("item")
        .elem("subnetId", s.subnetId)
        .elem("vpcId", s.vpcId)
        .elem("state", s.state)
        .elem("cidrBlock", s.cidrBlock)
        .elem("availabilityZone", s.availabilityZone)
        .elem("availableIpAddressCount", s.availableIpAddressCount)
        .elem("mapPublicIpOnLaunch", s.mapPublicIpOnLaunch)
        .elem("ownerId", s.ownerId)
        .raw(this.tagsXml(s.tags))
        .end("item");
    }
    xml.end("subnetSet");
    return xmlResponse(ec2Envelope("DescribeSubnets", ctx.requestId, xml.build()), ctx.requestId);
  }

  private deleteSubnet(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteSubnet(params.get("SubnetId")!);
    return xmlResponse(ec2ReturnTrue("DeleteSubnet", ctx.requestId), ctx.requestId);
  }

  private modifySubnetAttribute(params: URLSearchParams, ctx: RequestContext): Response {
    const subnetId = params.get("SubnetId")!;
    const mapPublic = params.get("MapPublicIpOnLaunch.Value");
    this.service.modifySubnetAttribute(
      subnetId,
      mapPublic !== null ? mapPublic === "true" : undefined,
    );
    return xmlResponse(ec2ReturnTrue("ModifySubnetAttribute", ctx.requestId), ctx.requestId);
  }

  // --- Security Groups ---

  private createSecurityGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const sg = this.service.createSecurityGroup(
      params.get("GroupName")!,
      params.get("GroupDescription")!,
      params.get("VpcId")!,
    );
    const body = `<groupId>${sg.groupId}</groupId>`;
    return xmlResponse(ec2Envelope("CreateSecurityGroup", ctx.requestId, body), ctx.requestId);
  }

  private describeSecurityGroups(params: URLSearchParams, ctx: RequestContext): Response {
    const groupIds = this.parseListParam(params, "GroupId");
    const filters = this.parseFilters(params);
    const sgs = this.service.describeSecurityGroups(
      groupIds.length > 0 ? groupIds : undefined,
      filters.length > 0 ? filters : undefined,
    );
    const xml = new XmlBuilder().start("securityGroupInfo");
    for (const sg of sgs) {
      xml.start("item")
        .elem("ownerId", sg.ownerId)
        .elem("groupId", sg.groupId)
        .elem("groupName", sg.groupName)
        .elem("groupDescription", sg.description)
        .elem("vpcId", sg.vpcId)
        .start("ipPermissions").raw(this.ipPermissionsXml(sg.ipPermissions)).end("ipPermissions")
        .start("ipPermissionsEgress").raw(this.ipPermissionsXml(sg.ipPermissionsEgress)).end("ipPermissionsEgress")
        .raw(this.tagsXml(sg.tags))
        .end("item");
    }
    xml.end("securityGroupInfo");
    return xmlResponse(ec2Envelope("DescribeSecurityGroups", ctx.requestId, xml.build()), ctx.requestId);
  }

  private deleteSecurityGroup(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteSecurityGroup(params.get("GroupId")!);
    return xmlResponse(ec2ReturnTrue("DeleteSecurityGroup", ctx.requestId), ctx.requestId);
  }

  private authorizeSecurityGroupIngress(params: URLSearchParams, ctx: RequestContext): Response {
    const groupId = params.get("GroupId")!;
    const perms = this.parseIpPermissions(params);
    this.service.authorizeSecurityGroupIngress(groupId, perms);
    return xmlResponse(ec2ReturnTrue("AuthorizeSecurityGroupIngress", ctx.requestId), ctx.requestId);
  }

  private authorizeSecurityGroupEgress(params: URLSearchParams, ctx: RequestContext): Response {
    const groupId = params.get("GroupId")!;
    const perms = this.parseIpPermissions(params);
    this.service.authorizeSecurityGroupEgress(groupId, perms);
    return xmlResponse(ec2ReturnTrue("AuthorizeSecurityGroupEgress", ctx.requestId), ctx.requestId);
  }

  private revokeSecurityGroupIngress(params: URLSearchParams, ctx: RequestContext): Response {
    const groupId = params.get("GroupId")!;
    const perms = this.parseIpPermissions(params);
    this.service.revokeSecurityGroupIngress(groupId, perms);
    return xmlResponse(ec2ReturnTrue("RevokeSecurityGroupIngress", ctx.requestId), ctx.requestId);
  }

  private revokeSecurityGroupEgress(params: URLSearchParams, ctx: RequestContext): Response {
    const groupId = params.get("GroupId")!;
    const perms = this.parseIpPermissions(params);
    this.service.revokeSecurityGroupEgress(groupId, perms);
    return xmlResponse(ec2ReturnTrue("RevokeSecurityGroupEgress", ctx.requestId), ctx.requestId);
  }

  // --- Internet Gateways ---

  private createInternetGateway(_params: URLSearchParams, ctx: RequestContext): Response {
    const igw = this.service.createInternetGateway();
    const body = `<internetGateway>` +
      `<internetGatewayId>${igw.internetGatewayId}</internetGatewayId>` +
      `<attachmentSet/>` +
      `<ownerId>${igw.ownerId}</ownerId>` +
      `${this.tagsXml(igw.tags)}` +
      `</internetGateway>`;
    return xmlResponse(ec2Envelope("CreateInternetGateway", ctx.requestId, body), ctx.requestId);
  }

  private describeInternetGateways(params: URLSearchParams, ctx: RequestContext): Response {
    const igwIds = this.parseListParam(params, "InternetGatewayId");
    const filters = this.parseFilters(params);
    const igws = this.service.describeInternetGateways(
      igwIds.length > 0 ? igwIds : undefined,
      filters.length > 0 ? filters : undefined,
    );
    const xml = new XmlBuilder().start("internetGatewaySet");
    for (const igw of igws) {
      xml.start("item")
        .elem("internetGatewayId", igw.internetGatewayId);
      xml.start("attachmentSet");
      for (const a of igw.attachments) {
        xml.start("item").elem("vpcId", a.vpcId).elem("state", a.state).end("item");
      }
      xml.end("attachmentSet");
      xml.elem("ownerId", igw.ownerId)
        .raw(this.tagsXml(igw.tags))
        .end("item");
    }
    xml.end("internetGatewaySet");
    return xmlResponse(ec2Envelope("DescribeInternetGateways", ctx.requestId, xml.build()), ctx.requestId);
  }

  private deleteInternetGateway(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteInternetGateway(params.get("InternetGatewayId")!);
    return xmlResponse(ec2ReturnTrue("DeleteInternetGateway", ctx.requestId), ctx.requestId);
  }

  private attachInternetGateway(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.attachInternetGateway(params.get("InternetGatewayId")!, params.get("VpcId")!);
    return xmlResponse(ec2ReturnTrue("AttachInternetGateway", ctx.requestId), ctx.requestId);
  }

  private detachInternetGateway(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.detachInternetGateway(params.get("InternetGatewayId")!, params.get("VpcId")!);
    return xmlResponse(ec2ReturnTrue("DetachInternetGateway", ctx.requestId), ctx.requestId);
  }

  // --- Route Tables ---

  private createRouteTable(params: URLSearchParams, ctx: RequestContext): Response {
    const rtb = this.service.createRouteTable(params.get("VpcId")!);
    const body = `<routeTable>` +
      `<routeTableId>${rtb.routeTableId}</routeTableId>` +
      `<vpcId>${rtb.vpcId}</vpcId>` +
      `${this.routesXml(rtb.routes)}` +
      `<associationSet/>` +
      `<ownerId>${rtb.ownerId}</ownerId>` +
      `${this.tagsXml(rtb.tags)}` +
      `</routeTable>`;
    return xmlResponse(ec2Envelope("CreateRouteTable", ctx.requestId, body), ctx.requestId);
  }

  private describeRouteTables(params: URLSearchParams, ctx: RequestContext): Response {
    const rtbIds = this.parseListParam(params, "RouteTableId");
    const filters = this.parseFilters(params);
    const rtbs = this.service.describeRouteTables(
      rtbIds.length > 0 ? rtbIds : undefined,
      filters.length > 0 ? filters : undefined,
    );
    const xml = new XmlBuilder().start("routeTableSet");
    for (const rtb of rtbs) {
      xml.start("item")
        .elem("routeTableId", rtb.routeTableId)
        .elem("vpcId", rtb.vpcId)
        .raw(this.routesXml(rtb.routes))
        .raw(this.associationsXml(rtb.associations))
        .elem("ownerId", rtb.ownerId)
        .raw(this.tagsXml(rtb.tags))
        .end("item");
    }
    xml.end("routeTableSet");
    return xmlResponse(ec2Envelope("DescribeRouteTables", ctx.requestId, xml.build()), ctx.requestId);
  }

  private deleteRouteTable(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteRouteTable(params.get("RouteTableId")!);
    return xmlResponse(ec2ReturnTrue("DeleteRouteTable", ctx.requestId), ctx.requestId);
  }

  private createRoute(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.createRoute(
      params.get("RouteTableId")!,
      params.get("DestinationCidrBlock")!,
      params.get("GatewayId") ?? undefined,
      params.get("NatGatewayId") ?? undefined,
    );
    return xmlResponse(ec2ReturnTrue("CreateRoute", ctx.requestId), ctx.requestId);
  }

  private deleteRoute(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteRoute(params.get("RouteTableId")!, params.get("DestinationCidrBlock")!);
    return xmlResponse(ec2ReturnTrue("DeleteRoute", ctx.requestId), ctx.requestId);
  }

  private associateRouteTable(params: URLSearchParams, ctx: RequestContext): Response {
    const assocId = this.service.associateRouteTable(params.get("RouteTableId")!, params.get("SubnetId")!);
    const body = `<associationId>${assocId}</associationId>`;
    return xmlResponse(ec2Envelope("AssociateRouteTable", ctx.requestId, body), ctx.requestId);
  }

  private disassociateRouteTable(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.disassociateRouteTable(params.get("AssociationId")!);
    return xmlResponse(ec2ReturnTrue("DisassociateRouteTable", ctx.requestId), ctx.requestId);
  }

  private routesXml(routes: { destinationCidrBlock: string; gatewayId?: string; natGatewayId?: string; state: string; origin: string }[]): string {
    const xml = new XmlBuilder().start("routeSet");
    for (const r of routes) {
      xml.start("item")
        .elem("destinationCidrBlock", r.destinationCidrBlock)
        .elem("state", r.state)
        .elem("origin", r.origin);
      if (r.gatewayId) xml.elem("gatewayId", r.gatewayId);
      if (r.natGatewayId) xml.elem("natGatewayId", r.natGatewayId);
      xml.end("item");
    }
    xml.end("routeSet");
    return xml.build();
  }

  private associationsXml(assocs: { routeTableAssociationId: string; routeTableId: string; subnetId?: string; main: boolean }[]): string {
    const xml = new XmlBuilder().start("associationSet");
    for (const a of assocs) {
      xml.start("item")
        .elem("routeTableAssociationId", a.routeTableAssociationId)
        .elem("routeTableId", a.routeTableId)
        .elem("main", a.main);
      if (a.subnetId) xml.elem("subnetId", a.subnetId);
      xml.end("item");
    }
    xml.end("associationSet");
    return xml.build();
  }

  // --- NAT Gateways ---

  private createNatGateway(params: URLSearchParams, ctx: RequestContext): Response {
    const nat = this.service.createNatGateway(
      params.get("SubnetId")!,
      params.get("AllocationId")!,
    );
    const body = `<natGateway>` +
      `<natGatewayId>${nat.natGatewayId}</natGatewayId>` +
      `<subnetId>${nat.subnetId}</subnetId>` +
      `<vpcId>${nat.vpcId}</vpcId>` +
      `<state>${nat.state}</state>` +
      `<createTime>${nat.createTime}</createTime>` +
      `<natGatewayAddressSet>` +
      nat.natGatewayAddresses.map((a) =>
        `<item><allocationId>${a.allocationId}</allocationId><publicIp>${a.publicIp}</publicIp><networkInterfaceId>${a.networkInterfaceId}</networkInterfaceId><privateIp>${a.privateIp}</privateIp></item>`
      ).join("") +
      `</natGatewayAddressSet>` +
      `${this.tagsXml(nat.tags)}` +
      `</natGateway>`;
    return xmlResponse(ec2Envelope("CreateNatGateway", ctx.requestId, body), ctx.requestId);
  }

  private describeNatGateways(params: URLSearchParams, ctx: RequestContext): Response {
    const natIds = this.parseListParam(params, "NatGatewayId");
    const filters = this.parseFilters(params);
    const nats = this.service.describeNatGateways(
      natIds.length > 0 ? natIds : undefined,
      filters.length > 0 ? filters : undefined,
    );
    const xml = new XmlBuilder().start("natGatewaySet");
    for (const nat of nats) {
      xml.start("item")
        .elem("natGatewayId", nat.natGatewayId)
        .elem("subnetId", nat.subnetId)
        .elem("vpcId", nat.vpcId)
        .elem("state", nat.state)
        .elem("createTime", nat.createTime);
      xml.start("natGatewayAddressSet");
      for (const a of nat.natGatewayAddresses) {
        xml.start("item")
          .elem("allocationId", a.allocationId)
          .elem("publicIp", a.publicIp)
          .elem("networkInterfaceId", a.networkInterfaceId)
          .elem("privateIp", a.privateIp)
          .end("item");
      }
      xml.end("natGatewayAddressSet");
      xml.raw(this.tagsXml(nat.tags))
        .end("item");
    }
    xml.end("natGatewaySet");
    return xmlResponse(ec2Envelope("DescribeNatGateways", ctx.requestId, xml.build()), ctx.requestId);
  }

  private deleteNatGateway(params: URLSearchParams, ctx: RequestContext): Response {
    const nat = this.service.deleteNatGateway(params.get("NatGatewayId")!);
    const body = `<natGatewayId>${nat.natGatewayId}</natGatewayId>`;
    return xmlResponse(ec2Envelope("DeleteNatGateway", ctx.requestId, body), ctx.requestId);
  }

  // --- Elastic IPs ---

  private allocateAddress(params: URLSearchParams, ctx: RequestContext): Response {
    const domain = params.get("Domain") ?? undefined;
    const eip = this.service.allocateAddress(domain);
    const body = `<publicIp>${eip.publicIp}</publicIp>` +
      `<allocationId>${eip.allocationId}</allocationId>` +
      `<domain>${eip.domain}</domain>`;
    return xmlResponse(ec2Envelope("AllocateAddress", ctx.requestId, body), ctx.requestId);
  }

  private describeAddresses(params: URLSearchParams, ctx: RequestContext): Response {
    const allocIds = this.parseListParam(params, "AllocationId");
    const addresses = this.service.describeAddresses(allocIds.length > 0 ? allocIds : undefined);
    const xml = new XmlBuilder().start("addressesSet");
    for (const a of addresses) {
      xml.start("item")
        .elem("publicIp", a.publicIp)
        .elem("allocationId", a.allocationId)
        .elem("domain", a.domain)
        .raw(this.tagsXml(a.tags))
        .end("item");
    }
    xml.end("addressesSet");
    return xmlResponse(ec2Envelope("DescribeAddresses", ctx.requestId, xml.build()), ctx.requestId);
  }

  private releaseAddress(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.releaseAddress(params.get("AllocationId")!);
    return xmlResponse(ec2ReturnTrue("ReleaseAddress", ctx.requestId), ctx.requestId);
  }

  // --- Network ACLs ---

  private describeNetworkAcls(params: URLSearchParams, ctx: RequestContext): Response {
    const filters = this.parseFilters(params);
    const acls = this.service.describeNetworkAcls(filters.length > 0 ? filters : undefined);
    const xml = new XmlBuilder().start("networkAclSet");
    for (const acl of acls) {
      xml.start("item")
        .elem("networkAclId", acl.networkAclId)
        .elem("vpcId", acl.vpcId)
        .elem("default", acl.isDefault);
      xml.start("entrySet");
      for (const e of acl.entries) {
        xml.start("item")
          .elem("ruleNumber", e.ruleNumber)
          .elem("protocol", e.protocol)
          .elem("ruleAction", e.ruleAction)
          .elem("egress", e.egress)
          .elem("cidrBlock", e.cidrBlock)
          .end("item");
      }
      xml.end("entrySet");
      xml.start("associationSet").end("associationSet");
      xml.raw(this.tagsXml(acl.tags))
        .end("item");
    }
    xml.end("networkAclSet");
    return xmlResponse(ec2Envelope("DescribeNetworkAcls", ctx.requestId, xml.build()), ctx.requestId);
  }

  // --- Availability Zones ---

  private describeAvailabilityZones(_params: URLSearchParams, ctx: RequestContext): Response {
    const zones = this.service.describeAvailabilityZones(ctx.region);
    const xml = new XmlBuilder().start("availabilityZoneInfo");
    for (const z of zones) {
      xml.start("item")
        .elem("zoneName", z.zoneName)
        .elem("zoneState", z.state)
        .elem("regionName", z.regionName)
        .elem("zoneId", z.zoneId)
        .start("messageSet").end("messageSet")
        .end("item");
    }
    xml.end("availabilityZoneInfo");
    return xmlResponse(ec2Envelope("DescribeAvailabilityZones", ctx.requestId, xml.build()), ctx.requestId);
  }

  // --- Regions ---

  private describeRegions(_params: URLSearchParams, ctx: RequestContext): Response {
    const regions = this.service.describeRegions();
    const xml = new XmlBuilder().start("regionInfo");
    for (const r of regions) {
      xml.start("item")
        .elem("regionName", r.regionName)
        .elem("regionEndpoint", r.endpoint)
        .elem("optInStatus", r.optInStatus)
        .end("item");
    }
    xml.end("regionInfo");
    return xmlResponse(ec2Envelope("DescribeRegions", ctx.requestId, xml.build()), ctx.requestId);
  }

  // --- Account Attributes ---

  private describeAccountAttributes(_params: URLSearchParams, ctx: RequestContext): Response {
    const attrs = this.service.describeAccountAttributes();
    const xml = new XmlBuilder().start("accountAttributeSet");
    for (const a of attrs) {
      xml.start("item")
        .elem("attributeName", a.name)
        .start("attributeValueSet");
      for (const v of a.values) {
        xml.start("item").elem("attributeValue", v).end("item");
      }
      xml.end("attributeValueSet")
        .end("item");
    }
    xml.end("accountAttributeSet");
    return xmlResponse(ec2Envelope("DescribeAccountAttributes", ctx.requestId, xml.build()), ctx.requestId);
  }

  // --- Instances ---

  private parseTagSpecifications(params: URLSearchParams): { resourceType: string; tags: Ec2Tag[] }[] {
    const specs: { resourceType: string; tags: Ec2Tag[] }[] = [];
    let i = 1;
    while (params.has(`TagSpecification.${i}.ResourceType`)) {
      const resourceType = params.get(`TagSpecification.${i}.ResourceType`)!;
      const tags: Ec2Tag[] = [];
      let j = 1;
      while (params.has(`TagSpecification.${i}.Tag.${j}.Key`)) {
        tags.push({
          key: params.get(`TagSpecification.${i}.Tag.${j}.Key`)!,
          value: params.get(`TagSpecification.${i}.Tag.${j}.Value`) ?? "",
        });
        j++;
      }
      specs.push({ resourceType, tags });
      i++;
    }
    return specs;
  }

  private instanceXml(inst: Ec2Instance): string {
    const xml = new XmlBuilder();
    xml.start("item")
      .elem("instanceId", inst.instanceId)
      .elem("imageId", inst.imageId)
      .start("instanceState")
        .elem("code", inst.state.code)
        .elem("name", inst.state.name)
      .end("instanceState")
      .elem("privateIpAddress", inst.privateIpAddress)
      .elem("privateDnsName", `ip-${inst.privateIpAddress.replace(/\./g, "-")}.ec2.internal`)
      .elem("dnsName", "")
      .elem("instanceType", inst.instanceType)
      .elem("launchTime", inst.launchTime);
    if (inst.keyName) xml.elem("keyName", inst.keyName);
    if (inst.subnetId) xml.elem("subnetId", inst.subnetId);
    if (inst.vpcId) xml.elem("vpcId", inst.vpcId);
    if (inst.publicIpAddress) xml.elem("publicIpAddress", inst.publicIpAddress);
    xml.start("groupSet");
    for (const sg of inst.securityGroups) {
      xml.start("item").elem("groupId", sg.groupId).elem("groupName", sg.groupName).end("item");
    }
    xml.end("groupSet");
    xml.raw(this.tagsXml(inst.tags));
    xml.end("item");
    return xml.build();
  }

  private stateChangeXml(change: { instanceId: string; previousState: InstanceState; currentState: InstanceState }): string {
    return `<item>` +
      `<instanceId>${change.instanceId}</instanceId>` +
      `<previousState><code>${change.previousState.code}</code><name>${change.previousState.name}</name></previousState>` +
      `<currentState><code>${change.currentState.code}</code><name>${change.currentState.name}</name></currentState>` +
      `</item>`;
  }

  private runInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const imageId = params.get("ImageId") ?? "ami-00000000";
    const instanceType = params.get("InstanceType") ?? undefined;
    const keyName = params.get("KeyName") ?? undefined;
    const subnetId = params.get("SubnetId") ?? undefined;
    const minCount = params.has("MinCount") ? parseInt(params.get("MinCount")!) : undefined;
    const maxCount = params.has("MaxCount") ? parseInt(params.get("MaxCount")!) : undefined;
    const securityGroupIds = this.parseListParam(params, "SecurityGroupId");
    const tagSpecs = this.parseTagSpecifications(params);

    const result = this.service.runInstances({
      imageId,
      instanceType,
      keyName,
      securityGroupIds: securityGroupIds.length > 0 ? securityGroupIds : undefined,
      subnetId,
      minCount,
      maxCount,
      tagSpecifications: tagSpecs.length > 0 ? tagSpecs : undefined,
    });

    const body = `<reservationId>${result.reservationId}</reservationId>` +
      `<ownerId>${ctx.accountId}</ownerId>` +
      `<instancesSet>${result.instances.map((i) => this.instanceXml(i)).join("")}</instancesSet>`;
    return xmlResponse(ec2Envelope("RunInstances", ctx.requestId, body), ctx.requestId);
  }

  private describeInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const instanceIds = this.parseListParam(params, "InstanceId");
    const reservations = this.service.describeInstances(instanceIds.length > 0 ? instanceIds : undefined);
    const xml = new XmlBuilder().start("reservationSet");
    for (const res of reservations) {
      xml.start("item")
        .elem("reservationId", res.reservationId)
        .elem("ownerId", ctx.accountId);
      xml.start("instancesSet");
      for (const inst of res.instances) {
        xml.raw(this.instanceXml(inst));
      }
      xml.end("instancesSet");
      xml.end("item");
    }
    xml.end("reservationSet");
    return xmlResponse(ec2Envelope("DescribeInstances", ctx.requestId, xml.build()), ctx.requestId);
  }

  private terminateInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const instanceIds = this.parseListParam(params, "InstanceId");
    const results = this.service.terminateInstances(instanceIds);
    const body = `<instancesSet>${results.map((r) => this.stateChangeXml(r)).join("")}</instancesSet>`;
    return xmlResponse(ec2Envelope("TerminateInstances", ctx.requestId, body), ctx.requestId);
  }

  private startInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const instanceIds = this.parseListParam(params, "InstanceId");
    const results = this.service.startInstances(instanceIds);
    const body = `<instancesSet>${results.map((r) => this.stateChangeXml(r)).join("")}</instancesSet>`;
    return xmlResponse(ec2Envelope("StartInstances", ctx.requestId, body), ctx.requestId);
  }

  private stopInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const instanceIds = this.parseListParam(params, "InstanceId");
    const results = this.service.stopInstances(instanceIds);
    const body = `<instancesSet>${results.map((r) => this.stateChangeXml(r)).join("")}</instancesSet>`;
    return xmlResponse(ec2Envelope("StopInstances", ctx.requestId, body), ctx.requestId);
  }

  private rebootInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const instanceIds = this.parseListParam(params, "InstanceId");
    this.service.rebootInstances(instanceIds);
    return xmlResponse(ec2ReturnTrue("RebootInstances", ctx.requestId), ctx.requestId);
  }

  private describeInstanceStatus(params: URLSearchParams, ctx: RequestContext): Response {
    const instanceIds = this.parseListParam(params, "InstanceId");
    const instances = this.service.describeInstanceStatus(instanceIds.length > 0 ? instanceIds : undefined);
    const xml = new XmlBuilder().start("instanceStatusSet");
    for (const inst of instances) {
      xml.start("item")
        .elem("instanceId", inst.instanceId)
        .elem("availabilityZone", `${ctx.region}a`)
        .start("instanceState")
          .elem("code", inst.state.code)
          .elem("name", inst.state.name)
        .end("instanceState")
        .start("systemStatus")
          .elem("status", "ok")
          .start("details")
            .start("item").elem("name", "reachability").elem("status", "passed").end("item")
          .end("details")
        .end("systemStatus")
        .start("instanceStatus")
          .elem("status", "ok")
          .start("details")
            .start("item").elem("name", "reachability").elem("status", "passed").end("item")
          .end("details")
        .end("instanceStatus")
        .end("item");
    }
    xml.end("instanceStatusSet");
    return xmlResponse(ec2Envelope("DescribeInstanceStatus", ctx.requestId, xml.build()), ctx.requestId);
  }

  private modifyInstanceAttribute(params: URLSearchParams, ctx: RequestContext): Response {
    const instanceId = params.get("InstanceId")!;
    const instanceType = params.get("InstanceType.Value") ?? undefined;
    const securityGroupIds = this.parseListParam(params, "GroupId");
    this.service.modifyInstanceAttribute(instanceId, {
      instanceType,
      securityGroupIds: securityGroupIds.length > 0 ? securityGroupIds : undefined,
    });
    return xmlResponse(ec2ReturnTrue("ModifyInstanceAttribute", ctx.requestId), ctx.requestId);
  }

  // --- Key Pairs ---

  private createKeyPair(params: URLSearchParams, ctx: RequestContext): Response {
    const keyName = params.get("KeyName")!;
    const keyType = params.get("KeyType") ?? undefined;
    const kp = this.service.createKeyPair(keyName, keyType);
    const body = `<keyName>${kp.keyName}</keyName>` +
      `<keyPairId>${kp.keyPairId}</keyPairId>` +
      `<keyFingerprint>${kp.keyFingerprint}</keyFingerprint>` +
      `<keyMaterial>${kp.keyMaterial}</keyMaterial>`;
    return xmlResponse(ec2Envelope("CreateKeyPair", ctx.requestId, body), ctx.requestId);
  }

  private describeKeyPairs(params: URLSearchParams, ctx: RequestContext): Response {
    const keyNames = this.parseListParam(params, "KeyName");
    const keyPairIds = this.parseListParam(params, "KeyPairId");
    const keyPairs = this.service.describeKeyPairs(
      keyNames.length > 0 ? keyNames : undefined,
      keyPairIds.length > 0 ? keyPairIds : undefined,
    );
    const xml = new XmlBuilder().start("keySet");
    for (const kp of keyPairs) {
      xml.start("item")
        .elem("keyName", kp.keyName)
        .elem("keyPairId", kp.keyPairId)
        .elem("keyFingerprint", kp.keyFingerprint)
        .elem("keyType", kp.keyType)
        .raw(this.tagsXml(kp.tags))
        .end("item");
    }
    xml.end("keySet");
    return xmlResponse(ec2Envelope("DescribeKeyPairs", ctx.requestId, xml.build()), ctx.requestId);
  }

  private deleteKeyPair(params: URLSearchParams, ctx: RequestContext): Response {
    const keyName = params.get("KeyName") ?? undefined;
    const keyPairId = params.get("KeyPairId") ?? undefined;
    this.service.deleteKeyPair(keyName, keyPairId);
    return xmlResponse(ec2ReturnTrue("DeleteKeyPair", ctx.requestId), ctx.requestId);
  }

  private importKeyPair(params: URLSearchParams, ctx: RequestContext): Response {
    const keyName = params.get("KeyName")!;
    const publicKeyMaterial = params.get("PublicKeyMaterial") ?? "";
    const kp = this.service.importKeyPair(keyName, publicKeyMaterial);
    const body = `<keyName>${kp.keyName}</keyName>` +
      `<keyPairId>${kp.keyPairId}</keyPairId>` +
      `<keyFingerprint>${kp.keyFingerprint}</keyFingerprint>`;
    return xmlResponse(ec2Envelope("ImportKeyPair", ctx.requestId, body), ctx.requestId);
  }

  // --- EBS Volumes ---

  private volumeXml(vol: Volume): string {
    const xml = new XmlBuilder();
    xml.elem("volumeId", vol.volumeId)
      .elem("size", vol.size)
      .elem("availabilityZone", vol.availabilityZone)
      .elem("status", vol.state)
      .elem("createTime", vol.createTime)
      .elem("volumeType", vol.volumeType)
      .elem("encrypted", vol.encrypted);
    if (vol.iops !== undefined) xml.elem("iops", vol.iops);
    if (vol.throughput !== undefined) xml.elem("throughput", vol.throughput);
    if (vol.snapshotId) xml.elem("snapshotId", vol.snapshotId);
    xml.start("attachmentSet");
    for (const a of vol.attachments) {
      xml.start("item")
        .elem("volumeId", vol.volumeId)
        .elem("instanceId", a.instanceId)
        .elem("device", a.device)
        .elem("status", a.state)
        .elem("attachTime", a.attachTime)
        .end("item");
    }
    xml.end("attachmentSet");
    xml.raw(this.tagsXml(vol.tags));
    return xml.build();
  }

  private createVolume(params: URLSearchParams, ctx: RequestContext): Response {
    const tagSpecs = this.parseTagSpecifications(params);
    const vol = this.service.createVolume({
      size: parseInt(params.get("Size") ?? "8"),
      availabilityZone: params.get("AvailabilityZone") ?? `${ctx.region}a`,
      volumeType: (params.get("VolumeType") as any) ?? undefined,
      encrypted: params.get("Encrypted") === "true" ? true : undefined,
      iops: params.has("Iops") ? parseInt(params.get("Iops")!) : undefined,
      throughput: params.has("Throughput") ? parseInt(params.get("Throughput")!) : undefined,
      snapshotId: params.get("SnapshotId") ?? undefined,
      tagSpecifications: tagSpecs.length > 0 ? tagSpecs : undefined,
    });
    return xmlResponse(ec2Envelope("CreateVolume", ctx.requestId, this.volumeXml(vol)), ctx.requestId);
  }

  private describeVolumes(params: URLSearchParams, ctx: RequestContext): Response {
    const volumeIds = this.parseListParam(params, "VolumeId");
    const volumes = this.service.describeVolumes(volumeIds.length > 0 ? volumeIds : undefined);
    const xml = new XmlBuilder().start("volumeSet");
    for (const vol of volumes) {
      xml.start("item").raw(this.volumeXml(vol)).end("item");
    }
    xml.end("volumeSet");
    return xmlResponse(ec2Envelope("DescribeVolumes", ctx.requestId, xml.build()), ctx.requestId);
  }

  private deleteVolume(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteVolume(params.get("VolumeId")!);
    return xmlResponse(ec2ReturnTrue("DeleteVolume", ctx.requestId), ctx.requestId);
  }

  private attachVolume(params: URLSearchParams, ctx: RequestContext): Response {
    const volumeId = params.get("VolumeId")!;
    const instanceId = params.get("InstanceId")!;
    const device = params.get("Device") ?? "/dev/sdf";
    const attachment = this.service.attachVolume(volumeId, instanceId, device);
    const body = `<volumeId>${volumeId}</volumeId>` +
      `<instanceId>${attachment.instanceId}</instanceId>` +
      `<device>${attachment.device}</device>` +
      `<status>${attachment.state}</status>` +
      `<attachTime>${attachment.attachTime}</attachTime>`;
    return xmlResponse(ec2Envelope("AttachVolume", ctx.requestId, body), ctx.requestId);
  }

  private detachVolume(params: URLSearchParams, ctx: RequestContext): Response {
    const volumeId = params.get("VolumeId")!;
    const attachment = this.service.detachVolume(volumeId);
    const body = `<volumeId>${volumeId}</volumeId>` +
      `<instanceId>${attachment.instanceId}</instanceId>` +
      `<device>${attachment.device}</device>` +
      `<status>${attachment.state}</status>` +
      `<attachTime>${attachment.attachTime}</attachTime>`;
    return xmlResponse(ec2Envelope("DetachVolume", ctx.requestId, body), ctx.requestId);
  }

  private modifyVolume(params: URLSearchParams, ctx: RequestContext): Response {
    const volumeId = params.get("VolumeId")!;
    const size = params.has("Size") ? parseInt(params.get("Size")!) : undefined;
    const volumeType = (params.get("VolumeType") as any) ?? undefined;
    const iops = params.has("Iops") ? parseInt(params.get("Iops")!) : undefined;
    const vol = this.service.modifyVolume(volumeId, size, volumeType, iops);
    const body = `<volumeModification>` +
      `<volumeId>${vol.volumeId}</volumeId>` +
      `<modificationState>completed</modificationState>` +
      `<targetSize>${vol.size}</targetSize>` +
      `<targetVolumeType>${vol.volumeType}</targetVolumeType>` +
      (vol.iops !== undefined ? `<targetIops>${vol.iops}</targetIops>` : "") +
      `</volumeModification>`;
    return xmlResponse(ec2Envelope("ModifyVolume", ctx.requestId, body), ctx.requestId);
  }

  // --- AMIs ---

  private createImage(params: URLSearchParams, ctx: RequestContext): Response {
    const tagSpecs = this.parseTagSpecifications(params);
    const img = this.service.createImage({
      name: params.get("Name")!,
      description: params.get("Description") ?? undefined,
      instanceId: params.get("InstanceId") ?? undefined,
      tagSpecifications: tagSpecs.length > 0 ? tagSpecs : undefined,
    });
    const body = `<imageId>${img.imageId}</imageId>`;
    return xmlResponse(ec2Envelope("CreateImage", ctx.requestId, body), ctx.requestId);
  }

  private imageXml(img: Image): string {
    const xml = new XmlBuilder();
    xml.start("item")
      .elem("imageId", img.imageId)
      .elem("name", img.name);
    if (img.description) xml.elem("description", img.description);
    xml.elem("imageState", img.state)
      .elem("imageOwnerId", img.ownerId)
      .elem("architecture", img.architecture)
      .elem("imageType", img.imageType)
      .elem("rootDeviceType", img.rootDeviceType)
      .elem("virtualizationType", img.virtualizationType)
      .elem("creationDate", img.creationDate)
      .elem("isPublic", false)
      .raw(this.tagsXml(img.tags))
      .end("item");
    return xml.build();
  }

  private describeImages(params: URLSearchParams, ctx: RequestContext): Response {
    const imageIds = this.parseListParam(params, "ImageId");
    const owners = this.parseListParam(params, "Owner");
    const images = this.service.describeImages(
      imageIds.length > 0 ? imageIds : undefined,
      owners.length > 0 ? owners : undefined,
    );
    const xml = new XmlBuilder().start("imagesSet");
    for (const img of images) {
      xml.raw(this.imageXml(img));
    }
    xml.end("imagesSet");
    return xmlResponse(ec2Envelope("DescribeImages", ctx.requestId, xml.build()), ctx.requestId);
  }

  private deregisterImage(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deregisterImage(params.get("ImageId")!);
    return xmlResponse(ec2ReturnTrue("DeregisterImage", ctx.requestId), ctx.requestId);
  }

  private copyImage(params: URLSearchParams, ctx: RequestContext): Response {
    const img = this.service.copyImage(
      params.get("SourceImageId")!,
      params.get("Name")!,
      params.get("Description") ?? undefined,
    );
    const body = `<imageId>${img.imageId}</imageId>`;
    return xmlResponse(ec2Envelope("CopyImage", ctx.requestId, body), ctx.requestId);
  }

  // --- Network Interfaces ---

  private networkInterfaceXml(eni: NetworkInterface): string {
    const xml = new XmlBuilder();
    xml.elem("networkInterfaceId", eni.networkInterfaceId)
      .elem("subnetId", eni.subnetId)
      .elem("vpcId", eni.vpcId)
      .elem("description", eni.description)
      .elem("status", eni.status)
      .elem("privateIpAddress", eni.privateIpAddress)
      .elem("ownerId", eni.ownerId);
    xml.start("groupSet");
    for (const sgId of eni.securityGroupIds) {
      xml.start("item").elem("groupId", sgId).end("item");
    }
    xml.end("groupSet");
    if (eni.attachmentId) {
      xml.start("attachment")
        .elem("attachmentId", eni.attachmentId)
        .elem("instanceId", eni.instanceId ?? "")
        .elem("status", "attached")
        .end("attachment");
    }
    xml.raw(this.tagsXml(eni.tags));
    return xml.build();
  }

  private createNetworkInterface(params: URLSearchParams, ctx: RequestContext): Response {
    const securityGroupIds = this.parseListParam(params, "SecurityGroupId");
    const eni = this.service.createNetworkInterface({
      subnetId: params.get("SubnetId")!,
      description: params.get("Description") ?? undefined,
      securityGroupIds: securityGroupIds.length > 0 ? securityGroupIds : undefined,
      privateIpAddress: params.get("PrivateIpAddress") ?? undefined,
    });
    const body = `<networkInterface>${this.networkInterfaceXml(eni)}</networkInterface>`;
    return xmlResponse(ec2Envelope("CreateNetworkInterface", ctx.requestId, body), ctx.requestId);
  }

  private describeNetworkInterfaces(params: URLSearchParams, ctx: RequestContext): Response {
    const eniIds = this.parseListParam(params, "NetworkInterfaceId");
    const enis = this.service.describeNetworkInterfaces(eniIds.length > 0 ? eniIds : undefined);
    const xml = new XmlBuilder().start("networkInterfaceSet");
    for (const eni of enis) {
      xml.start("item").raw(this.networkInterfaceXml(eni)).end("item");
    }
    xml.end("networkInterfaceSet");
    return xmlResponse(ec2Envelope("DescribeNetworkInterfaces", ctx.requestId, xml.build()), ctx.requestId);
  }

  private deleteNetworkInterface(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteNetworkInterface(params.get("NetworkInterfaceId")!);
    return xmlResponse(ec2ReturnTrue("DeleteNetworkInterface", ctx.requestId), ctx.requestId);
  }

  private attachNetworkInterface(params: URLSearchParams, ctx: RequestContext): Response {
    const attachmentId = this.service.attachNetworkInterface(
      params.get("NetworkInterfaceId")!,
      params.get("InstanceId")!,
    );
    const body = `<attachmentId>${attachmentId}</attachmentId>`;
    return xmlResponse(ec2Envelope("AttachNetworkInterface", ctx.requestId, body), ctx.requestId);
  }

  private detachNetworkInterface(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.detachNetworkInterface(params.get("AttachmentId")!);
    return xmlResponse(ec2ReturnTrue("DetachNetworkInterface", ctx.requestId), ctx.requestId);
  }

  // --- VPC Endpoints ---

  private createVpcEndpoint(params: URLSearchParams, ctx: RequestContext): Response {
    const routeTableIds = this.parseListParam(params, "RouteTableId");
    const subnetIds = this.parseListParam(params, "SubnetId");
    const vpce = this.service.createVpcEndpoint({
      vpcId: params.get("VpcId")!,
      serviceName: params.get("ServiceName")!,
      vpcEndpointType: params.get("VpcEndpointType") ?? undefined,
      routeTableIds: routeTableIds.length > 0 ? routeTableIds : undefined,
      subnetIds: subnetIds.length > 0 ? subnetIds : undefined,
    });
    const body = `<vpcEndpoint>${this.vpcEndpointXml(vpce)}</vpcEndpoint>`;
    return xmlResponse(ec2Envelope("CreateVpcEndpoint", ctx.requestId, body), ctx.requestId);
  }

  private vpcEndpointXml(vpce: VpcEndpoint): string {
    const xml = new XmlBuilder();
    xml.elem("vpcEndpointId", vpce.vpcEndpointId)
      .elem("vpcEndpointType", vpce.vpcEndpointType)
      .elem("serviceName", vpce.serviceName)
      .elem("vpcId", vpce.vpcId)
      .elem("state", vpce.state)
      .elem("creationTimestamp", vpce.creationTimestamp);
    xml.start("routeTableIdSet");
    for (const id of vpce.routeTableIds) {
      xml.raw(`<item>${id}</item>`);
    }
    xml.end("routeTableIdSet");
    xml.start("subnetIdSet");
    for (const id of vpce.subnetIds) {
      xml.raw(`<item>${id}</item>`);
    }
    xml.end("subnetIdSet");
    xml.raw(this.tagsXml(vpce.tags));
    return xml.build();
  }

  private describeVpcEndpoints(params: URLSearchParams, ctx: RequestContext): Response {
    const vpceIds = this.parseListParam(params, "VpcEndpointId");
    const endpoints = this.service.describeVpcEndpoints(vpceIds.length > 0 ? vpceIds : undefined);
    const xml = new XmlBuilder().start("vpcEndpointSet");
    for (const vpce of endpoints) {
      xml.start("item").raw(this.vpcEndpointXml(vpce)).end("item");
    }
    xml.end("vpcEndpointSet");
    return xmlResponse(ec2Envelope("DescribeVpcEndpoints", ctx.requestId, xml.build()), ctx.requestId);
  }

  private deleteVpcEndpoints(params: URLSearchParams, ctx: RequestContext): Response {
    const vpceIds = this.parseListParam(params, "VpcEndpointId");
    this.service.deleteVpcEndpoints(vpceIds);
    const xml = new XmlBuilder().start("unsuccessful").end("unsuccessful");
    return xmlResponse(ec2Envelope("DeleteVpcEndpoints", ctx.requestId, xml.build()), ctx.requestId);
  }

  private modifyVpcEndpoint(params: URLSearchParams, ctx: RequestContext): Response {
    const vpceId = params.get("VpcEndpointId")!;
    const addRouteTableIds = this.parseListParam(params, "AddRouteTableId");
    const removeRouteTableIds = this.parseListParam(params, "RemoveRouteTableId");
    const addSubnetIds = this.parseListParam(params, "AddSubnetId");
    const removeSubnetIds = this.parseListParam(params, "RemoveSubnetId");
    this.service.modifyVpcEndpoint(
      vpceId,
      addRouteTableIds.length > 0 ? addRouteTableIds : undefined,
      removeRouteTableIds.length > 0 ? removeRouteTableIds : undefined,
      addSubnetIds.length > 0 ? addSubnetIds : undefined,
      removeSubnetIds.length > 0 ? removeSubnetIds : undefined,
    );
    return xmlResponse(ec2ReturnTrue("ModifyVpcEndpoint", ctx.requestId), ctx.requestId);
  }

  // --- Instance Types ---

  private describeInstanceTypes(params: URLSearchParams, ctx: RequestContext): Response {
    const instanceTypes = this.parseListParam(params, "InstanceType");
    const types = this.service.describeInstanceTypes(instanceTypes.length > 0 ? instanceTypes : undefined);
    const xml = new XmlBuilder().start("instanceTypeSet");
    for (const t of types) {
      xml.start("item")
        .elem("instanceType", t.instanceType)
        .elem("currentGeneration", t.currentGeneration)
        .start("vCpuInfo").elem("defaultVCpus", t.vCpus).end("vCpuInfo")
        .start("memoryInfo").elem("sizeInMiB", t.memoryMiB).end("memoryInfo")
        .start("processorInfo")
          .elem("sustainedClockSpeedInGhz", t.processorInfo.sustainedClockSpeedInGhz)
          .start("supportedArchitectures");
      for (const arch of t.supportedArchitectures) {
        xml.raw(`<item>${arch}</item>`);
      }
      xml.end("supportedArchitectures")
        .end("processorInfo")
        .start("networkInfo").elem("networkPerformance", t.networkPerformance).end("networkInfo")
        .start("supportedUsageClasses");
      for (const uc of t.supportedUsageClasses) {
        xml.raw(`<item>${uc}</item>`);
      }
      xml.end("supportedUsageClasses")
        .end("item");
    }
    xml.end("instanceTypeSet");
    return xmlResponse(ec2Envelope("DescribeInstanceTypes", ctx.requestId, xml.build()), ctx.requestId);
  }
}
