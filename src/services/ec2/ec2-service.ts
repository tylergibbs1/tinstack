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

export interface InstanceState {
  code: number;
  name: string;
}

export const INSTANCE_STATES = {
  pending: { code: 0, name: "pending" } as InstanceState,
  running: { code: 16, name: "running" } as InstanceState,
  shuttingDown: { code: 32, name: "shutting-down" } as InstanceState,
  terminated: { code: 48, name: "terminated" } as InstanceState,
  stopping: { code: 64, name: "stopping" } as InstanceState,
  stopped: { code: 80, name: "stopped" } as InstanceState,
} as const;

export interface Ec2Instance {
  instanceId: string;
  imageId: string;
  instanceType: string;
  keyName?: string;
  state: InstanceState;
  privateIpAddress: string;
  publicIpAddress?: string;
  subnetId?: string;
  vpcId?: string;
  securityGroups: { groupId: string; groupName: string }[];
  launchTime: string;
  tags: Ec2Tag[];
  reservationId: string;
}

export interface KeyPair {
  keyPairId: string;
  keyName: string;
  keyFingerprint: string;
  keyMaterial?: string;
  keyType: string;
  tags: Ec2Tag[];
}

export type VolumeType = "gp3" | "gp2" | "io1" | "io2" | "st1" | "sc1";

export interface VolumeAttachment {
  instanceId: string;
  device: string;
  state: string;
  attachTime: string;
}

export interface Volume {
  volumeId: string;
  size: number;
  availabilityZone: string;
  volumeType: VolumeType;
  state: string;
  encrypted: boolean;
  iops?: number;
  throughput?: number;
  snapshotId?: string;
  createTime: string;
  attachments: VolumeAttachment[];
  tags: Ec2Tag[];
}

export interface Image {
  imageId: string;
  name: string;
  description?: string;
  state: string;
  ownerId: string;
  sourceInstanceId?: string;
  architecture: string;
  imageType: string;
  rootDeviceType: string;
  virtualizationType: string;
  creationDate: string;
  tags: Ec2Tag[];
}

export interface NetworkInterface {
  networkInterfaceId: string;
  subnetId: string;
  vpcId: string;
  description: string;
  status: string;
  privateIpAddress: string;
  securityGroupIds: string[];
  attachmentId?: string;
  instanceId?: string;
  ownerId: string;
  tags: Ec2Tag[];
}

export interface VpcEndpoint {
  vpcEndpointId: string;
  vpcId: string;
  serviceName: string;
  vpcEndpointType: string;
  state: string;
  routeTableIds: string[];
  subnetIds: string[];
  creationTimestamp: string;
  ownerId: string;
  tags: Ec2Tag[];
}

export interface MockInstanceType {
  instanceType: string;
  vCpus: number;
  memoryMiB: number;
  currentGeneration: boolean;
  supportedUsageClasses: string[];
  supportedArchitectures: string[];
  processorInfo: { sustainedClockSpeedInGhz: number };
  networkPerformance: string;
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

function parseCidr(cidr: string): { ip: number; prefix: number } | null {
  const match = cidr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/);
  if (!match) return null;
  const octets = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), parseInt(match[4])];
  const prefix = parseInt(match[5]);
  if (octets.some((o) => o < 0 || o > 255) || prefix < 0 || prefix > 32) return null;
  const ip = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  return { ip, prefix };
}

function cidrMask(prefix: number): number {
  return prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
}

function validateCidr(cidr: string): boolean {
  const parsed = parseCidr(cidr);
  if (!parsed) return false;
  const mask = cidrMask(parsed.prefix);
  return (parsed.ip & mask) >>> 0 === parsed.ip;
}

function cidrRange(cidr: string): { start: number; end: number } {
  const parsed = parseCidr(cidr)!;
  const mask = cidrMask(parsed.prefix);
  const start = (parsed.ip & mask) >>> 0;
  const end = (start | (~mask >>> 0)) >>> 0;
  return { start, end };
}

function isSubnetOf(subnet: string, vpc: string): boolean {
  const sub = cidrRange(subnet);
  const parent = cidrRange(vpc);
  return sub.start >= parent.start && sub.end <= parent.end;
}

function overlaps(cidr1: string, cidr2: string): boolean {
  const a = cidrRange(cidr1);
  const b = cidrRange(cidr2);
  return a.start <= b.end && b.start <= a.end;
}

export class Ec2Service {
  private vpcs: StorageBackend<string, Vpc>;
  private subnets: StorageBackend<string, Subnet>;
  private securityGroups: StorageBackend<string, SecurityGroup>;
  private internetGateways: StorageBackend<string, InternetGateway>;
  private routeTables: StorageBackend<string, RouteTable>;
  private natGateways: StorageBackend<string, NatGateway>;
  private elasticAddresses: StorageBackend<string, ElasticAddress>;
  private instances: StorageBackend<string, Ec2Instance>;
  private keyPairs: StorageBackend<string, KeyPair>;
  private volumes: StorageBackend<string, Volume>;
  private images: StorageBackend<string, Image>;
  private networkInterfaces: StorageBackend<string, NetworkInterface>;
  private vpcEndpoints: StorageBackend<string, VpcEndpoint>;
  private tags: Map<string, Ec2Tag[]>; // resourceId -> tags

  constructor(private accountId: string, private defaultRegion: string) {
    this.vpcs = new InMemoryStorage();
    this.subnets = new InMemoryStorage();
    this.securityGroups = new InMemoryStorage();
    this.internetGateways = new InMemoryStorage();
    this.routeTables = new InMemoryStorage();
    this.natGateways = new InMemoryStorage();
    this.elasticAddresses = new InMemoryStorage();
    this.instances = new InMemoryStorage();
    this.keyPairs = new InMemoryStorage();
    this.volumes = new InMemoryStorage();
    this.images = new InMemoryStorage();
    this.networkInterfaces = new InMemoryStorage();
    this.vpcEndpoints = new InMemoryStorage();
    this.tags = new Map();
  }

  // --- VPC ---

  createVpc(cidrBlock: string, instanceTenancy?: string): Vpc {
    if (!validateCidr(cidrBlock)) {
      throw new AwsError("InvalidParameterValue", `Value (${cidrBlock}) for parameter cidrBlock is invalid. This is not a valid CIDR block.`, 400);
    }
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
    const subnetsInVpc = this.subnets.values().filter((s) => s.vpcId === vpcId);
    if (subnetsInVpc.length > 0) {
      throw new AwsError("DependencyViolation", `The vpc '${vpcId}' has dependencies and cannot be deleted.`, 400);
    }
    const igwsAttached = this.internetGateways.values().filter((igw) => igw.attachments.some((a) => a.vpcId === vpcId));
    if (igwsAttached.length > 0) {
      throw new AwsError("DependencyViolation", `The vpc '${vpcId}' has dependencies and cannot be deleted.`, 400);
    }
    const nonDefaultSgs = this.securityGroups.values().filter((sg) => sg.vpcId === vpcId && sg.groupName !== "default");
    if (nonDefaultSgs.length > 0) {
      throw new AwsError("DependencyViolation", `The vpc '${vpcId}' has dependencies and cannot be deleted.`, 400);
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
    if (id.startsWith("i-")) return "instance";
    if (id.startsWith("key-")) return "key-pair";
    if (id.startsWith("vol-")) return "volume";
    if (id.startsWith("ami-")) return "image";
    if (id.startsWith("eni-")) return "network-interface";
    if (id.startsWith("vpce-")) return "vpc-endpoint";
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
    const inst = this.instances.get(resourceId);
    if (inst) { inst.tags = tags; return; }
    const kp = this.keyPairs.get(resourceId);
    if (kp) { kp.tags = tags; return; }
    const vol = this.volumes.get(resourceId);
    if (vol) { vol.tags = tags; return; }
    const img = this.images.get(resourceId);
    if (img) { img.tags = tags; return; }
    const eni = this.networkInterfaces.get(resourceId);
    if (eni) { eni.tags = tags; return; }
    const vpce = this.vpcEndpoints.get(resourceId);
    if (vpce) { vpce.tags = tags; return; }
  }

  // --- Subnets ---

  createSubnet(vpcId: string, cidrBlock: string, availabilityZone?: string): Subnet {
    const vpc = this.vpcs.get(vpcId);
    if (!vpc) {
      throw new AwsError("InvalidVpcID.NotFound", `The vpc ID '${vpcId}' does not exist`, 400);
    }
    if (!validateCidr(cidrBlock)) {
      throw new AwsError("InvalidParameterValue", `Value (${cidrBlock}) for parameter cidrBlock is invalid. This is not a valid CIDR block.`, 400);
    }
    if (!isSubnetOf(cidrBlock, vpc.cidrBlock)) {
      throw new AwsError("InvalidSubnet.Range", `The CIDR '${cidrBlock}' is out of range of the VPC CIDR '${vpc.cidrBlock}'.`, 400);
    }
    const existingSubnets = this.subnets.values().filter((s) => s.vpcId === vpcId);
    for (const existing of existingSubnets) {
      if (overlaps(cidrBlock, existing.cidrBlock)) {
        throw new AwsError("InvalidSubnet.Conflict", `The CIDR '${cidrBlock}' conflicts with another subnet '${existing.cidrBlock}' in the same VPC.`, 400);
      }
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
    const instancesInSubnet = this.instances.values().filter((i) => i.subnetId === subnetId && i.state.name !== "terminated");
    if (instancesInSubnet.length > 0) {
      throw new AwsError("DependencyViolation", `The subnet '${subnetId}' has dependencies and cannot be deleted.`, 400);
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
    const sg = this.securityGroups.get(groupId);
    if (!sg) {
      throw new AwsError("InvalidGroup.NotFound", `The security group '${groupId}' does not exist`, 400);
    }
    if (sg.groupName === "default") {
      throw new AwsError("CannotDelete", `The default security group cannot be deleted.`, 400);
    }
    const referencingInstances = this.instances.values().filter(
      (i) => i.state.name !== "terminated" && i.securityGroups.some((isg) => isg.groupId === groupId),
    );
    if (referencingInstances.length > 0) {
      throw new AwsError("DependencyViolation", `The security group '${groupId}' has dependencies and cannot be deleted.`, 400);
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
    const igw = this.internetGateways.get(igwId);
    if (!igw) {
      throw new AwsError("InvalidInternetGatewayID.NotFound", `The internetGateway ID '${igwId}' does not exist`, 400);
    }
    if (igw.attachments.length > 0) {
      throw new AwsError("DependencyViolation", `The internetGateway '${igwId}' has dependencies and cannot be deleted.`, 400);
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

  // --- Instances ---

  runInstances(params: {
    imageId: string;
    instanceType?: string;
    keyName?: string;
    securityGroupIds?: string[];
    subnetId?: string;
    minCount?: number;
    maxCount?: number;
    tagSpecifications?: { resourceType: string; tags: Ec2Tag[] }[];
  }): { reservationId: string; instances: Ec2Instance[] } {
    const count = params.maxCount ?? params.minCount ?? 1;
    const reservationId = genId("r-");
    const instanceTags = params.tagSpecifications?.find((ts) => ts.resourceType === "instance")?.tags ?? [];

    const securityGroups: { groupId: string; groupName: string }[] = [];
    if (params.securityGroupIds) {
      for (const sgId of params.securityGroupIds) {
        const sg = this.securityGroups.get(sgId);
        securityGroups.push({ groupId: sgId, groupName: sg?.groupName ?? "default" });
      }
    }

    let vpcId: string | undefined;
    if (params.subnetId) {
      const subnet = this.subnets.get(params.subnetId);
      if (!subnet) throw new AwsError("InvalidSubnetID.NotFound", `The subnet ID '${params.subnetId}' does not exist`, 400);
      vpcId = subnet.vpcId;
    }

    const created: Ec2Instance[] = [];
    for (let n = 0; n < count; n++) {
      const instanceId = genId("i-");
      const instance: Ec2Instance = {
        instanceId,
        imageId: params.imageId,
        instanceType: params.instanceType ?? "t2.micro",
        keyName: params.keyName,
        state: { ...INSTANCE_STATES.running },
        privateIpAddress: `10.0.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`,
        subnetId: params.subnetId,
        vpcId,
        securityGroups,
        launchTime: new Date().toISOString(),
        tags: [...instanceTags],
        reservationId,
      };
      this.instances.set(instanceId, instance);
      if (instanceTags.length > 0) {
        this.tags.set(instanceId, [...instanceTags]);
      }
      created.push(instance);
    }
    return { reservationId, instances: created };
  }

  describeInstances(instanceIds?: string[]): { reservationId: string; instances: Ec2Instance[] }[] {
    let all = this.instances.values().filter((i) => i.state.name !== "terminated");
    if (instanceIds && instanceIds.length > 0) {
      all = all.filter((i) => instanceIds.includes(i.instanceId));
      for (const id of instanceIds) {
        if (!all.some((i) => i.instanceId === id) && !this.instances.has(id)) {
          throw new AwsError("InvalidInstanceID.NotFound", `The instance ID '${id}' does not exist`, 400);
        }
      }
      // Include terminated instances when specifically requested by ID
      all = this.instances.values().filter((i) => instanceIds.includes(i.instanceId));
    }

    // Group by reservationId
    const reservations = new Map<string, Ec2Instance[]>();
    for (const inst of all) {
      const list = reservations.get(inst.reservationId) ?? [];
      list.push(inst);
      reservations.set(inst.reservationId, list);
    }
    return Array.from(reservations.entries()).map(([reservationId, instances]) => ({
      reservationId,
      instances,
    }));
  }

  terminateInstances(instanceIds: string[]): { instanceId: string; previousState: InstanceState; currentState: InstanceState }[] {
    const results: { instanceId: string; previousState: InstanceState; currentState: InstanceState }[] = [];
    for (const id of instanceIds) {
      const inst = this.instances.get(id);
      if (!inst) throw new AwsError("InvalidInstanceID.NotFound", `The instance ID '${id}' does not exist`, 400);
      const previousState = { ...inst.state };
      inst.state = { ...INSTANCE_STATES.terminated };
      results.push({ instanceId: id, previousState, currentState: { ...inst.state } });
    }
    return results;
  }

  startInstances(instanceIds: string[]): { instanceId: string; previousState: InstanceState; currentState: InstanceState }[] {
    const results: { instanceId: string; previousState: InstanceState; currentState: InstanceState }[] = [];
    for (const id of instanceIds) {
      const inst = this.instances.get(id);
      if (!inst) throw new AwsError("InvalidInstanceID.NotFound", `The instance ID '${id}' does not exist`, 400);
      const previousState = { ...inst.state };
      inst.state = { ...INSTANCE_STATES.running };
      results.push({ instanceId: id, previousState, currentState: { ...inst.state } });
    }
    return results;
  }

  stopInstances(instanceIds: string[]): { instanceId: string; previousState: InstanceState; currentState: InstanceState }[] {
    const results: { instanceId: string; previousState: InstanceState; currentState: InstanceState }[] = [];
    for (const id of instanceIds) {
      const inst = this.instances.get(id);
      if (!inst) throw new AwsError("InvalidInstanceID.NotFound", `The instance ID '${id}' does not exist`, 400);
      const previousState = { ...inst.state };
      inst.state = { ...INSTANCE_STATES.stopped };
      results.push({ instanceId: id, previousState, currentState: { ...inst.state } });
    }
    return results;
  }

  rebootInstances(instanceIds: string[]): void {
    for (const id of instanceIds) {
      if (!this.instances.has(id)) {
        throw new AwsError("InvalidInstanceID.NotFound", `The instance ID '${id}' does not exist`, 400);
      }
    }
  }

  describeInstanceStatus(instanceIds?: string[]): Ec2Instance[] {
    let all = this.instances.values().filter((i) => i.state.name === "running");
    if (instanceIds && instanceIds.length > 0) {
      all = all.filter((i) => instanceIds.includes(i.instanceId));
    }
    return all;
  }

  modifyInstanceAttribute(instanceId: string, attrs: { instanceType?: string; securityGroupIds?: string[] }): void {
    const inst = this.instances.get(instanceId);
    if (!inst) throw new AwsError("InvalidInstanceID.NotFound", `The instance ID '${instanceId}' does not exist`, 400);
    if (attrs.instanceType !== undefined) inst.instanceType = attrs.instanceType;
    if (attrs.securityGroupIds !== undefined) {
      inst.securityGroups = attrs.securityGroupIds.map((sgId) => {
        const sg = this.securityGroups.get(sgId);
        return { groupId: sgId, groupName: sg?.groupName ?? "default" };
      });
    }
  }

  // --- Key Pairs ---

  createKeyPair(keyName: string, keyType?: string): KeyPair {
    // Check for duplicate
    for (const kp of this.keyPairs.values()) {
      if (kp.keyName === keyName) {
        throw new AwsError("InvalidKeyPair.Duplicate", `The keypair '${keyName}' already exists.`, 400);
      }
    }
    const keyPairId = genId("key-");
    const kp: KeyPair = {
      keyPairId,
      keyName,
      keyFingerprint: Array.from({ length: 20 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(":"),
      keyMaterial: `-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY_MATERIAL_${keyPairId}\n-----END RSA PRIVATE KEY-----`,
      keyType: keyType ?? "rsa",
      tags: [],
    };
    this.keyPairs.set(keyPairId, kp);
    return kp;
  }

  describeKeyPairs(keyNames?: string[], keyPairIds?: string[]): KeyPair[] {
    let all = this.keyPairs.values();
    if (keyNames && keyNames.length > 0) {
      all = all.filter((kp) => keyNames.includes(kp.keyName));
      for (const name of keyNames) {
        if (!all.some((kp) => kp.keyName === name)) {
          throw new AwsError("InvalidKeyPair.NotFound", `The key pair '${name}' does not exist`, 400);
        }
      }
    }
    if (keyPairIds && keyPairIds.length > 0) {
      all = all.filter((kp) => keyPairIds.includes(kp.keyPairId));
    }
    return all;
  }

  deleteKeyPair(keyName?: string, keyPairId?: string): void {
    if (keyPairId) {
      this.keyPairs.delete(keyPairId);
      return;
    }
    if (keyName) {
      for (const kp of this.keyPairs.values()) {
        if (kp.keyName === keyName) {
          this.keyPairs.delete(kp.keyPairId);
          return;
        }
      }
    }
  }

  importKeyPair(keyName: string, publicKeyMaterial: string): KeyPair {
    // Check for duplicate
    for (const kp of this.keyPairs.values()) {
      if (kp.keyName === keyName) {
        throw new AwsError("InvalidKeyPair.Duplicate", `The keypair '${keyName}' already exists.`, 400);
      }
    }
    const keyPairId = genId("key-");
    const kp: KeyPair = {
      keyPairId,
      keyName,
      keyFingerprint: Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(":"),
      keyType: "rsa",
      tags: [],
    };
    this.keyPairs.set(keyPairId, kp);
    return kp;
  }

  // --- EBS Volumes ---

  createVolume(params: {
    size: number;
    availabilityZone: string;
    volumeType?: VolumeType;
    encrypted?: boolean;
    iops?: number;
    throughput?: number;
    snapshotId?: string;
    tagSpecifications?: { resourceType: string; tags: Ec2Tag[] }[];
  }): Volume {
    const volumeId = genId("vol-");
    const volumeTags = params.tagSpecifications?.find((ts) => ts.resourceType === "volume")?.tags ?? [];
    const vol: Volume = {
      volumeId,
      size: params.size,
      availabilityZone: params.availabilityZone,
      volumeType: params.volumeType ?? "gp3",
      state: "available",
      encrypted: params.encrypted ?? false,
      iops: params.iops,
      throughput: params.throughput,
      snapshotId: params.snapshotId,
      createTime: new Date().toISOString(),
      attachments: [],
      tags: [...volumeTags],
    };
    this.volumes.set(volumeId, vol);
    if (volumeTags.length > 0) {
      this.tags.set(volumeId, [...volumeTags]);
    }
    return vol;
  }

  describeVolumes(volumeIds?: string[]): Volume[] {
    const all = this.volumes.values();
    if (!volumeIds || volumeIds.length === 0) return all;
    const found = all.filter((v) => volumeIds.includes(v.volumeId));
    for (const id of volumeIds) {
      if (!found.some((v) => v.volumeId === id)) {
        throw new AwsError("InvalidVolume.NotFound", `The volume '${id}' does not exist.`, 400);
      }
    }
    return found;
  }

  deleteVolume(volumeId: string): void {
    const vol = this.volumes.get(volumeId);
    if (!vol) throw new AwsError("InvalidVolume.NotFound", `The volume '${volumeId}' does not exist.`, 400);
    if (vol.state === "in-use") {
      throw new AwsError("VolumeInUse", `Volume '${volumeId}' is currently attached to an instance.`, 400);
    }
    this.volumes.delete(volumeId);
  }

  attachVolume(volumeId: string, instanceId: string, device: string): VolumeAttachment {
    const vol = this.volumes.get(volumeId);
    if (!vol) throw new AwsError("InvalidVolume.NotFound", `The volume '${volumeId}' does not exist.`, 400);
    if (!this.instances.has(instanceId)) {
      throw new AwsError("InvalidInstanceID.NotFound", `The instance ID '${instanceId}' does not exist`, 400);
    }
    if (vol.state === "in-use") {
      throw new AwsError("VolumeInUse", `Volume '${volumeId}' is already attached.`, 400);
    }
    const attachment: VolumeAttachment = {
      instanceId,
      device,
      state: "attached",
      attachTime: new Date().toISOString(),
    };
    vol.attachments = [attachment];
    vol.state = "in-use";
    return attachment;
  }

  detachVolume(volumeId: string): VolumeAttachment {
    const vol = this.volumes.get(volumeId);
    if (!vol) throw new AwsError("InvalidVolume.NotFound", `The volume '${volumeId}' does not exist.`, 400);
    if (vol.state !== "in-use" || vol.attachments.length === 0) {
      throw new AwsError("IncorrectState", `Volume '${volumeId}' is not attached.`, 400);
    }
    const attachment = { ...vol.attachments[0], state: "detached" };
    vol.attachments = [];
    vol.state = "available";
    return attachment;
  }

  modifyVolume(volumeId: string, size?: number, volumeType?: VolumeType, iops?: number): Volume {
    const vol = this.volumes.get(volumeId);
    if (!vol) throw new AwsError("InvalidVolume.NotFound", `The volume '${volumeId}' does not exist.`, 400);
    if (size !== undefined) vol.size = size;
    if (volumeType !== undefined) vol.volumeType = volumeType;
    if (iops !== undefined) vol.iops = iops;
    return vol;
  }

  // --- AMIs ---

  createImage(params: { name: string; description?: string; instanceId?: string; tagSpecifications?: { resourceType: string; tags: Ec2Tag[] }[] }): Image {
    const imageId = genId("ami-");
    const imageTags = params.tagSpecifications?.find((ts) => ts.resourceType === "image")?.tags ?? [];
    const img: Image = {
      imageId,
      name: params.name,
      description: params.description,
      state: "available",
      ownerId: this.accountId,
      sourceInstanceId: params.instanceId,
      architecture: "x86_64",
      imageType: "machine",
      rootDeviceType: "ebs",
      virtualizationType: "hvm",
      creationDate: new Date().toISOString(),
      tags: [...imageTags],
    };
    this.images.set(imageId, img);
    if (imageTags.length > 0) {
      this.tags.set(imageId, [...imageTags]);
    }
    return img;
  }

  describeImages(imageIds?: string[], owners?: string[]): Image[] {
    let all = this.images.values();
    if (imageIds && imageIds.length > 0) {
      all = all.filter((i) => imageIds.includes(i.imageId));
      for (const id of imageIds) {
        if (!all.some((i) => i.imageId === id)) {
          throw new AwsError("InvalidAMIID.NotFound", `The image id '[${id}]' does not exist`, 400);
        }
      }
    }
    if (owners && owners.length > 0) {
      all = all.filter((i) => owners.includes("self") || owners.includes(i.ownerId));
    }
    return all;
  }

  deregisterImage(imageId: string): void {
    if (!this.images.has(imageId)) {
      throw new AwsError("InvalidAMIID.NotFound", `The image id '[${imageId}]' does not exist`, 400);
    }
    this.images.delete(imageId);
  }

  copyImage(sourceImageId: string, name: string, description?: string): Image {
    const source = this.images.get(sourceImageId);
    if (!source) throw new AwsError("InvalidAMIID.NotFound", `The image id '[${sourceImageId}]' does not exist`, 400);
    const imageId = genId("ami-");
    const img: Image = {
      ...source,
      imageId,
      name,
      description: description ?? source.description,
      creationDate: new Date().toISOString(),
      tags: [],
    };
    this.images.set(imageId, img);
    return img;
  }

  // --- Network Interfaces ---

  createNetworkInterface(params: { subnetId: string; description?: string; securityGroupIds?: string[]; privateIpAddress?: string }): NetworkInterface {
    const subnet = this.subnets.get(params.subnetId);
    if (!subnet) throw new AwsError("InvalidSubnetID.NotFound", `The subnet ID '${params.subnetId}' does not exist`, 400);
    const eniId = genId("eni-");
    const eni: NetworkInterface = {
      networkInterfaceId: eniId,
      subnetId: params.subnetId,
      vpcId: subnet.vpcId,
      description: params.description ?? "",
      status: "available",
      privateIpAddress: params.privateIpAddress ?? `10.0.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`,
      securityGroupIds: params.securityGroupIds ?? [],
      ownerId: this.accountId,
      tags: [],
    };
    this.networkInterfaces.set(eniId, eni);
    return eni;
  }

  describeNetworkInterfaces(networkInterfaceIds?: string[]): NetworkInterface[] {
    const all = this.networkInterfaces.values();
    if (!networkInterfaceIds || networkInterfaceIds.length === 0) return all;
    const found = all.filter((e) => networkInterfaceIds.includes(e.networkInterfaceId));
    for (const id of networkInterfaceIds) {
      if (!found.some((e) => e.networkInterfaceId === id)) {
        throw new AwsError("InvalidNetworkInterfaceID.NotFound", `The networkInterface ID '${id}' does not exist`, 400);
      }
    }
    return found;
  }

  deleteNetworkInterface(networkInterfaceId: string): void {
    const eni = this.networkInterfaces.get(networkInterfaceId);
    if (!eni) throw new AwsError("InvalidNetworkInterfaceID.NotFound", `The networkInterface ID '${networkInterfaceId}' does not exist`, 400);
    if (eni.status === "in-use") {
      throw new AwsError("InvalidParameterValue", `Network interface '${networkInterfaceId}' is currently in use.`, 400);
    }
    this.networkInterfaces.delete(networkInterfaceId);
  }

  attachNetworkInterface(networkInterfaceId: string, instanceId: string): string {
    const eni = this.networkInterfaces.get(networkInterfaceId);
    if (!eni) throw new AwsError("InvalidNetworkInterfaceID.NotFound", `The networkInterface ID '${networkInterfaceId}' does not exist`, 400);
    if (!this.instances.has(instanceId)) {
      throw new AwsError("InvalidInstanceID.NotFound", `The instance ID '${instanceId}' does not exist`, 400);
    }
    const attachmentId = genId("eni-attach-");
    eni.attachmentId = attachmentId;
    eni.instanceId = instanceId;
    eni.status = "in-use";
    return attachmentId;
  }

  detachNetworkInterface(attachmentId: string): void {
    for (const eni of this.networkInterfaces.values()) {
      if (eni.attachmentId === attachmentId) {
        eni.attachmentId = undefined;
        eni.instanceId = undefined;
        eni.status = "available";
        return;
      }
    }
    throw new AwsError("InvalidAttachmentID.NotFound", `The attachment ID '${attachmentId}' does not exist`, 400);
  }

  // --- VPC Endpoints ---

  createVpcEndpoint(params: {
    vpcId: string;
    serviceName: string;
    vpcEndpointType?: string;
    routeTableIds?: string[];
    subnetIds?: string[];
  }): VpcEndpoint {
    if (!this.vpcs.has(params.vpcId)) {
      throw new AwsError("InvalidVpcID.NotFound", `The vpc ID '${params.vpcId}' does not exist`, 400);
    }
    const vpceId = genId("vpce-");
    const vpce: VpcEndpoint = {
      vpcEndpointId: vpceId,
      vpcId: params.vpcId,
      serviceName: params.serviceName,
      vpcEndpointType: params.vpcEndpointType ?? "Gateway",
      state: "available",
      routeTableIds: params.routeTableIds ?? [],
      subnetIds: params.subnetIds ?? [],
      creationTimestamp: new Date().toISOString(),
      ownerId: this.accountId,
      tags: [],
    };
    this.vpcEndpoints.set(vpceId, vpce);
    return vpce;
  }

  describeVpcEndpoints(vpcEndpointIds?: string[]): VpcEndpoint[] {
    const all = this.vpcEndpoints.values();
    if (!vpcEndpointIds || vpcEndpointIds.length === 0) return all;
    const found = all.filter((e) => vpcEndpointIds.includes(e.vpcEndpointId));
    for (const id of vpcEndpointIds) {
      if (!found.some((e) => e.vpcEndpointId === id)) {
        throw new AwsError("InvalidVpcEndpointId.NotFound", `The VPC endpoint '${id}' does not exist`, 400);
      }
    }
    return found;
  }

  deleteVpcEndpoints(vpcEndpointIds: string[]): string[] {
    const deleted: string[] = [];
    for (const id of vpcEndpointIds) {
      if (this.vpcEndpoints.has(id)) {
        this.vpcEndpoints.delete(id);
        deleted.push(id);
      }
    }
    return deleted;
  }

  modifyVpcEndpoint(vpcEndpointId: string, addRouteTableIds?: string[], removeRouteTableIds?: string[], addSubnetIds?: string[], removeSubnetIds?: string[]): void {
    const vpce = this.vpcEndpoints.get(vpcEndpointId);
    if (!vpce) throw new AwsError("InvalidVpcEndpointId.NotFound", `The VPC endpoint '${vpcEndpointId}' does not exist`, 400);
    if (addRouteTableIds) vpce.routeTableIds.push(...addRouteTableIds);
    if (removeRouteTableIds) vpce.routeTableIds = vpce.routeTableIds.filter((id) => !removeRouteTableIds.includes(id));
    if (addSubnetIds) vpce.subnetIds.push(...addSubnetIds);
    if (removeSubnetIds) vpce.subnetIds = vpce.subnetIds.filter((id) => !removeSubnetIds.includes(id));
  }

  // --- Instance Types ---

  describeInstanceTypes(instanceTypes?: string[]): MockInstanceType[] {
    const all: MockInstanceType[] = [
      { instanceType: "t2.micro", vCpus: 1, memoryMiB: 1024, currentGeneration: true, supportedUsageClasses: ["on-demand", "spot"], supportedArchitectures: ["x86_64"], processorInfo: { sustainedClockSpeedInGhz: 2.3 }, networkPerformance: "Low to Moderate" },
      { instanceType: "t2.small", vCpus: 1, memoryMiB: 2048, currentGeneration: true, supportedUsageClasses: ["on-demand", "spot"], supportedArchitectures: ["x86_64"], processorInfo: { sustainedClockSpeedInGhz: 2.3 }, networkPerformance: "Low to Moderate" },
      { instanceType: "t2.medium", vCpus: 2, memoryMiB: 4096, currentGeneration: true, supportedUsageClasses: ["on-demand", "spot"], supportedArchitectures: ["x86_64"], processorInfo: { sustainedClockSpeedInGhz: 2.3 }, networkPerformance: "Low to Moderate" },
      { instanceType: "t3.micro", vCpus: 2, memoryMiB: 1024, currentGeneration: true, supportedUsageClasses: ["on-demand", "spot"], supportedArchitectures: ["x86_64"], processorInfo: { sustainedClockSpeedInGhz: 2.5 }, networkPerformance: "Up to 5 Gigabit" },
      { instanceType: "t3.small", vCpus: 2, memoryMiB: 2048, currentGeneration: true, supportedUsageClasses: ["on-demand", "spot"], supportedArchitectures: ["x86_64"], processorInfo: { sustainedClockSpeedInGhz: 2.5 }, networkPerformance: "Up to 5 Gigabit" },
      { instanceType: "t3.medium", vCpus: 2, memoryMiB: 4096, currentGeneration: true, supportedUsageClasses: ["on-demand", "spot"], supportedArchitectures: ["x86_64"], processorInfo: { sustainedClockSpeedInGhz: 2.5 }, networkPerformance: "Up to 5 Gigabit" },
      { instanceType: "t3.large", vCpus: 2, memoryMiB: 8192, currentGeneration: true, supportedUsageClasses: ["on-demand", "spot"], supportedArchitectures: ["x86_64"], processorInfo: { sustainedClockSpeedInGhz: 2.5 }, networkPerformance: "Up to 5 Gigabit" },
      { instanceType: "m5.large", vCpus: 2, memoryMiB: 8192, currentGeneration: true, supportedUsageClasses: ["on-demand", "spot"], supportedArchitectures: ["x86_64"], processorInfo: { sustainedClockSpeedInGhz: 3.1 }, networkPerformance: "Up to 10 Gigabit" },
      { instanceType: "m5.xlarge", vCpus: 4, memoryMiB: 16384, currentGeneration: true, supportedUsageClasses: ["on-demand", "spot"], supportedArchitectures: ["x86_64"], processorInfo: { sustainedClockSpeedInGhz: 3.1 }, networkPerformance: "Up to 10 Gigabit" },
      { instanceType: "c5.large", vCpus: 2, memoryMiB: 4096, currentGeneration: true, supportedUsageClasses: ["on-demand", "spot"], supportedArchitectures: ["x86_64"], processorInfo: { sustainedClockSpeedInGhz: 3.0 }, networkPerformance: "Up to 10 Gigabit" },
      { instanceType: "r5.large", vCpus: 2, memoryMiB: 16384, currentGeneration: true, supportedUsageClasses: ["on-demand", "spot"], supportedArchitectures: ["x86_64"], processorInfo: { sustainedClockSpeedInGhz: 3.1 }, networkPerformance: "Up to 10 Gigabit" },
    ];
    if (!instanceTypes || instanceTypes.length === 0) return all;
    return all.filter((it) => instanceTypes.includes(it.instanceType));
  }
}
