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
