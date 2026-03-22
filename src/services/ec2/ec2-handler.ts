import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlResponse } from "../../core/xml";
import type { Ec2Service, IpPermission, Ec2Tag } from "./ec2-service";

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
}
