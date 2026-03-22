import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

function genId(prefix: string): string {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 17);
}

function genIp(): string {
  const a = Math.floor(Math.random() * 200) + 10;
  const b = Math.floor(Math.random() * 256);
  const c = Math.floor(Math.random() * 256);
  const d = Math.floor(Math.random() * 256);
  return `${a}.${b}.${c}.${d}`;
}

export interface Ec2Tag {
  key: string;
  value: string;
}

export interface Vpc {
  vpcId: string;
  cidrBlock: string;
  state: string;
  isDefault: boolean;
  dhcpOptionsId: string;
  instanceTenancy: string;
  enableDnsSupport: boolean;
  enableDnsHostnames: boolean;
  ownerId: string;
  tags: Ec2Tag[];
}

export interface Subnet {
  subnetId: string;
  vpcId: string;
  cidrBlock: string;
  availabilityZone: string;
  availableIpAddressCount: number;
  state: string;
  mapPublicIpOnLaunch: boolean;
  ownerId: string;
  tags: Ec2Tag[];
}

export interface IpPermission {
  ipProtocol: string;
  fromPort?: number;
  toPort?: number;
  ipRanges: { cidrIp: string; description?: string }[];
  ipv6Ranges: { cidrIpv6: string; description?: string }[];
  prefixListIds: string[];
  userIdGroupPairs: { groupId: string; userId?: string }[];
}

export interface SecurityGroup {
  groupId: string;
  groupName: string;
  description: string;
  vpcId: string;
  ownerId: string;
  ipPermissions: IpPermission[];
  ipPermissionsEgress: IpPermission[];
  tags: Ec2Tag[];
}

export interface InternetGateway {
  internetGatewayId: string;
  attachments: { vpcId: string; state: string }[];
  ownerId: string;
  tags: Ec2Tag[];
}

export interface Route {
  destinationCidrBlock: string;
  gatewayId?: string;
  natGatewayId?: string;
  state: string;
  origin: string;
}

export interface RouteTableAssociation {
  routeTableAssociationId: string;
  routeTableId: string;
  subnetId?: string;
  main: boolean;
}

export interface RouteTable {
  routeTableId: string;
  vpcId: string;
  routes: Route[];
  associations: RouteTableAssociation[];
  ownerId: string;
  tags: Ec2Tag[];
}

export interface NatGateway {
  natGatewayId: string;
  subnetId: string;
  allocationId: string;
  state: string;
  vpcId: string;
  natGatewayAddresses: { allocationId: string; publicIp: string; networkInterfaceId: string; privateIp: string }[];
  ownerId: string;
  createTime: string;
  tags: Ec2Tag[];
}

export interface ElasticAddress {
  allocationId: string;
  publicIp: string;
  domain: string;
  ownerId: string;
  tags: Ec2Tag[];
}

const AWS_REGIONS = [
  { regionName: "us-east-1", endpoint: "ec2.us-east-1.amazonaws.com", optInStatus: "opt-in-not-required" },
  { regionName: "us-east-2", endpoint: "ec2.us-east-2.amazonaws.com", optInStatus: "opt-in-not-required" },
  { regionName: "us-west-1", endpoint: "ec2.us-west-1.amazonaws.com", optInStatus: "opt-in-not-required" },
  { regionName: "us-west-2", endpoint: "ec2.us-west-2.amazonaws.com", optInStatus: "opt-in-not-required" },
  { regionName: "eu-west-1", endpoint: "ec2.eu-west-1.amazonaws.com", optInStatus: "opt-in-not-required" },
  { regionName: "eu-west-2", endpoint: "ec2.eu-west-2.amazonaws.com", optInStatus: "opt-in-not-required" },
  { regionName: "eu-central-1", endpoint: "ec2.eu-central-1.amazonaws.com", optInStatus: "opt-in-not-required" },
  { regionName: "ap-southeast-1", endpoint: "ec2.ap-southeast-1.amazonaws.com", optInStatus: "opt-in-not-required" },
  { regionName: "ap-southeast-2", endpoint: "ec2.ap-southeast-2.amazonaws.com", optInStatus: "opt-in-not-required" },
  { regionName: "ap-northeast-1", endpoint: "ec2.ap-northeast-1.amazonaws.com", optInStatus: "opt-in-not-required" },
  { regionName: "sa-east-1", endpoint: "ec2.sa-east-1.amazonaws.com", optInStatus: "opt-in-not-required" },
  { regionName: "ca-central-1", endpoint: "ec2.ca-central-1.amazonaws.com", optInStatus: "opt-in-not-required" },
];

export class Ec2Service {
  private vpcs: StorageBackend<string, Vpc>;
  private subnets: StorageBackend<string, Subnet>;
  private securityGroups: StorageBackend<string, SecurityGroup>;
  private internetGateways: StorageBackend<string, InternetGateway>;
  private routeTables: StorageBackend<string, RouteTable>;
  private natGateways: StorageBackend<string, NatGateway>;
  private elasticAddresses: StorageBackend<string, ElasticAddress>;
  private tags: Map<string, Ec2Tag[]>; // resourceId -> tags

  constructor(private accountId: string, private defaultRegion: string) {
    this.vpcs = new InMemoryStorage();
    this.subnets = new InMemoryStorage();
    this.securityGroups = new InMemoryStorage();
    this.internetGateways = new InMemoryStorage();
    this.routeTables = new InMemoryStorage();
    this.natGateways = new InMemoryStorage();
    this.elasticAddresses = new InMemoryStorage();
    this.tags = new Map();
  }

  // --- VPC ---

  createVpc(cidrBlock: string, instanceTenancy?: string): Vpc {
    const vpcId = genId("vpc-");
    const vpc: Vpc = {
      vpcId,
      cidrBlock,
      state: "available",
      isDefault: false,
      dhcpOptionsId: genId("dopt-"),
      instanceTenancy: instanceTenancy ?? "default",
      enableDnsSupport: true,
      enableDnsHostnames: false,
      ownerId: this.accountId,
      tags: [],
    };
    this.vpcs.set(vpcId, vpc);
    return vpc;
  }

  describeVpcs(vpcIds?: string[]): Vpc[] {
    const all = this.vpcs.values();
    if (!vpcIds || vpcIds.length === 0) return all;
    const found = all.filter((v) => vpcIds.includes(v.vpcId));
    for (const id of vpcIds) {
      if (!found.some((v) => v.vpcId === id)) {
        throw new AwsError("InvalidVpcID.NotFound", `The vpc ID '${id}' does not exist`, 400);
      }
    }
    return found;
  }

  deleteVpc(vpcId: string): void {
    if (!this.vpcs.has(vpcId)) {
      throw new AwsError("InvalidVpcID.NotFound", `The vpc ID '${vpcId}' does not exist`, 400);
    }
    this.vpcs.delete(vpcId);
  }

  modifyVpcAttribute(vpcId: string, enableDnsSupport?: boolean, enableDnsHostnames?: boolean): void {
    const vpc = this.vpcs.get(vpcId);
    if (!vpc) throw new AwsError("InvalidVpcID.NotFound", `The vpc ID '${vpcId}' does not exist`, 400);
    if (enableDnsSupport !== undefined) vpc.enableDnsSupport = enableDnsSupport;
    if (enableDnsHostnames !== undefined) vpc.enableDnsHostnames = enableDnsHostnames;
  }

  // --- Tags ---

  createTags(resources: string[], tags: Ec2Tag[]): void {
    for (const resourceId of resources) {
      const existing = this.tags.get(resourceId) ?? [];
      for (const tag of tags) {
        const idx = existing.findIndex((t) => t.key === tag.key);
        if (idx >= 0) existing[idx] = tag;
        else existing.push(tag);
      }
      this.tags.set(resourceId, existing);
      // Also update in-resource tags for VPCs, subnets, etc.
      this.syncTagsToResource(resourceId, existing);
    }
  }

  describeTags(filters?: { name: string; values: string[] }[]): { resourceId: string; resourceType: string; key: string; value: string }[] {
    const result: { resourceId: string; resourceType: string; key: string; value: string }[] = [];
    for (const [resourceId, tags] of this.tags.entries()) {
      const resourceType = this.getResourceType(resourceId);
      for (const tag of tags) {
        result.push({ resourceId, resourceType, key: tag.key, value: tag.value });
      }
    }
    if (!filters || filters.length === 0) return result;
    return result.filter((item) => {
      for (const filter of filters) {
        if (filter.name === "resource-id" && !filter.values.includes(item.resourceId)) return false;
        if (filter.name === "resource-type" && !filter.values.includes(item.resourceType)) return false;
        if (filter.name === "key" && !filter.values.includes(item.key)) return false;
        if (filter.name === "value" && !filter.values.includes(item.value)) return false;
      }
      return true;
    });
  }

  private getResourceType(id: string): string {
    if (id.startsWith("vpc-")) return "vpc";
    if (id.startsWith("subnet-")) return "subnet";
    if (id.startsWith("sg-")) return "security-group";
    if (id.startsWith("igw-")) return "internet-gateway";
    if (id.startsWith("rtb-")) return "route-table";
    if (id.startsWith("nat-")) return "natgateway";
    if (id.startsWith("eipalloc-")) return "elastic-ip";
    return "unknown";
  }

  private syncTagsToResource(resourceId: string, tags: Ec2Tag[]): void {
    const vpc = this.vpcs.get(resourceId);
    if (vpc) { vpc.tags = tags; return; }
    const subnet = this.subnets.get(resourceId);
    if (subnet) { subnet.tags = tags; return; }
    const sg = this.securityGroups.get(resourceId);
    if (sg) { sg.tags = tags; return; }
    const igw = this.internetGateways.get(resourceId);
    if (igw) { igw.tags = tags; return; }
    const rtb = this.routeTables.get(resourceId);
    if (rtb) { rtb.tags = tags; return; }
    const nat = this.natGateways.get(resourceId);
    if (nat) { nat.tags = tags; return; }
    const eip = this.elasticAddresses.get(resourceId);
    if (eip) { eip.tags = tags; return; }
  }

  // --- Subnets ---

  createSubnet(vpcId: string, cidrBlock: string, availabilityZone?: string): Subnet {
    if (!this.vpcs.has(vpcId)) {
      throw new AwsError("InvalidVpcID.NotFound", `The vpc ID '${vpcId}' does not exist`, 400);
    }
    const subnetId = genId("subnet-");
    const subnet: Subnet = {
      subnetId,
      vpcId,
      cidrBlock,
      availabilityZone: availabilityZone ?? `${this.defaultRegion}a`,
      availableIpAddressCount: 251,
      state: "available",
      mapPublicIpOnLaunch: false,
      ownerId: this.accountId,
      tags: [],
    };
    this.subnets.set(subnetId, subnet);
    return subnet;
  }

  describeSubnets(subnetIds?: string[], filters?: { name: string; values: string[] }[]): Subnet[] {
    let all = this.subnets.values();
    if (subnetIds && subnetIds.length > 0) {
      all = all.filter((s) => subnetIds.includes(s.subnetId));
      for (const id of subnetIds) {
        if (!all.some((s) => s.subnetId === id)) {
          throw new AwsError("InvalidSubnetID.NotFound", `The subnet ID '${id}' does not exist`, 400);
        }
      }
    }
    if (filters && filters.length > 0) {
      all = all.filter((s) => {
        for (const f of filters) {
          if (f.name === "vpc-id" && !f.values.includes(s.vpcId)) return false;
          if (f.name === "availability-zone" && !f.values.includes(s.availabilityZone)) return false;
        }
        return true;
      });
    }
    return all;
  }

  deleteSubnet(subnetId: string): void {
    if (!this.subnets.has(subnetId)) {
      throw new AwsError("InvalidSubnetID.NotFound", `The subnet ID '${subnetId}' does not exist`, 400);
    }
    this.subnets.delete(subnetId);
  }

  modifySubnetAttribute(subnetId: string, mapPublicIpOnLaunch?: boolean): void {
    const subnet = this.subnets.get(subnetId);
    if (!subnet) throw new AwsError("InvalidSubnetID.NotFound", `The subnet ID '${subnetId}' does not exist`, 400);
    if (mapPublicIpOnLaunch !== undefined) subnet.mapPublicIpOnLaunch = mapPublicIpOnLaunch;
  }

  // --- Security Groups ---

  createSecurityGroup(groupName: string, description: string, vpcId: string): SecurityGroup {
    if (!this.vpcs.has(vpcId)) {
      throw new AwsError("InvalidVpcID.NotFound", `The vpc ID '${vpcId}' does not exist`, 400);
    }
    const groupId = genId("sg-");
    const sg: SecurityGroup = {
      groupId,
      groupName,
      description,
      vpcId,
      ownerId: this.accountId,
      ipPermissions: [],
      ipPermissionsEgress: [{
        ipProtocol: "-1",
        ipRanges: [{ cidrIp: "0.0.0.0/0" }],
        ipv6Ranges: [],
        prefixListIds: [],
        userIdGroupPairs: [],
      }],
      tags: [],
    };
    this.securityGroups.set(groupId, sg);
    return sg;
  }

  describeSecurityGroups(groupIds?: string[], filters?: { name: string; values: string[] }[]): SecurityGroup[] {
    let all = this.securityGroups.values();
    if (groupIds && groupIds.length > 0) {
      all = all.filter((s) => groupIds.includes(s.groupId));
      for (const id of groupIds) {
        if (!all.some((s) => s.groupId === id)) {
          throw new AwsError("InvalidGroup.NotFound", `The security group '${id}' does not exist`, 400);
        }
      }
    }
    if (filters && filters.length > 0) {
      all = all.filter((s) => {
        for (const f of filters) {
          if (f.name === "vpc-id" && !f.values.includes(s.vpcId)) return false;
          if (f.name === "group-name" && !f.values.includes(s.groupName)) return false;
        }
        return true;
      });
    }
    return all;
  }

  deleteSecurityGroup(groupId: string): void {
    if (!this.securityGroups.has(groupId)) {
      throw new AwsError("InvalidGroup.NotFound", `The security group '${groupId}' does not exist`, 400);
    }
    this.securityGroups.delete(groupId);
  }

  authorizeSecurityGroupIngress(groupId: string, permissions: IpPermission[]): void {
    const sg = this.securityGroups.get(groupId);
    if (!sg) throw new AwsError("InvalidGroup.NotFound", `The security group '${groupId}' does not exist`, 400);
    sg.ipPermissions.push(...permissions);
  }

  authorizeSecurityGroupEgress(groupId: string, permissions: IpPermission[]): void {
    const sg = this.securityGroups.get(groupId);
    if (!sg) throw new AwsError("InvalidGroup.NotFound", `The security group '${groupId}' does not exist`, 400);
    sg.ipPermissionsEgress.push(...permissions);
  }

  revokeSecurityGroupIngress(groupId: string, permissions: IpPermission[]): void {
    const sg = this.securityGroups.get(groupId);
    if (!sg) throw new AwsError("InvalidGroup.NotFound", `The security group '${groupId}' does not exist`, 400);
    sg.ipPermissions = this.removePermissions(sg.ipPermissions, permissions);
  }

  revokeSecurityGroupEgress(groupId: string, permissions: IpPermission[]): void {
    const sg = this.securityGroups.get(groupId);
    if (!sg) throw new AwsError("InvalidGroup.NotFound", `The security group '${groupId}' does not exist`, 400);
    sg.ipPermissionsEgress = this.removePermissions(sg.ipPermissionsEgress, permissions);
  }

  private removePermissions(existing: IpPermission[], toRemove: IpPermission[]): IpPermission[] {
    return existing.filter((ep) => {
      return !toRemove.some((rp) =>
        rp.ipProtocol === ep.ipProtocol &&
        rp.fromPort === ep.fromPort &&
        rp.toPort === ep.toPort
      );
    });
  }

  // --- Internet Gateways ---

  createInternetGateway(): InternetGateway {
    const igwId = genId("igw-");
    const igw: InternetGateway = {
      internetGatewayId: igwId,
      attachments: [],
      ownerId: this.accountId,
      tags: [],
    };
    this.internetGateways.set(igwId, igw);
    return igw;
  }

  describeInternetGateways(igwIds?: string[], filters?: { name: string; values: string[] }[]): InternetGateway[] {
    let all = this.internetGateways.values();
    if (igwIds && igwIds.length > 0) {
      all = all.filter((g) => igwIds.includes(g.internetGatewayId));
    }
    if (filters && filters.length > 0) {
      all = all.filter((g) => {
        for (const f of filters) {
          if (f.name === "attachment.vpc-id" && !g.attachments.some((a) => f.values.includes(a.vpcId))) return false;
        }
        return true;
      });
    }
    return all;
  }

  deleteInternetGateway(igwId: string): void {
    if (!this.internetGateways.has(igwId)) {
      throw new AwsError("InvalidInternetGatewayID.NotFound", `The internetGateway ID '${igwId}' does not exist`, 400);
    }
    this.internetGateways.delete(igwId);
  }

  attachInternetGateway(igwId: string, vpcId: string): void {
    const igw = this.internetGateways.get(igwId);
    if (!igw) throw new AwsError("InvalidInternetGatewayID.NotFound", `The internetGateway ID '${igwId}' does not exist`, 400);
    if (!this.vpcs.has(vpcId)) throw new AwsError("InvalidVpcID.NotFound", `The vpc ID '${vpcId}' does not exist`, 400);
    igw.attachments.push({ vpcId, state: "available" });
  }

  detachInternetGateway(igwId: string, vpcId: string): void {
    const igw = this.internetGateways.get(igwId);
    if (!igw) throw new AwsError("InvalidInternetGatewayID.NotFound", `The internetGateway ID '${igwId}' does not exist`, 400);
    igw.attachments = igw.attachments.filter((a) => a.vpcId !== vpcId);
  }

  // --- Route Tables ---

  createRouteTable(vpcId: string): RouteTable {
    if (!this.vpcs.has(vpcId)) {
      throw new AwsError("InvalidVpcID.NotFound", `The vpc ID '${vpcId}' does not exist`, 400);
    }
    const vpc = this.vpcs.get(vpcId)!;
    const rtbId = genId("rtb-");
    const rtb: RouteTable = {
      routeTableId: rtbId,
      vpcId,
      routes: [{ destinationCidrBlock: vpc.cidrBlock, gatewayId: "local", state: "active", origin: "CreateRouteTable" }],
      associations: [],
      ownerId: this.accountId,
      tags: [],
    };
    this.routeTables.set(rtbId, rtb);
    return rtb;
  }

  describeRouteTables(rtbIds?: string[], filters?: { name: string; values: string[] }[]): RouteTable[] {
    let all = this.routeTables.values();
    if (rtbIds && rtbIds.length > 0) {
      all = all.filter((r) => rtbIds.includes(r.routeTableId));
    }
    if (filters && filters.length > 0) {
      all = all.filter((r) => {
        for (const f of filters) {
          if (f.name === "vpc-id" && !f.values.includes(r.vpcId)) return false;
          if (f.name === "route-table-id" && !f.values.includes(r.routeTableId)) return false;
        }
        return true;
      });
    }
    return all;
  }

  deleteRouteTable(rtbId: string): void {
    if (!this.routeTables.has(rtbId)) {
      throw new AwsError("InvalidRouteTableID.NotFound", `The routeTable ID '${rtbId}' does not exist`, 400);
    }
    this.routeTables.delete(rtbId);
  }

  createRoute(rtbId: string, destinationCidrBlock: string, gatewayId?: string, natGatewayId?: string): void {
    const rtb = this.routeTables.get(rtbId);
    if (!rtb) throw new AwsError("InvalidRouteTableID.NotFound", `The routeTable ID '${rtbId}' does not exist`, 400);
    rtb.routes.push({
      destinationCidrBlock,
      gatewayId,
      natGatewayId,
      state: "active",
      origin: "CreateRoute",
    });
  }

  deleteRoute(rtbId: string, destinationCidrBlock: string): void {
    const rtb = this.routeTables.get(rtbId);
    if (!rtb) throw new AwsError("InvalidRouteTableID.NotFound", `The routeTable ID '${rtbId}' does not exist`, 400);
    rtb.routes = rtb.routes.filter((r) => r.destinationCidrBlock !== destinationCidrBlock);
  }

  associateRouteTable(rtbId: string, subnetId: string): string {
    const rtb = this.routeTables.get(rtbId);
    if (!rtb) throw new AwsError("InvalidRouteTableID.NotFound", `The routeTable ID '${rtbId}' does not exist`, 400);
    const assocId = genId("rtbassoc-");
    rtb.associations.push({ routeTableAssociationId: assocId, routeTableId: rtbId, subnetId, main: false });
    return assocId;
  }

  disassociateRouteTable(associationId: string): void {
    for (const rtb of this.routeTables.values()) {
      const idx = rtb.associations.findIndex((a) => a.routeTableAssociationId === associationId);
      if (idx >= 0) {
        rtb.associations.splice(idx, 1);
        return;
      }
    }
    throw new AwsError("InvalidAssociationID.NotFound", `The association ID '${associationId}' does not exist`, 400);
  }

  // --- NAT Gateways ---

  createNatGateway(subnetId: string, allocationId: string): NatGateway {
    const subnet = this.subnets.get(subnetId);
    if (!subnet) throw new AwsError("InvalidSubnetID.NotFound", `The subnet ID '${subnetId}' does not exist`, 400);
    const natId = genId("nat-");
    const eip = this.elasticAddresses.get(allocationId);
    const nat: NatGateway = {
      natGatewayId: natId,
      subnetId,
      allocationId,
      state: "available",
      vpcId: subnet.vpcId,
      natGatewayAddresses: [{
        allocationId,
        publicIp: eip?.publicIp ?? genIp(),
        networkInterfaceId: genId("eni-"),
        privateIp: "10.0.0." + Math.floor(Math.random() * 254 + 1),
      }],
      ownerId: this.accountId,
      createTime: new Date().toISOString(),
      tags: [],
    };
    this.natGateways.set(natId, nat);
    return nat;
  }

  describeNatGateways(natGatewayIds?: string[], filters?: { name: string; values: string[] }[]): NatGateway[] {
    let all = this.natGateways.values();
    if (natGatewayIds && natGatewayIds.length > 0) {
      all = all.filter((n) => natGatewayIds.includes(n.natGatewayId));
    }
    if (filters && filters.length > 0) {
      all = all.filter((n) => {
        for (const f of filters) {
          if (f.name === "vpc-id" && !f.values.includes(n.vpcId)) return false;
          if (f.name === "subnet-id" && !f.values.includes(n.subnetId)) return false;
        }
        return true;
      });
    }
    return all;
  }

  deleteNatGateway(natGatewayId: string): NatGateway {
    const nat = this.natGateways.get(natGatewayId);
    if (!nat) throw new AwsError("NatGatewayNotFound", `The natGateway ID '${natGatewayId}' does not exist`, 400);
    nat.state = "deleted";
    this.natGateways.delete(natGatewayId);
    return nat;
  }

  // --- Elastic IPs ---

  allocateAddress(domain?: string): ElasticAddress {
    const allocId = genId("eipalloc-");
    const eip: ElasticAddress = {
      allocationId: allocId,
      publicIp: genIp(),
      domain: domain ?? "vpc",
      ownerId: this.accountId,
      tags: [],
    };
    this.elasticAddresses.set(allocId, eip);
    return eip;
  }

  describeAddresses(allocationIds?: string[]): ElasticAddress[] {
    const all = this.elasticAddresses.values();
    if (!allocationIds || allocationIds.length === 0) return all;
    return all.filter((a) => allocationIds.includes(a.allocationId));
  }

  releaseAddress(allocationId: string): void {
    if (!this.elasticAddresses.has(allocationId)) {
      throw new AwsError("InvalidAllocationID.NotFound", `The allocation ID '${allocationId}' does not exist`, 400);
    }
    this.elasticAddresses.delete(allocationId);
  }

  // --- Network ACLs ---

  describeNetworkAcls(filters?: { name: string; values: string[] }[]): any[] {
    const vpcs = this.vpcs.values();
    const acls = vpcs.map((vpc) => ({
      networkAclId: genId("acl-"),
      vpcId: vpc.vpcId,
      isDefault: true,
      entries: [
        { ruleNumber: 100, protocol: "-1", ruleAction: "allow", egress: false, cidrBlock: "0.0.0.0/0" },
        { ruleNumber: 32767, protocol: "-1", ruleAction: "deny", egress: false, cidrBlock: "0.0.0.0/0" },
        { ruleNumber: 100, protocol: "-1", ruleAction: "allow", egress: true, cidrBlock: "0.0.0.0/0" },
        { ruleNumber: 32767, protocol: "-1", ruleAction: "deny", egress: true, cidrBlock: "0.0.0.0/0" },
      ],
      tags: [],
      associations: [],
      ownerId: this.accountId,
    }));
    if (filters && filters.length > 0) {
      return acls.filter((a) => {
        for (const f of filters) {
          if (f.name === "vpc-id" && !f.values.includes(a.vpcId)) return false;
        }
        return true;
      });
    }
    return acls;
  }

  // --- Availability Zones ---

  describeAvailabilityZones(region: string): { zoneName: string; state: string; regionName: string; zoneId: string }[] {
    const suffixes = ["a", "b", "c", "d", "e", "f"];
    return suffixes.slice(0, 3).map((s, i) => ({
      zoneName: `${region}${s}`,
      state: "available",
      regionName: region,
      zoneId: `${region.replace(/-/g, "")}${i + 1}`,
    }));
  }

  // --- Regions ---

  describeRegions(): typeof AWS_REGIONS {
    return AWS_REGIONS;
  }

  // --- Account Attributes ---

  describeAccountAttributes(): { name: string; values: string[] }[] {
    return [
      { name: "vpc-max-security-groups-per-interface", values: ["5"] },
      { name: "max-instances", values: ["20"] },
      { name: "supported-platforms", values: ["VPC"] },
      { name: "default-vpc", values: ["none"] },
      { name: "max-elastic-ips", values: ["5"] },
      { name: "vpc-max-elastic-ips", values: ["5"] },
    ];
  }
}
