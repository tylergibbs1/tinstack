import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { DirectConnectService } from "./directconnect-service";

export class DirectConnectHandler {
  constructor(private service: DirectConnectService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateConnection": return this.createConnection(body, ctx);
        case "DescribeConnections": return this.describeConnections(body, ctx);
        case "DeleteConnection": return this.deleteConnection(body, ctx);
        case "CreatePrivateVirtualInterface": return this.createPrivateVirtualInterface(body, ctx);
        case "CreatePublicVirtualInterface": return this.createPublicVirtualInterface(body, ctx);
        case "DescribeVirtualInterfaces": return this.describeVirtualInterfaces(body, ctx);
        case "DeleteVirtualInterface": return this.deleteVirtualInterface(body, ctx);
        case "CreateDirectConnectGateway": return this.createDirectConnectGateway(body, ctx);
        case "DescribeDirectConnectGateways": return this.describeDirectConnectGateways(body, ctx);
        case "DeleteDirectConnectGateway": return this.deleteDirectConnectGateway(body, ctx);
        case "CreateLag": return this.createLag(body, ctx);
        case "DescribeLags": return this.describeLags(body, ctx);
        case "DeleteLag": return this.deleteLag(body, ctx);
        case "TagResource": return this.tagResource(body, ctx);
        case "UntagResource": return this.untagResource(body, ctx);
        case "DescribeTags": return this.describeTags(body, ctx);
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

  private createConnection(body: any, ctx: RequestContext): Response {
    const conn = this.service.createConnection(
      body.connectionName,
      body.bandwidth,
      body.location,
      body.lagId,
      ctx.region,
    );
    return this.json(connectionToJson(conn), ctx);
  }

  private describeConnections(body: any, ctx: RequestContext): Response {
    const connections = this.service.describeConnections(body.connectionId);
    return this.json({ connections: connections.map(connectionToJson) }, ctx);
  }

  private deleteConnection(body: any, ctx: RequestContext): Response {
    const conn = this.service.deleteConnection(body.connectionId);
    return this.json(connectionToJson(conn), ctx);
  }

  private createPrivateVirtualInterface(body: any, ctx: RequestContext): Response {
    const vi = body.newPrivateVirtualInterface ?? {};
    const result = this.service.createPrivateVirtualInterface(
      body.connectionId,
      vi.virtualInterfaceName,
      vi.vlan,
      vi.asn,
      ctx.region,
    );
    return this.json(viToJson(result), ctx);
  }

  private createPublicVirtualInterface(body: any, ctx: RequestContext): Response {
    const vi = body.newPublicVirtualInterface ?? {};
    const result = this.service.createPublicVirtualInterface(
      body.connectionId,
      vi.virtualInterfaceName,
      vi.vlan,
      vi.asn,
      ctx.region,
    );
    return this.json(viToJson(result), ctx);
  }

  private describeVirtualInterfaces(body: any, ctx: RequestContext): Response {
    const vis = this.service.describeVirtualInterfaces(body.connectionId, body.virtualInterfaceId);
    return this.json({ virtualInterfaces: vis.map(viToJson) }, ctx);
  }

  private deleteVirtualInterface(body: any, ctx: RequestContext): Response {
    const vi = this.service.deleteVirtualInterface(body.virtualInterfaceId);
    return this.json({ virtualInterfaceState: vi.virtualInterfaceState }, ctx);
  }

  private createDirectConnectGateway(body: any, ctx: RequestContext): Response {
    const gw = this.service.createDirectConnectGateway(
      body.directConnectGatewayName,
      body.amazonSideAsn,
    );
    return this.json({ directConnectGateway: gwToJson(gw) }, ctx);
  }

  private describeDirectConnectGateways(body: any, ctx: RequestContext): Response {
    const gws = this.service.describeDirectConnectGateways(body.directConnectGatewayId);
    return this.json({ directConnectGateways: gws.map(gwToJson) }, ctx);
  }

  private deleteDirectConnectGateway(body: any, ctx: RequestContext): Response {
    const gw = this.service.deleteDirectConnectGateway(body.directConnectGatewayId);
    return this.json({ directConnectGateway: gwToJson(gw) }, ctx);
  }

  private createLag(body: any, ctx: RequestContext): Response {
    const lag = this.service.createLag(
      body.lagName,
      body.connectionsBandwidth,
      body.numberOfConnections ?? 1,
      body.location,
      ctx.region,
    );
    return this.json(lagToJson(lag), ctx);
  }

  private describeLags(body: any, ctx: RequestContext): Response {
    const lags = this.service.describeLags(body.lagId);
    return this.json({ lags: lags.map(lagToJson) }, ctx);
  }

  private deleteLag(body: any, ctx: RequestContext): Response {
    const lag = this.service.deleteLag(body.lagId);
    return this.json(lagToJson(lag), ctx);
  }

  private tagResource(body: any, ctx: RequestContext): Response {
    this.service.tagResource(body.resourceArn, body.tags ?? []);
    return this.json({}, ctx);
  }

  private untagResource(body: any, ctx: RequestContext): Response {
    this.service.untagResource(body.resourceArn, body.tagKeys ?? []);
    return this.json({}, ctx);
  }

  private describeTags(body: any, ctx: RequestContext): Response {
    const result = this.service.describeTags(body.resourceArns ?? []);
    return this.json({ resourceTags: result }, ctx);
  }
}

function connectionToJson(conn: any) {
  return {
    connectionId: conn.connectionId,
    connectionName: conn.connectionName,
    connectionState: conn.connectionState,
    bandwidth: conn.bandwidth,
    location: conn.location,
    region: conn.region,
    ownerAccount: conn.ownerAccount,
    partnerName: conn.partnerName,
    lagId: conn.lagId,
    vlan: conn.vlan,
  };
}

function viToJson(vi: any) {
  return {
    virtualInterfaceId: vi.virtualInterfaceId,
    virtualInterfaceName: vi.virtualInterfaceName,
    virtualInterfaceType: vi.virtualInterfaceType,
    virtualInterfaceState: vi.virtualInterfaceState,
    connectionId: vi.connectionId,
    ownerAccount: vi.ownerAccount,
    vlan: vi.vlan,
    asn: vi.asn,
    amazonAddress: vi.amazonAddress,
    customerAddress: vi.customerAddress,
    addressFamily: vi.addressFamily,
    region: vi.region,
  };
}

function gwToJson(gw: any) {
  return {
    directConnectGatewayId: gw.directConnectGatewayId,
    directConnectGatewayName: gw.directConnectGatewayName,
    directConnectGatewayState: gw.directConnectGatewayState,
    amazonSideAsn: gw.amazonSideAsn,
    ownerAccount: gw.ownerAccount,
  };
}

function lagToJson(lag: any) {
  return {
    lagId: lag.lagId,
    lagName: lag.lagName,
    lagState: lag.lagState,
    connectionsBandwidth: lag.connectionsBandwidth,
    numberOfConnections: lag.numberOfConnections,
    minimumLinks: lag.minimumLinks,
    location: lag.location,
    ownerAccount: lag.ownerAccount,
    region: lag.region,
    connections: (lag.connections ?? []).map(connectionToJson),
  };
}
