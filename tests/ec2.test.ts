import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  EC2Client,
  CreateVpcCommand,
  DescribeVpcsCommand,
  DeleteVpcCommand,
  ModifyVpcAttributeCommand,
  CreateSubnetCommand,
  DescribeSubnetsCommand,
  DeleteSubnetCommand,
  ModifySubnetAttributeCommand,
  CreateSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  DeleteSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  AuthorizeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
  RevokeSecurityGroupEgressCommand,
  CreateInternetGatewayCommand,
  DescribeInternetGatewaysCommand,
  DeleteInternetGatewayCommand,
  AttachInternetGatewayCommand,
  DetachInternetGatewayCommand,
  CreateRouteTableCommand,
  DescribeRouteTablesCommand,
  DeleteRouteTableCommand,
  CreateRouteCommand,
  DeleteRouteCommand,
  AssociateRouteTableCommand,
  DisassociateRouteTableCommand,
  CreateNatGatewayCommand,
  DescribeNatGatewaysCommand,
  DeleteNatGatewayCommand,
  AllocateAddressCommand,
  DescribeAddressesCommand,
  ReleaseAddressCommand,
  CreateTagsCommand,
  DescribeTagsCommand,
  DescribeAvailabilityZonesCommand,
  DescribeRegionsCommand,
  DescribeAccountAttributesCommand,
  RunInstancesCommand,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  DescribeInstanceStatusCommand,
  ModifyInstanceAttributeCommand,
  CreateKeyPairCommand,
  DescribeKeyPairsCommand,
  DeleteKeyPairCommand,
  ImportKeyPairCommand,
  CreateVolumeCommand,
  DescribeVolumesCommand,
  DeleteVolumeCommand,
  AttachVolumeCommand,
  DetachVolumeCommand,
  ModifyVolumeCommand,
  CreateImageCommand,
  DescribeImagesCommand,
  DeregisterImageCommand,
  CopyImageCommand,
  CreateNetworkInterfaceCommand,
  DescribeNetworkInterfacesCommand,
  DeleteNetworkInterfaceCommand,
  AttachNetworkInterfaceCommand,
  DetachNetworkInterfaceCommand,
  CreateVpcEndpointCommand,
  DescribeVpcEndpointsCommand,
  DeleteVpcEndpointsCommand,
  ModifyVpcEndpointCommand,
  DescribeInstanceTypesCommand,
} from "@aws-sdk/client-ec2";
import { startServer, stopServer, clientConfig } from "./helpers";

const ec2 = new EC2Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("EC2 - VPC Lifecycle", () => {
  let vpcId: string;

  test("CreateVpc", async () => {
    const res = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.0.0.0/16" }));
    expect(res.Vpc).toBeDefined();
    expect(res.Vpc!.VpcId).toMatch(/^vpc-/);
    expect(res.Vpc!.CidrBlock).toBe("10.0.0.0/16");
    expect(res.Vpc!.State).toBe("available");
    expect(res.Vpc!.IsDefault).toBe(false);
    expect(res.Vpc!.DhcpOptionsId).toMatch(/^dopt-/);
    expect(res.Vpc!.InstanceTenancy).toBe("default");
    vpcId = res.Vpc!.VpcId!;
  });

  test("DescribeVpcs", async () => {
    const res = await ec2.send(new DescribeVpcsCommand({ VpcIds: [vpcId] }));
    expect(res.Vpcs).toHaveLength(1);
    expect(res.Vpcs![0].VpcId).toBe(vpcId);
    expect(res.Vpcs![0].CidrBlock).toBe("10.0.0.0/16");
  });

  test("DescribeVpcs - all", async () => {
    const res = await ec2.send(new DescribeVpcsCommand({}));
    expect(res.Vpcs!.length).toBeGreaterThanOrEqual(1);
  });

  test("ModifyVpcAttribute - EnableDnsHostnames", async () => {
    await ec2.send(new ModifyVpcAttributeCommand({
      VpcId: vpcId,
      EnableDnsHostnames: { Value: true },
    }));
    // No error means success
  });

  test("DeleteVpc", async () => {
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
    const res = await ec2.send(new DescribeVpcsCommand({}));
    const found = res.Vpcs?.find((v) => v.VpcId === vpcId);
    expect(found).toBeUndefined();
  });
});

describe("EC2 - Subnet Lifecycle", () => {
  let vpcId: string;
  let subnetId: string;

  test("setup VPC", async () => {
    const res = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.1.0.0/16" }));
    vpcId = res.Vpc!.VpcId!;
  });

  test("CreateSubnet", async () => {
    const res = await ec2.send(new CreateSubnetCommand({
      VpcId: vpcId,
      CidrBlock: "10.1.1.0/24",
      AvailabilityZone: "us-east-1a",
    }));
    expect(res.Subnet).toBeDefined();
    expect(res.Subnet!.SubnetId).toMatch(/^subnet-/);
    expect(res.Subnet!.VpcId).toBe(vpcId);
    expect(res.Subnet!.CidrBlock).toBe("10.1.1.0/24");
    expect(res.Subnet!.State).toBe("available");
    expect(res.Subnet!.AvailabilityZone).toBe("us-east-1a");
    expect(res.Subnet!.AvailableIpAddressCount).toBe(251);
    subnetId = res.Subnet!.SubnetId!;
  });

  test("DescribeSubnets", async () => {
    const res = await ec2.send(new DescribeSubnetsCommand({ SubnetIds: [subnetId] }));
    expect(res.Subnets).toHaveLength(1);
    expect(res.Subnets![0].SubnetId).toBe(subnetId);
  });

  test("ModifySubnetAttribute - MapPublicIpOnLaunch", async () => {
    await ec2.send(new ModifySubnetAttributeCommand({
      SubnetId: subnetId,
      MapPublicIpOnLaunch: { Value: true },
    }));
    // No error means success
  });

  test("DeleteSubnet", async () => {
    await ec2.send(new DeleteSubnetCommand({ SubnetId: subnetId }));
    const res = await ec2.send(new DescribeSubnetsCommand({}));
    const found = res.Subnets?.find((s) => s.SubnetId === subnetId);
    expect(found).toBeUndefined();
  });

  test("cleanup VPC", async () => {
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});

describe("EC2 - Security Groups", () => {
  let vpcId: string;
  let sgId: string;

  test("setup VPC", async () => {
    const res = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.2.0.0/16" }));
    vpcId = res.Vpc!.VpcId!;
  });

  test("CreateSecurityGroup", async () => {
    const res = await ec2.send(new CreateSecurityGroupCommand({
      GroupName: "test-sg",
      Description: "Test security group",
      VpcId: vpcId,
    }));
    expect(res.GroupId).toMatch(/^sg-/);
    sgId = res.GroupId!;
  });

  test("DescribeSecurityGroups", async () => {
    const res = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [sgId] }));
    expect(res.SecurityGroups).toHaveLength(1);
    expect(res.SecurityGroups![0].GroupId).toBe(sgId);
    expect(res.SecurityGroups![0].GroupName).toBe("test-sg");
    expect(res.SecurityGroups![0].Description).toBe("Test security group");
    expect(res.SecurityGroups![0].VpcId).toBe(vpcId);
    // Default egress rule
    expect(res.SecurityGroups![0].IpPermissionsEgress!.length).toBeGreaterThanOrEqual(1);
  });

  test("AuthorizeSecurityGroupIngress", async () => {
    await ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: sgId,
      IpPermissions: [{
        IpProtocol: "tcp",
        FromPort: 443,
        ToPort: 443,
        IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "HTTPS" }],
      }],
    }));
    const res = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [sgId] }));
    const ingress = res.SecurityGroups![0].IpPermissions!;
    expect(ingress.length).toBeGreaterThanOrEqual(1);
    const httpsRule = ingress.find((r) => r.FromPort === 443);
    expect(httpsRule).toBeDefined();
    expect(httpsRule!.IpProtocol).toBe("tcp");
  });

  test("AuthorizeSecurityGroupEgress", async () => {
    await ec2.send(new AuthorizeSecurityGroupEgressCommand({
      GroupId: sgId,
      IpPermissions: [{
        IpProtocol: "tcp",
        FromPort: 5432,
        ToPort: 5432,
        IpRanges: [{ CidrIp: "10.0.0.0/8" }],
      }],
    }));
    const res = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [sgId] }));
    const egress = res.SecurityGroups![0].IpPermissionsEgress!;
    const pgRule = egress.find((r) => r.FromPort === 5432);
    expect(pgRule).toBeDefined();
  });

  test("RevokeSecurityGroupIngress", async () => {
    await ec2.send(new RevokeSecurityGroupIngressCommand({
      GroupId: sgId,
      IpPermissions: [{
        IpProtocol: "tcp",
        FromPort: 443,
        ToPort: 443,
        IpRanges: [{ CidrIp: "0.0.0.0/0" }],
      }],
    }));
    const res = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [sgId] }));
    const httpsRule = res.SecurityGroups![0].IpPermissions!.find((r) => r.FromPort === 443);
    expect(httpsRule).toBeUndefined();
  });

  test("RevokeSecurityGroupEgress", async () => {
    await ec2.send(new RevokeSecurityGroupEgressCommand({
      GroupId: sgId,
      IpPermissions: [{
        IpProtocol: "tcp",
        FromPort: 5432,
        ToPort: 5432,
        IpRanges: [{ CidrIp: "10.0.0.0/8" }],
      }],
    }));
    const res = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [sgId] }));
    const pgRule = res.SecurityGroups![0].IpPermissionsEgress!.find((r) => r.FromPort === 5432);
    expect(pgRule).toBeUndefined();
  });

  test("DeleteSecurityGroup", async () => {
    await ec2.send(new DeleteSecurityGroupCommand({ GroupId: sgId }));
  });

  test("cleanup VPC", async () => {
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});

describe("EC2 - Internet Gateway", () => {
  let vpcId: string;
  let igwId: string;

  test("setup VPC", async () => {
    const res = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.3.0.0/16" }));
    vpcId = res.Vpc!.VpcId!;
  });

  test("CreateInternetGateway", async () => {
    const res = await ec2.send(new CreateInternetGatewayCommand({}));
    expect(res.InternetGateway).toBeDefined();
    expect(res.InternetGateway!.InternetGatewayId).toMatch(/^igw-/);
    igwId = res.InternetGateway!.InternetGatewayId!;
  });

  test("AttachInternetGateway", async () => {
    await ec2.send(new AttachInternetGatewayCommand({
      InternetGatewayId: igwId,
      VpcId: vpcId,
    }));
    const res = await ec2.send(new DescribeInternetGatewaysCommand({
      InternetGatewayIds: [igwId],
    }));
    expect(res.InternetGateways![0].Attachments).toHaveLength(1);
    expect(res.InternetGateways![0].Attachments![0].VpcId).toBe(vpcId);
    expect(res.InternetGateways![0].Attachments![0].State).toBe("available");
  });

  test("DetachInternetGateway", async () => {
    await ec2.send(new DetachInternetGatewayCommand({
      InternetGatewayId: igwId,
      VpcId: vpcId,
    }));
    const res = await ec2.send(new DescribeInternetGatewaysCommand({
      InternetGatewayIds: [igwId],
    }));
    expect(res.InternetGateways![0].Attachments).toHaveLength(0);
  });

  test("DeleteInternetGateway", async () => {
    await ec2.send(new DeleteInternetGatewayCommand({ InternetGatewayId: igwId }));
  });

  test("cleanup VPC", async () => {
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});

describe("EC2 - Route Tables", () => {
  let vpcId: string;
  let rtbId: string;
  let subnetId: string;
  let igwId: string;
  let assocId: string;

  test("setup VPC + subnet + IGW", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.4.0.0/16" }));
    vpcId = vpcRes.Vpc!.VpcId!;
    const subnetRes = await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "10.4.1.0/24" }));
    subnetId = subnetRes.Subnet!.SubnetId!;
    const igwRes = await ec2.send(new CreateInternetGatewayCommand({}));
    igwId = igwRes.InternetGateway!.InternetGatewayId!;
    await ec2.send(new AttachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }));
  });

  test("CreateRouteTable", async () => {
    const res = await ec2.send(new CreateRouteTableCommand({ VpcId: vpcId }));
    expect(res.RouteTable).toBeDefined();
    expect(res.RouteTable!.RouteTableId).toMatch(/^rtb-/);
    expect(res.RouteTable!.VpcId).toBe(vpcId);
    // Should have a local route
    expect(res.RouteTable!.Routes!.length).toBeGreaterThanOrEqual(1);
    const localRoute = res.RouteTable!.Routes!.find((r) => r.GatewayId === "local");
    expect(localRoute).toBeDefined();
    expect(localRoute!.DestinationCidrBlock).toBe("10.4.0.0/16");
    rtbId = res.RouteTable!.RouteTableId!;
  });

  test("CreateRoute", async () => {
    await ec2.send(new CreateRouteCommand({
      RouteTableId: rtbId,
      DestinationCidrBlock: "0.0.0.0/0",
      GatewayId: igwId,
    }));
    const res = await ec2.send(new DescribeRouteTablesCommand({ RouteTableIds: [rtbId] }));
    const routes = res.RouteTables![0].Routes!;
    const defaultRoute = routes.find((r) => r.DestinationCidrBlock === "0.0.0.0/0");
    expect(defaultRoute).toBeDefined();
    expect(defaultRoute!.GatewayId).toBe(igwId);
  });

  test("AssociateRouteTable", async () => {
    const res = await ec2.send(new AssociateRouteTableCommand({
      RouteTableId: rtbId,
      SubnetId: subnetId,
    }));
    expect(res.AssociationId).toMatch(/^rtbassoc-/);
    assocId = res.AssociationId!;
  });

  test("DescribeRouteTables", async () => {
    const res = await ec2.send(new DescribeRouteTablesCommand({ RouteTableIds: [rtbId] }));
    expect(res.RouteTables).toHaveLength(1);
    expect(res.RouteTables![0].Associations!.length).toBeGreaterThanOrEqual(1);
    const assoc = res.RouteTables![0].Associations!.find((a) => a.RouteTableAssociationId === assocId);
    expect(assoc).toBeDefined();
    expect(assoc!.SubnetId).toBe(subnetId);
  });

  test("DisassociateRouteTable", async () => {
    await ec2.send(new DisassociateRouteTableCommand({ AssociationId: assocId }));
  });

  test("DeleteRoute", async () => {
    await ec2.send(new DeleteRouteCommand({
      RouteTableId: rtbId,
      DestinationCidrBlock: "0.0.0.0/0",
    }));
    const res = await ec2.send(new DescribeRouteTablesCommand({ RouteTableIds: [rtbId] }));
    const defaultRoute = res.RouteTables![0].Routes!.find((r) => r.DestinationCidrBlock === "0.0.0.0/0");
    expect(defaultRoute).toBeUndefined();
  });

  test("DeleteRouteTable", async () => {
    await ec2.send(new DeleteRouteTableCommand({ RouteTableId: rtbId }));
  });

  test("cleanup", async () => {
    await ec2.send(new DetachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }));
    await ec2.send(new DeleteInternetGatewayCommand({ InternetGatewayId: igwId }));
    await ec2.send(new DeleteSubnetCommand({ SubnetId: subnetId }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});

describe("EC2 - NAT Gateway & Elastic IPs", () => {
  let vpcId: string;
  let subnetId: string;
  let allocId: string;
  let natId: string;

  test("setup VPC + subnet", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.5.0.0/16" }));
    vpcId = vpcRes.Vpc!.VpcId!;
    const subnetRes = await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "10.5.1.0/24" }));
    subnetId = subnetRes.Subnet!.SubnetId!;
  });

  test("AllocateAddress", async () => {
    const res = await ec2.send(new AllocateAddressCommand({ Domain: "vpc" }));
    expect(res.AllocationId).toMatch(/^eipalloc-/);
    expect(res.PublicIp).toBeDefined();
    expect(res.Domain).toBe("vpc");
    allocId = res.AllocationId!;
  });

  test("DescribeAddresses", async () => {
    const res = await ec2.send(new DescribeAddressesCommand({ AllocationIds: [allocId] }));
    expect(res.Addresses).toHaveLength(1);
    expect(res.Addresses![0].AllocationId).toBe(allocId);
  });

  test("CreateNatGateway", async () => {
    const res = await ec2.send(new CreateNatGatewayCommand({
      SubnetId: subnetId,
      AllocationId: allocId,
    }));
    expect(res.NatGateway).toBeDefined();
    expect(res.NatGateway!.NatGatewayId).toMatch(/^nat-/);
    expect(res.NatGateway!.SubnetId).toBe(subnetId);
    expect(res.NatGateway!.State).toBe("available");
    natId = res.NatGateway!.NatGatewayId!;
  });

  test("DescribeNatGateways", async () => {
    const res = await ec2.send(new DescribeNatGatewaysCommand({ NatGatewayIds: [natId] }));
    expect(res.NatGateways).toHaveLength(1);
    expect(res.NatGateways![0].NatGatewayId).toBe(natId);
    expect(res.NatGateways![0].VpcId).toBe(vpcId);
  });

  test("DeleteNatGateway", async () => {
    const res = await ec2.send(new DeleteNatGatewayCommand({ NatGatewayId: natId }));
    expect(res.NatGatewayId).toBe(natId);
  });

  test("ReleaseAddress", async () => {
    await ec2.send(new ReleaseAddressCommand({ AllocationId: allocId }));
    const res = await ec2.send(new DescribeAddressesCommand({}));
    const found = res.Addresses?.find((a) => a.AllocationId === allocId);
    expect(found).toBeUndefined();
  });

  test("cleanup", async () => {
    await ec2.send(new DeleteSubnetCommand({ SubnetId: subnetId }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});

describe("EC2 - Tags", () => {
  let vpcId: string;
  let subnetId: string;

  test("setup VPC + subnet", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.6.0.0/16" }));
    vpcId = vpcRes.Vpc!.VpcId!;
    const subnetRes = await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "10.6.1.0/24" }));
    subnetId = subnetRes.Subnet!.SubnetId!;
  });

  test("CreateTags on VPC", async () => {
    await ec2.send(new CreateTagsCommand({
      Resources: [vpcId],
      Tags: [
        { Key: "Name", Value: "test-vpc" },
        { Key: "Environment", Value: "test" },
      ],
    }));
  });

  test("CreateTags on Subnet", async () => {
    await ec2.send(new CreateTagsCommand({
      Resources: [subnetId],
      Tags: [{ Key: "Name", Value: "test-subnet" }],
    }));
  });

  test("DescribeTags - all", async () => {
    const res = await ec2.send(new DescribeTagsCommand({}));
    expect(res.Tags!.length).toBeGreaterThanOrEqual(3);
  });

  test("DescribeTags - filter by resource-id", async () => {
    const res = await ec2.send(new DescribeTagsCommand({
      Filters: [{ Name: "resource-id", Values: [vpcId] }],
    }));
    expect(res.Tags).toHaveLength(2);
    const names = res.Tags!.map((t) => t.Key).sort();
    expect(names).toEqual(["Environment", "Name"]);
  });

  test("Tags reflected on DescribeVpcs", async () => {
    const res = await ec2.send(new DescribeVpcsCommand({ VpcIds: [vpcId] }));
    const tags = res.Vpcs![0].Tags;
    expect(tags).toBeDefined();
    expect(tags!.length).toBe(2);
    const nameTag = tags!.find((t) => t.Key === "Name");
    expect(nameTag?.Value).toBe("test-vpc");
  });

  test("cleanup", async () => {
    await ec2.send(new DeleteSubnetCommand({ SubnetId: subnetId }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});

describe("EC2 - Full VPC Architecture", () => {
  let vpcId: string;
  let publicSubnetId: string;
  let privateSubnetId: string;
  let igwId: string;
  let publicRtbId: string;
  let sgId: string;
  let eipAllocId: string;
  let natId: string;
  let privateRtbId: string;

  test("Create VPC", async () => {
    const res = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.10.0.0/16" }));
    vpcId = res.Vpc!.VpcId!;
    await ec2.send(new ModifyVpcAttributeCommand({
      VpcId: vpcId,
      EnableDnsHostnames: { Value: true },
    }));
    await ec2.send(new ModifyVpcAttributeCommand({
      VpcId: vpcId,
      EnableDnsSupport: { Value: true },
    }));
  });

  test("Create public subnet", async () => {
    const res = await ec2.send(new CreateSubnetCommand({
      VpcId: vpcId,
      CidrBlock: "10.10.1.0/24",
      AvailabilityZone: "us-east-1a",
    }));
    publicSubnetId = res.Subnet!.SubnetId!;
    await ec2.send(new ModifySubnetAttributeCommand({
      SubnetId: publicSubnetId,
      MapPublicIpOnLaunch: { Value: true },
    }));
  });

  test("Create private subnet", async () => {
    const res = await ec2.send(new CreateSubnetCommand({
      VpcId: vpcId,
      CidrBlock: "10.10.2.0/24",
      AvailabilityZone: "us-east-1b",
    }));
    privateSubnetId = res.Subnet!.SubnetId!;
  });

  test("Create and attach internet gateway", async () => {
    const igwRes = await ec2.send(new CreateInternetGatewayCommand({}));
    igwId = igwRes.InternetGateway!.InternetGatewayId!;
    await ec2.send(new AttachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }));
  });

  test("Create public route table with default route", async () => {
    const rtbRes = await ec2.send(new CreateRouteTableCommand({ VpcId: vpcId }));
    publicRtbId = rtbRes.RouteTable!.RouteTableId!;
    await ec2.send(new CreateRouteCommand({
      RouteTableId: publicRtbId,
      DestinationCidrBlock: "0.0.0.0/0",
      GatewayId: igwId,
    }));
    await ec2.send(new AssociateRouteTableCommand({
      RouteTableId: publicRtbId,
      SubnetId: publicSubnetId,
    }));
  });

  test("Create NAT gateway in public subnet", async () => {
    const eipRes = await ec2.send(new AllocateAddressCommand({ Domain: "vpc" }));
    eipAllocId = eipRes.AllocationId!;
    const natRes = await ec2.send(new CreateNatGatewayCommand({
      SubnetId: publicSubnetId,
      AllocationId: eipAllocId,
    }));
    natId = natRes.NatGateway!.NatGatewayId!;
  });

  test("Create private route table with NAT gateway route", async () => {
    const rtbRes = await ec2.send(new CreateRouteTableCommand({ VpcId: vpcId }));
    privateRtbId = rtbRes.RouteTable!.RouteTableId!;
    await ec2.send(new CreateRouteCommand({
      RouteTableId: privateRtbId,
      DestinationCidrBlock: "0.0.0.0/0",
      NatGatewayId: natId,
    }));
    await ec2.send(new AssociateRouteTableCommand({
      RouteTableId: privateRtbId,
      SubnetId: privateSubnetId,
    }));
  });

  test("Create security group with rules", async () => {
    const sgRes = await ec2.send(new CreateSecurityGroupCommand({
      GroupName: "web-sg",
      Description: "Web server security group",
      VpcId: vpcId,
    }));
    sgId = sgRes.GroupId!;
    await ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: sgId,
      IpPermissions: [
        { IpProtocol: "tcp", FromPort: 80, ToPort: 80, IpRanges: [{ CidrIp: "0.0.0.0/0" }] },
        { IpProtocol: "tcp", FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: "0.0.0.0/0" }] },
      ],
    }));
  });

  test("Tag all resources", async () => {
    await ec2.send(new CreateTagsCommand({
      Resources: [vpcId, publicSubnetId, privateSubnetId, igwId, publicRtbId, privateRtbId, sgId],
      Tags: [
        { Key: "Project", Value: "tinstack-test" },
        { Key: "ManagedBy", Value: "test" },
      ],
    }));
  });

  test("Verify full architecture", async () => {
    // Verify VPC
    const vpcRes = await ec2.send(new DescribeVpcsCommand({ VpcIds: [vpcId] }));
    expect(vpcRes.Vpcs).toHaveLength(1);

    // Verify subnets
    const subnetRes = await ec2.send(new DescribeSubnetsCommand({ SubnetIds: [publicSubnetId, privateSubnetId] }));
    expect(subnetRes.Subnets).toHaveLength(2);

    // Verify IGW attached
    const igwRes = await ec2.send(new DescribeInternetGatewaysCommand({ InternetGatewayIds: [igwId] }));
    expect(igwRes.InternetGateways![0].Attachments![0].VpcId).toBe(vpcId);

    // Verify route tables
    const rtbRes = await ec2.send(new DescribeRouteTablesCommand({ RouteTableIds: [publicRtbId, privateRtbId] }));
    expect(rtbRes.RouteTables).toHaveLength(2);

    // Verify security group
    const sgRes = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [sgId] }));
    expect(sgRes.SecurityGroups![0].IpPermissions!.length).toBe(2);

    // Verify NAT gateway
    const natRes = await ec2.send(new DescribeNatGatewaysCommand({ NatGatewayIds: [natId] }));
    expect(natRes.NatGateways![0].State).toBe("available");

    // Verify tags
    const tagsRes = await ec2.send(new DescribeTagsCommand({
      Filters: [{ Name: "key", Values: ["Project"] }],
    }));
    expect(tagsRes.Tags!.length).toBeGreaterThanOrEqual(7);
  });

  test("Teardown full architecture", async () => {
    // Delete in reverse dependency order
    await ec2.send(new DeleteSecurityGroupCommand({ GroupId: sgId }));
    await ec2.send(new DeleteNatGatewayCommand({ NatGatewayId: natId }));
    await ec2.send(new ReleaseAddressCommand({ AllocationId: eipAllocId }));
    await ec2.send(new DeleteRouteTableCommand({ RouteTableId: privateRtbId }));
    await ec2.send(new DeleteRouteTableCommand({ RouteTableId: publicRtbId }));
    await ec2.send(new DetachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }));
    await ec2.send(new DeleteInternetGatewayCommand({ InternetGatewayId: igwId }));
    await ec2.send(new DeleteSubnetCommand({ SubnetId: publicSubnetId }));
    await ec2.send(new DeleteSubnetCommand({ SubnetId: privateSubnetId }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});

describe("EC2 - Availability Zones & Regions", () => {
  test("DescribeAvailabilityZones", async () => {
    const res = await ec2.send(new DescribeAvailabilityZonesCommand({}));
    expect(res.AvailabilityZones).toBeDefined();
    expect(res.AvailabilityZones!.length).toBeGreaterThanOrEqual(3);
    expect(res.AvailabilityZones![0].ZoneName).toMatch(/^us-east-1/);
    expect(res.AvailabilityZones![0].State).toBe("available");
    expect(res.AvailabilityZones![0].RegionName).toBe("us-east-1");
  });

  test("DescribeRegions", async () => {
    const res = await ec2.send(new DescribeRegionsCommand({}));
    expect(res.Regions).toBeDefined();
    expect(res.Regions!.length).toBeGreaterThanOrEqual(10);
    const usEast1 = res.Regions!.find((r) => r.RegionName === "us-east-1");
    expect(usEast1).toBeDefined();
    expect(usEast1!.Endpoint).toContain("ec2.us-east-1");
  });

  test("DescribeAccountAttributes", async () => {
    const res = await ec2.send(new DescribeAccountAttributesCommand({}));
    expect(res.AccountAttributes).toBeDefined();
    expect(res.AccountAttributes!.length).toBeGreaterThanOrEqual(1);
    const maxInstances = res.AccountAttributes!.find((a) => a.AttributeName === "max-instances");
    expect(maxInstances).toBeDefined();
    expect(maxInstances!.AttributeValues![0].AttributeValue).toBe("20");
  });
});

describe("EC2 - Instance Lifecycle", () => {
  let instanceId: string;

  test("RunInstances", async () => {
    const res = await ec2.send(new RunInstancesCommand({
      ImageId: "ami-12345678",
      InstanceType: "t2.micro",
      MinCount: 1,
      MaxCount: 1,
    }));
    expect(res.Instances).toBeDefined();
    expect(res.Instances).toHaveLength(1);
    expect(res.Instances![0].InstanceId).toMatch(/^i-/);
    expect(res.Instances![0].ImageId).toBe("ami-12345678");
    expect(res.Instances![0].InstanceType).toBe("t2.micro");
    expect(res.Instances![0].State!.Name).toBe("running");
    expect(res.Instances![0].State!.Code).toBe(16);
    expect(res.Instances![0].PrivateIpAddress).toBeDefined();
    expect(res.Instances![0].LaunchTime).toBeDefined();
    expect(res.ReservationId).toMatch(/^r-/);
    instanceId = res.Instances![0].InstanceId!;
  });

  test("RunInstances - multiple instances", async () => {
    const res = await ec2.send(new RunInstancesCommand({
      ImageId: "ami-multi",
      InstanceType: "t3.small",
      MinCount: 2,
      MaxCount: 3,
    }));
    expect(res.Instances!.length).toBe(3);
    const ids = new Set(res.Instances!.map((i) => i.InstanceId));
    expect(ids.size).toBe(3);
    // Cleanup
    await ec2.send(new TerminateInstancesCommand({
      InstanceIds: res.Instances!.map((i) => i.InstanceId!),
    }));
  });

  test("DescribeInstances - specific instance", async () => {
    const res = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
    expect(res.Reservations).toBeDefined();
    expect(res.Reservations!.length).toBe(1);
    expect(res.Reservations![0].Instances).toHaveLength(1);
    expect(res.Reservations![0].Instances![0].InstanceId).toBe(instanceId);
    expect(res.Reservations![0].Instances![0].State!.Name).toBe("running");
    expect(res.Reservations![0].ReservationId).toMatch(/^r-/);
  });

  test("DescribeInstances - all", async () => {
    const res = await ec2.send(new DescribeInstancesCommand({}));
    expect(res.Reservations).toBeDefined();
    expect(res.Reservations!.length).toBeGreaterThanOrEqual(1);
  });

  test("StopInstances", async () => {
    const res = await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
    expect(res.StoppingInstances).toBeDefined();
    expect(res.StoppingInstances).toHaveLength(1);
    expect(res.StoppingInstances![0].InstanceId).toBe(instanceId);
    expect(res.StoppingInstances![0].PreviousState!.Name).toBe("running");
    expect(res.StoppingInstances![0].CurrentState!.Name).toBe("stopped");
    expect(res.StoppingInstances![0].CurrentState!.Code).toBe(80);
  });

  test("StartInstances", async () => {
    const res = await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
    expect(res.StartingInstances).toBeDefined();
    expect(res.StartingInstances).toHaveLength(1);
    expect(res.StartingInstances![0].InstanceId).toBe(instanceId);
    expect(res.StartingInstances![0].PreviousState!.Name).toBe("stopped");
    expect(res.StartingInstances![0].CurrentState!.Name).toBe("running");
    expect(res.StartingInstances![0].CurrentState!.Code).toBe(16);
  });

  test("RebootInstances", async () => {
    // RebootInstances just returns success
    await ec2.send(new RebootInstancesCommand({ InstanceIds: [instanceId] }));
    // Verify instance is still running
    const res = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
    expect(res.Reservations![0].Instances![0].State!.Name).toBe("running");
  });

  test("DescribeInstanceStatus", async () => {
    const res = await ec2.send(new DescribeInstanceStatusCommand({ InstanceIds: [instanceId] }));
    expect(res.InstanceStatuses).toBeDefined();
    expect(res.InstanceStatuses).toHaveLength(1);
    expect(res.InstanceStatuses![0].InstanceId).toBe(instanceId);
    expect(res.InstanceStatuses![0].InstanceState!.Name).toBe("running");
    expect(res.InstanceStatuses![0].SystemStatus!.Status).toBe("ok");
    expect(res.InstanceStatuses![0].InstanceStatus!.Status).toBe("ok");
  });

  test("ModifyInstanceAttribute - change instance type", async () => {
    // Must stop first
    await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
    await ec2.send(new ModifyInstanceAttributeCommand({
      InstanceId: instanceId,
      InstanceType: { Value: "t3.large" },
    }));
    const res = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
    expect(res.Reservations![0].Instances![0].InstanceType).toBe("t3.large");
    // Start it back
    await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
  });

  test("TerminateInstances", async () => {
    const res = await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
    expect(res.TerminatingInstances).toBeDefined();
    expect(res.TerminatingInstances).toHaveLength(1);
    expect(res.TerminatingInstances![0].InstanceId).toBe(instanceId);
    expect(res.TerminatingInstances![0].PreviousState!.Name).toBe("running");
    expect(res.TerminatingInstances![0].CurrentState!.Name).toBe("terminated");
    expect(res.TerminatingInstances![0].CurrentState!.Code).toBe(48);
  });

  test("DescribeInstances - terminated excluded from general list", async () => {
    const res = await ec2.send(new DescribeInstancesCommand({}));
    const allInstances = res.Reservations?.flatMap((r) => r.Instances ?? []) ?? [];
    const found = allInstances.find((i) => i.InstanceId === instanceId);
    expect(found).toBeUndefined();
  });
});

describe("EC2 - Instances with VPC/Subnet/SG", () => {
  let vpcId: string;
  let subnetId: string;
  let sgId: string;
  let instanceId: string;

  test("setup VPC + subnet + SG", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.20.0.0/16" }));
    vpcId = vpcRes.Vpc!.VpcId!;
    const subnetRes = await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "10.20.1.0/24" }));
    subnetId = subnetRes.Subnet!.SubnetId!;
    const sgRes = await ec2.send(new CreateSecurityGroupCommand({
      GroupName: "instance-sg",
      Description: "SG for instance test",
      VpcId: vpcId,
    }));
    sgId = sgRes.GroupId!;
  });

  test("RunInstances with subnet and security group", async () => {
    const res = await ec2.send(new RunInstancesCommand({
      ImageId: "ami-vpc-test",
      InstanceType: "t3.medium",
      MinCount: 1,
      MaxCount: 1,
      SubnetId: subnetId,
      SecurityGroupIds: [sgId],
      TagSpecifications: [{
        ResourceType: "instance",
        Tags: [{ Key: "Name", Value: "test-instance" }],
      }],
    }));
    expect(res.Instances).toHaveLength(1);
    const inst = res.Instances![0];
    expect(inst.SubnetId).toBe(subnetId);
    expect(inst.VpcId).toBe(vpcId);
    expect(inst.SecurityGroups).toHaveLength(1);
    expect(inst.SecurityGroups![0].GroupId).toBe(sgId);
    expect(inst.Tags).toHaveLength(1);
    expect(inst.Tags![0].Key).toBe("Name");
    expect(inst.Tags![0].Value).toBe("test-instance");
    instanceId = inst.InstanceId!;
  });

  test("cleanup", async () => {
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
    await ec2.send(new DeleteSecurityGroupCommand({ GroupId: sgId }));
    await ec2.send(new DeleteSubnetCommand({ SubnetId: subnetId }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});

describe("EC2 - Key Pairs", () => {
  let keyName: string;
  let keyPairId: string;

  test("CreateKeyPair", async () => {
    keyName = "test-keypair-" + Date.now();
    const res = await ec2.send(new CreateKeyPairCommand({ KeyName: keyName }));
    expect(res.KeyName).toBe(keyName);
    expect(res.KeyPairId).toMatch(/^key-/);
    expect(res.KeyFingerprint).toBeDefined();
    expect(res.KeyMaterial).toBeDefined();
    expect(res.KeyMaterial).toContain("BEGIN RSA PRIVATE KEY");
    keyPairId = res.KeyPairId!;
  });

  test("DescribeKeyPairs - all", async () => {
    const res = await ec2.send(new DescribeKeyPairsCommand({}));
    expect(res.KeyPairs).toBeDefined();
    expect(res.KeyPairs!.length).toBeGreaterThanOrEqual(1);
    const found = res.KeyPairs!.find((kp) => kp.KeyName === keyName);
    expect(found).toBeDefined();
    expect(found!.KeyPairId).toBe(keyPairId);
  });

  test("DescribeKeyPairs - by name", async () => {
    const res = await ec2.send(new DescribeKeyPairsCommand({ KeyNames: [keyName] }));
    expect(res.KeyPairs).toHaveLength(1);
    expect(res.KeyPairs![0].KeyName).toBe(keyName);
  });

  test("CreateKeyPair - duplicate fails", async () => {
    try {
      await ec2.send(new CreateKeyPairCommand({ KeyName: keyName }));
      expect(true).toBe(false); // Should not reach here
    } catch (e: any) {
      expect(e.Code || e.name).toContain("InvalidKeyPair.Duplicate");
    }
  });

  test("DeleteKeyPair", async () => {
    await ec2.send(new DeleteKeyPairCommand({ KeyName: keyName }));
    const res = await ec2.send(new DescribeKeyPairsCommand({}));
    const found = res.KeyPairs!.find((kp) => kp.KeyName === keyName);
    expect(found).toBeUndefined();
  });

  test("ImportKeyPair", async () => {
    const importName = "imported-key-" + Date.now();
    const publicKey = Buffer.from("ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ mock-key").toString("base64");
    const res = await ec2.send(new ImportKeyPairCommand({
      KeyName: importName,
      PublicKeyMaterial: new Uint8Array(Buffer.from(publicKey, "base64")),
    }));
    expect(res.KeyName).toBe(importName);
    expect(res.KeyPairId).toMatch(/^key-/);
    expect(res.KeyFingerprint).toBeDefined();
    // Cleanup
    await ec2.send(new DeleteKeyPairCommand({ KeyName: importName }));
  });
});

describe("EC2 - EBS Volumes", () => {
  let volumeId: string;
  let instanceId: string;

  test("CreateVolume", async () => {
    const res = await ec2.send(new CreateVolumeCommand({
      Size: 20,
      AvailabilityZone: "us-east-1a",
      VolumeType: "gp3",
      Encrypted: true,
    }));
    expect(res.VolumeId).toMatch(/^vol-/);
    expect(res.Size).toBe(20);
    expect(res.AvailabilityZone).toBe("us-east-1a");
    expect(res.VolumeType).toBe("gp3");
    expect(res.State).toBe("available");
    expect(res.Encrypted).toBe(true);
    expect(res.CreateTime).toBeDefined();
    volumeId = res.VolumeId!;
  });

  test("DescribeVolumes - by id", async () => {
    const res = await ec2.send(new DescribeVolumesCommand({ VolumeIds: [volumeId] }));
    expect(res.Volumes).toHaveLength(1);
    expect(res.Volumes![0].VolumeId).toBe(volumeId);
    expect(res.Volumes![0].Size).toBe(20);
    expect(res.Volumes![0].VolumeType).toBe("gp3");
  });

  test("DescribeVolumes - all", async () => {
    const res = await ec2.send(new DescribeVolumesCommand({}));
    expect(res.Volumes!.length).toBeGreaterThanOrEqual(1);
  });

  test("ModifyVolume - resize", async () => {
    const res = await ec2.send(new ModifyVolumeCommand({
      VolumeId: volumeId,
      Size: 50,
      VolumeType: "io2",
    }));
    expect(res.VolumeModification).toBeDefined();
    expect(res.VolumeModification!.VolumeId).toBe(volumeId);
    expect(res.VolumeModification!.TargetSize).toBe(50);
    expect(res.VolumeModification!.TargetVolumeType).toBe("io2");
    // Verify the change persisted
    const desc = await ec2.send(new DescribeVolumesCommand({ VolumeIds: [volumeId] }));
    expect(desc.Volumes![0].Size).toBe(50);
    expect(desc.Volumes![0].VolumeType).toBe("io2");
  });

  test("AttachVolume + DetachVolume", async () => {
    // Create an instance to attach to
    const instRes = await ec2.send(new RunInstancesCommand({
      ImageId: "ami-vol-test",
      InstanceType: "t2.micro",
      MinCount: 1,
      MaxCount: 1,
    }));
    instanceId = instRes.Instances![0].InstanceId!;

    // Attach
    const attachRes = await ec2.send(new AttachVolumeCommand({
      VolumeId: volumeId,
      InstanceId: instanceId,
      Device: "/dev/sdf",
    }));
    expect(attachRes.InstanceId).toBe(instanceId);
    expect(attachRes.Device).toBe("/dev/sdf");
    expect(attachRes.State).toBe("attached");

    // Verify in-use
    const descAttached = await ec2.send(new DescribeVolumesCommand({ VolumeIds: [volumeId] }));
    expect(descAttached.Volumes![0].State).toBe("in-use");
    expect(descAttached.Volumes![0].Attachments).toHaveLength(1);
    expect(descAttached.Volumes![0].Attachments![0].InstanceId).toBe(instanceId);

    // Cannot delete while attached
    try {
      await ec2.send(new DeleteVolumeCommand({ VolumeId: volumeId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.Code || e.name).toContain("VolumeInUse");
    }

    // Detach
    const detachRes = await ec2.send(new DetachVolumeCommand({ VolumeId: volumeId }));
    expect(detachRes.State).toBe("detached");

    // Verify available again
    const descDetached = await ec2.send(new DescribeVolumesCommand({ VolumeIds: [volumeId] }));
    expect(descDetached.Volumes![0].State).toBe("available");
    expect(descDetached.Volumes![0].Attachments).toHaveLength(0);
  });

  test("DeleteVolume", async () => {
    await ec2.send(new DeleteVolumeCommand({ VolumeId: volumeId }));
    const res = await ec2.send(new DescribeVolumesCommand({}));
    const found = res.Volumes?.find((v) => v.VolumeId === volumeId);
    expect(found).toBeUndefined();
  });

  test("cleanup instance", async () => {
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
  });
});

describe("EC2 - AMIs", () => {
  let imageId: string;
  let instanceId: string;

  test("setup instance", async () => {
    const res = await ec2.send(new RunInstancesCommand({
      ImageId: "ami-source",
      InstanceType: "t2.micro",
      MinCount: 1,
      MaxCount: 1,
    }));
    instanceId = res.Instances![0].InstanceId!;
  });

  test("CreateImage", async () => {
    const res = await ec2.send(new CreateImageCommand({
      InstanceId: instanceId,
      Name: "test-ami",
      Description: "Test AMI from instance",
    }));
    expect(res.ImageId).toMatch(/^ami-/);
    imageId = res.ImageId!;
  });

  test("DescribeImages - by id", async () => {
    const res = await ec2.send(new DescribeImagesCommand({ ImageIds: [imageId] }));
    expect(res.Images).toHaveLength(1);
    expect(res.Images![0].ImageId).toBe(imageId);
    expect(res.Images![0].Name).toBe("test-ami");
    expect(res.Images![0].Description).toBe("Test AMI from instance");
    expect(res.Images![0].State).toBe("available");
    expect(res.Images![0].Architecture).toBe("x86_64");
    expect(res.Images![0].RootDeviceType).toBe("ebs");
    expect(res.Images![0].VirtualizationType).toBe("hvm");
  });

  test("DescribeImages - self owner", async () => {
    const res = await ec2.send(new DescribeImagesCommand({ Owners: ["self"] }));
    expect(res.Images!.length).toBeGreaterThanOrEqual(1);
    const found = res.Images!.find((i) => i.ImageId === imageId);
    expect(found).toBeDefined();
  });

  test("CopyImage", async () => {
    const res = await ec2.send(new CopyImageCommand({
      SourceImageId: imageId,
      SourceRegion: "us-east-1",
      Name: "copied-ami",
      Description: "Copy of test AMI",
    }));
    expect(res.ImageId).toMatch(/^ami-/);
    expect(res.ImageId).not.toBe(imageId);
    // Verify copy exists
    const desc = await ec2.send(new DescribeImagesCommand({ ImageIds: [res.ImageId!] }));
    expect(desc.Images![0].Name).toBe("copied-ami");
    expect(desc.Images![0].Description).toBe("Copy of test AMI");
    // Cleanup copy
    await ec2.send(new DeregisterImageCommand({ ImageId: res.ImageId! }));
  });

  test("DeregisterImage", async () => {
    await ec2.send(new DeregisterImageCommand({ ImageId: imageId }));
    const res = await ec2.send(new DescribeImagesCommand({}));
    const found = res.Images?.find((i) => i.ImageId === imageId);
    expect(found).toBeUndefined();
  });

  test("cleanup instance", async () => {
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
  });
});

describe("EC2 - Network Interfaces", () => {
  let vpcId: string;
  let subnetId: string;
  let eniId: string;
  let instanceId: string;
  let attachmentId: string;

  test("setup VPC + subnet + instance", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.30.0.0/16" }));
    vpcId = vpcRes.Vpc!.VpcId!;
    const subnetRes = await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "10.30.1.0/24" }));
    subnetId = subnetRes.Subnet!.SubnetId!;
    const instRes = await ec2.send(new RunInstancesCommand({
      ImageId: "ami-eni-test",
      InstanceType: "t2.micro",
      MinCount: 1,
      MaxCount: 1,
      SubnetId: subnetId,
    }));
    instanceId = instRes.Instances![0].InstanceId!;
  });

  test("CreateNetworkInterface", async () => {
    const res = await ec2.send(new CreateNetworkInterfaceCommand({
      SubnetId: subnetId,
      Description: "Test ENI",
    }));
    expect(res.NetworkInterface).toBeDefined();
    expect(res.NetworkInterface!.NetworkInterfaceId).toMatch(/^eni-/);
    expect(res.NetworkInterface!.SubnetId).toBe(subnetId);
    expect(res.NetworkInterface!.VpcId).toBe(vpcId);
    expect(res.NetworkInterface!.Description).toBe("Test ENI");
    expect(res.NetworkInterface!.Status).toBe("available");
    expect(res.NetworkInterface!.PrivateIpAddress).toBeDefined();
    eniId = res.NetworkInterface!.NetworkInterfaceId!;
  });

  test("DescribeNetworkInterfaces", async () => {
    const res = await ec2.send(new DescribeNetworkInterfacesCommand({
      NetworkInterfaceIds: [eniId],
    }));
    expect(res.NetworkInterfaces).toHaveLength(1);
    expect(res.NetworkInterfaces![0].NetworkInterfaceId).toBe(eniId);
  });

  test("AttachNetworkInterface", async () => {
    const res = await ec2.send(new AttachNetworkInterfaceCommand({
      NetworkInterfaceId: eniId,
      InstanceId: instanceId,
      DeviceIndex: 1,
    }));
    expect(res.AttachmentId).toMatch(/^eni-attach-/);
    attachmentId = res.AttachmentId!;

    // Verify in-use
    const desc = await ec2.send(new DescribeNetworkInterfacesCommand({
      NetworkInterfaceIds: [eniId],
    }));
    expect(desc.NetworkInterfaces![0].Status).toBe("in-use");

    // Cannot delete while attached
    try {
      await ec2.send(new DeleteNetworkInterfaceCommand({ NetworkInterfaceId: eniId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.Code || e.name).toContain("InvalidParameterValue");
    }
  });

  test("DetachNetworkInterface", async () => {
    await ec2.send(new DetachNetworkInterfaceCommand({
      AttachmentId: attachmentId,
    }));
    const desc = await ec2.send(new DescribeNetworkInterfacesCommand({
      NetworkInterfaceIds: [eniId],
    }));
    expect(desc.NetworkInterfaces![0].Status).toBe("available");
  });

  test("DeleteNetworkInterface", async () => {
    await ec2.send(new DeleteNetworkInterfaceCommand({ NetworkInterfaceId: eniId }));
    const res = await ec2.send(new DescribeNetworkInterfacesCommand({}));
    const found = res.NetworkInterfaces?.find((e) => e.NetworkInterfaceId === eniId);
    expect(found).toBeUndefined();
  });

  test("cleanup", async () => {
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
    await ec2.send(new DeleteSubnetCommand({ SubnetId: subnetId }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});

describe("EC2 - VPC Endpoints", () => {
  let vpcId: string;
  let rtbId: string;
  let vpceId: string;

  test("setup VPC + route table", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.40.0.0/16" }));
    vpcId = vpcRes.Vpc!.VpcId!;
    const rtbRes = await ec2.send(new CreateRouteTableCommand({ VpcId: vpcId }));
    rtbId = rtbRes.RouteTable!.RouteTableId!;
  });

  test("CreateVpcEndpoint - Gateway", async () => {
    const res = await ec2.send(new CreateVpcEndpointCommand({
      VpcId: vpcId,
      ServiceName: "com.amazonaws.us-east-1.s3",
      VpcEndpointType: "Gateway",
      RouteTableIds: [rtbId],
    }));
    expect(res.VpcEndpoint).toBeDefined();
    expect(res.VpcEndpoint!.VpcEndpointId).toMatch(/^vpce-/);
    expect(res.VpcEndpoint!.VpcId).toBe(vpcId);
    expect(res.VpcEndpoint!.ServiceName).toBe("com.amazonaws.us-east-1.s3");
    expect(res.VpcEndpoint!.VpcEndpointType).toBe("Gateway");
    expect(res.VpcEndpoint!.State).toBe("available");
    vpceId = res.VpcEndpoint!.VpcEndpointId!;
  });

  test("DescribeVpcEndpoints", async () => {
    const res = await ec2.send(new DescribeVpcEndpointsCommand({
      VpcEndpointIds: [vpceId],
    }));
    expect(res.VpcEndpoints).toHaveLength(1);
    expect(res.VpcEndpoints![0].VpcEndpointId).toBe(vpceId);
    expect(res.VpcEndpoints![0].ServiceName).toBe("com.amazonaws.us-east-1.s3");
  });

  test("ModifyVpcEndpoint - add/remove route tables", async () => {
    // Create a second route table
    const rtb2Res = await ec2.send(new CreateRouteTableCommand({ VpcId: vpcId }));
    const rtb2Id = rtb2Res.RouteTable!.RouteTableId!;

    await ec2.send(new ModifyVpcEndpointCommand({
      VpcEndpointId: vpceId,
      AddRouteTableIds: [rtb2Id],
    }));

    const desc = await ec2.send(new DescribeVpcEndpointsCommand({
      VpcEndpointIds: [vpceId],
    }));
    const routeTableIds = desc.VpcEndpoints![0].RouteTableIds;
    expect(routeTableIds).toBeDefined();
    expect(routeTableIds!.length).toBe(2);

    // Remove the second route table
    await ec2.send(new ModifyVpcEndpointCommand({
      VpcEndpointId: vpceId,
      RemoveRouteTableIds: [rtb2Id],
    }));

    const desc2 = await ec2.send(new DescribeVpcEndpointsCommand({
      VpcEndpointIds: [vpceId],
    }));
    expect(desc2.VpcEndpoints![0].RouteTableIds!.length).toBe(1);

    // Cleanup second route table
    await ec2.send(new DeleteRouteTableCommand({ RouteTableId: rtb2Id }));
  });

  test("DeleteVpcEndpoints", async () => {
    await ec2.send(new DeleteVpcEndpointsCommand({
      VpcEndpointIds: [vpceId],
    }));
    const res = await ec2.send(new DescribeVpcEndpointsCommand({}));
    const found = res.VpcEndpoints?.find((e) => e.VpcEndpointId === vpceId);
    expect(found).toBeUndefined();
  });

  test("cleanup", async () => {
    await ec2.send(new DeleteRouteTableCommand({ RouteTableId: rtbId }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});

describe("EC2 - Instance Types", () => {
  test("DescribeInstanceTypes - all", async () => {
    const res = await ec2.send(new DescribeInstanceTypesCommand({}));
    expect(res.InstanceTypes).toBeDefined();
    expect(res.InstanceTypes!.length).toBeGreaterThanOrEqual(5);
    const t2micro = res.InstanceTypes!.find((t) => t.InstanceType === "t2.micro");
    expect(t2micro).toBeDefined();
    expect(t2micro!.VCpuInfo!.DefaultVCpus).toBe(1);
    expect(t2micro!.MemoryInfo!.SizeInMiB).toBe(1024);
    expect(t2micro!.CurrentGeneration).toBe(true);
  });

  test("DescribeInstanceTypes - filtered", async () => {
    const res = await ec2.send(new DescribeInstanceTypesCommand({
      InstanceTypes: ["m5.large", "c5.large"],
    }));
    expect(res.InstanceTypes).toHaveLength(2);
    const types = res.InstanceTypes!.map((t) => t.InstanceType).sort();
    expect(types).toEqual(["c5.large", "m5.large"]);
    const m5 = res.InstanceTypes!.find((t) => t.InstanceType === "m5.large");
    expect(m5!.VCpuInfo!.DefaultVCpus).toBe(2);
    expect(m5!.MemoryInfo!.SizeInMiB).toBe(8192);
  });

  test("DescribeInstanceTypes - has network and processor info", async () => {
    const res = await ec2.send(new DescribeInstanceTypesCommand({
      InstanceTypes: ["t3.medium"],
    }));
    expect(res.InstanceTypes).toHaveLength(1);
    const t3 = res.InstanceTypes![0];
    expect(t3.ProcessorInfo).toBeDefined();
    expect(t3.ProcessorInfo!.SupportedArchitectures).toBeDefined();
    expect(t3.ProcessorInfo!.SupportedArchitectures!.length).toBeGreaterThanOrEqual(1);
    expect(t3.NetworkInfo).toBeDefined();
    expect(t3.NetworkInfo!.NetworkPerformance).toBeDefined();
  });
});

describe("EC2 - CIDR Validation", () => {
  test("CreateVpc rejects invalid CIDR format", async () => {
    try {
      await ec2.send(new CreateVpcCommand({ CidrBlock: "not-a-cidr" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("not a valid CIDR");
    }
  });

  test("CreateVpc rejects non-network address CIDR", async () => {
    // 10.0.0.1/16 is not a valid network address (should be 10.0.0.0/16)
    try {
      await ec2.send(new CreateVpcCommand({ CidrBlock: "10.0.0.1/16" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("not a valid CIDR");
    }
  });

  test("CreateSubnet rejects CIDR outside VPC range", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.0.0.0/16" }));
    const vpcId = vpcRes.Vpc!.VpcId!;
    try {
      await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "192.168.1.0/24" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("out of range");
    }
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });

  test("CreateSubnet rejects overlapping CIDRs", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.0.0.0/16" }));
    const vpcId = vpcRes.Vpc!.VpcId!;
    await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "10.0.0.0/24" }));
    try {
      await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "10.0.0.0/25" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("conflicts");
    }
    // cleanup: delete subnet then vpc
    const subnets = await ec2.send(new DescribeSubnetsCommand({ Filters: [{ Name: "vpc-id", Values: [vpcId] }] }));
    for (const s of subnets.Subnets ?? []) {
      await ec2.send(new DeleteSubnetCommand({ SubnetId: s.SubnetId }));
    }
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });

  test("CreateSubnet rejects invalid CIDR format", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.0.0.0/16" }));
    const vpcId = vpcRes.Vpc!.VpcId!;
    try {
      await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "bad" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("not a valid CIDR");
    }
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});

describe("EC2 - Resource Dependencies", () => {
  test("DeleteVpc fails when subnets exist", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.1.0.0/16" }));
    const vpcId = vpcRes.Vpc!.VpcId!;
    const subRes = await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "10.1.0.0/24" }));
    try {
      await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("dependencies");
    }
    await ec2.send(new DeleteSubnetCommand({ SubnetId: subRes.Subnet!.SubnetId! }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });

  test("DeleteVpc fails when internet gateway attached", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.2.0.0/16" }));
    const vpcId = vpcRes.Vpc!.VpcId!;
    const igwRes = await ec2.send(new CreateInternetGatewayCommand({}));
    const igwId = igwRes.InternetGateway!.InternetGatewayId!;
    await ec2.send(new AttachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }));
    try {
      await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("dependencies");
    }
    await ec2.send(new DetachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }));
    await ec2.send(new DeleteInternetGatewayCommand({ InternetGatewayId: igwId }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });

  test("DeleteVpc fails when non-default security group exists", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.3.0.0/16" }));
    const vpcId = vpcRes.Vpc!.VpcId!;
    const sgRes = await ec2.send(new CreateSecurityGroupCommand({ GroupName: "custom-sg", Description: "test", VpcId: vpcId }));
    try {
      await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("dependencies");
    }
    await ec2.send(new DeleteSecurityGroupCommand({ GroupId: sgRes.GroupId! }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });

  test("DeleteSubnet fails when instances exist in it", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.4.0.0/16" }));
    const vpcId = vpcRes.Vpc!.VpcId!;
    const subRes = await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "10.4.0.0/24" }));
    const subnetId = subRes.Subnet!.SubnetId!;
    const instRes = await ec2.send(new RunInstancesCommand({ ImageId: "ami-test", MinCount: 1, MaxCount: 1, SubnetId: subnetId }));
    const instanceId = instRes.Instances![0].InstanceId!;
    try {
      await ec2.send(new DeleteSubnetCommand({ SubnetId: subnetId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("dependencies");
    }
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
    await ec2.send(new DeleteSubnetCommand({ SubnetId: subnetId }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });

  test("DeleteSecurityGroup fails when referenced by instances", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.5.0.0/16" }));
    const vpcId = vpcRes.Vpc!.VpcId!;
    const sgRes = await ec2.send(new CreateSecurityGroupCommand({ GroupName: "ref-sg", Description: "test", VpcId: vpcId }));
    const sgId = sgRes.GroupId!;
    const subRes = await ec2.send(new CreateSubnetCommand({ VpcId: vpcId, CidrBlock: "10.5.0.0/24" }));
    const subnetId = subRes.Subnet!.SubnetId!;
    const instRes = await ec2.send(new RunInstancesCommand({
      ImageId: "ami-test", MinCount: 1, MaxCount: 1,
      SubnetId: subnetId, SecurityGroupIds: [sgId],
    }));
    const instanceId = instRes.Instances![0].InstanceId!;
    try {
      await ec2.send(new DeleteSecurityGroupCommand({ GroupId: sgId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("dependencies");
    }
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
    await ec2.send(new DeleteSecurityGroupCommand({ GroupId: sgId }));
    await ec2.send(new DeleteSubnetCommand({ SubnetId: subnetId }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });

  test("DeleteInternetGateway fails when attached to VPC", async () => {
    const vpcRes = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.6.0.0/16" }));
    const vpcId = vpcRes.Vpc!.VpcId!;
    const igwRes = await ec2.send(new CreateInternetGatewayCommand({}));
    const igwId = igwRes.InternetGateway!.InternetGatewayId!;
    await ec2.send(new AttachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }));
    try {
      await ec2.send(new DeleteInternetGatewayCommand({ InternetGatewayId: igwId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("dependencies");
    }
    await ec2.send(new DetachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }));
    await ec2.send(new DeleteInternetGatewayCommand({ InternetGatewayId: igwId }));
    await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }));
  });
});
