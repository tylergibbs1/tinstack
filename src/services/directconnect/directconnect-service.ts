import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface DxConnection {
  connectionId: string;
  connectionName: string;
  connectionState: string;
  bandwidth: string;
  location: string;
  region: string;
  ownerAccount: string;
  partnerName: string;
  lagId: string;
  vlan: number;
}

export interface DxVirtualInterface {
  virtualInterfaceId: string;
  virtualInterfaceName: string;
  virtualInterfaceType: string;
  virtualInterfaceState: string;
  connectionId: string;
  ownerAccount: string;
  vlan: number;
  asn: number;
  amazonAddress: string;
  customerAddress: string;
  addressFamily: string;
  region: string;
}

export interface DxGateway {
  directConnectGatewayId: string;
  directConnectGatewayName: string;
  directConnectGatewayState: string;
  amazonSideAsn: number;
  ownerAccount: string;
}

export interface DxLag {
  lagId: string;
  lagName: string;
  lagState: string;
  connectionsBandwidth: string;
  numberOfConnections: number;
  minimumLinks: number;
  location: string;
  ownerAccount: string;
  region: string;
  connections: DxConnection[];
}

export class DirectConnectService {
  private connections: StorageBackend<string, DxConnection>;
  private virtualInterfaces: StorageBackend<string, DxVirtualInterface>;
  private gateways: StorageBackend<string, DxGateway>;
  private lags: StorageBackend<string, DxLag>;
  private resourceTags: StorageBackend<string, { key: string; value: string }[]>;

  constructor(private accountId: string) {
    this.connections = new InMemoryStorage();
    this.virtualInterfaces = new InMemoryStorage();
    this.gateways = new InMemoryStorage();
    this.lags = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();
  }

  createConnection(
    connectionName: string,
    bandwidth: string,
    location: string,
    lagId: string,
    region: string,
  ): DxConnection {
    const connectionId = `dxcon-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const conn: DxConnection = {
      connectionId,
      connectionName,
      connectionState: "available",
      bandwidth: bandwidth ?? "1Gbps",
      location: location ?? "EqDC2",
      region,
      ownerAccount: this.accountId,
      partnerName: "",
      lagId: lagId ?? "",
      vlan: 0,
    };
    this.connections.set(connectionId, conn);
    return conn;
  }

  describeConnections(connectionId?: string): DxConnection[] {
    if (connectionId) {
      const conn = this.connections.get(connectionId);
      if (!conn) throw new AwsError("DirectConnectClientException", `Connection ${connectionId} not found.`, 400);
      return [conn];
    }
    return this.connections.values();
  }

  deleteConnection(connectionId: string): DxConnection {
    const conn = this.connections.get(connectionId);
    if (!conn) throw new AwsError("DirectConnectClientException", `Connection ${connectionId} not found.`, 400);
    conn.connectionState = "deleted";
    this.connections.delete(connectionId);
    return conn;
  }

  createPrivateVirtualInterface(
    connectionId: string,
    virtualInterfaceName: string,
    vlan: number,
    asn: number,
    region: string,
  ): DxVirtualInterface {
    return this.createVirtualInterface(connectionId, virtualInterfaceName, "private", vlan, asn, region);
  }

  createPublicVirtualInterface(
    connectionId: string,
    virtualInterfaceName: string,
    vlan: number,
    asn: number,
    region: string,
  ): DxVirtualInterface {
    return this.createVirtualInterface(connectionId, virtualInterfaceName, "public", vlan, asn, region);
  }

  private createVirtualInterface(
    connectionId: string,
    virtualInterfaceName: string,
    type: string,
    vlan: number,
    asn: number,
    region: string,
  ): DxVirtualInterface {
    const virtualInterfaceId = `dxvif-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const vi: DxVirtualInterface = {
      virtualInterfaceId,
      virtualInterfaceName: virtualInterfaceName ?? "",
      virtualInterfaceType: type,
      virtualInterfaceState: "available",
      connectionId,
      ownerAccount: this.accountId,
      vlan: vlan ?? 100,
      asn: asn ?? 65000,
      amazonAddress: "169.254.255.1/30",
      customerAddress: "169.254.255.2/30",
      addressFamily: "ipv4",
      region,
    };
    this.virtualInterfaces.set(virtualInterfaceId, vi);
    return vi;
  }

  describeVirtualInterfaces(connectionId?: string, virtualInterfaceId?: string): DxVirtualInterface[] {
    let result = this.virtualInterfaces.values();
    if (virtualInterfaceId) {
      const vi = this.virtualInterfaces.get(virtualInterfaceId);
      if (!vi) throw new AwsError("DirectConnectClientException", `Virtual interface ${virtualInterfaceId} not found.`, 400);
      return [vi];
    }
    if (connectionId) {
      result = result.filter((vi) => vi.connectionId === connectionId);
    }
    return result;
  }

  deleteVirtualInterface(virtualInterfaceId: string): DxVirtualInterface {
    const vi = this.virtualInterfaces.get(virtualInterfaceId);
    if (!vi) throw new AwsError("DirectConnectClientException", `Virtual interface ${virtualInterfaceId} not found.`, 400);
    vi.virtualInterfaceState = "deleted";
    this.virtualInterfaces.delete(virtualInterfaceId);
    return vi;
  }

  createDirectConnectGateway(
    directConnectGatewayName: string,
    amazonSideAsn: number,
  ): DxGateway {
    const directConnectGatewayId = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const gw: DxGateway = {
      directConnectGatewayId,
      directConnectGatewayName,
      directConnectGatewayState: "available",
      amazonSideAsn: amazonSideAsn ?? 64512,
      ownerAccount: this.accountId,
    };
    this.gateways.set(directConnectGatewayId, gw);
    return gw;
  }

  describeDirectConnectGateways(directConnectGatewayId?: string): DxGateway[] {
    if (directConnectGatewayId) {
      const gw = this.gateways.get(directConnectGatewayId);
      if (!gw) throw new AwsError("DirectConnectClientException", `Gateway ${directConnectGatewayId} not found.`, 400);
      return [gw];
    }
    return this.gateways.values();
  }

  deleteDirectConnectGateway(directConnectGatewayId: string): DxGateway {
    const gw = this.gateways.get(directConnectGatewayId);
    if (!gw) throw new AwsError("DirectConnectClientException", `Gateway ${directConnectGatewayId} not found.`, 400);
    gw.directConnectGatewayState = "deleted";
    this.gateways.delete(directConnectGatewayId);
    return gw;
  }

  createLag(
    lagName: string,
    connectionsBandwidth: string,
    numberOfConnections: number,
    location: string,
    region: string,
  ): DxLag {
    const lagId = `dxlag-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const lag: DxLag = {
      lagId,
      lagName,
      lagState: "available",
      connectionsBandwidth: connectionsBandwidth ?? "1Gbps",
      numberOfConnections: numberOfConnections ?? 1,
      minimumLinks: 0,
      location: location ?? "EqDC2",
      ownerAccount: this.accountId,
      region,
      connections: [],
    };

    // Create child connections
    for (let i = 0; i < lag.numberOfConnections; i++) {
      const conn = this.createConnection(
        `Requested Connection ${i + 1} for Lag ${lagId}`,
        lag.connectionsBandwidth,
        lag.location,
        lagId,
        region,
      );
      lag.connections.push(conn);
    }

    this.lags.set(lagId, lag);
    return lag;
  }

  describeLags(lagId?: string): DxLag[] {
    if (lagId) {
      const lag = this.lags.get(lagId);
      if (!lag) throw new AwsError("DirectConnectClientException", `LAG ${lagId} not found.`, 400);
      return [lag];
    }
    return this.lags.values();
  }

  deleteLag(lagId: string): DxLag {
    const lag = this.lags.get(lagId);
    if (!lag) throw new AwsError("DirectConnectClientException", `LAG ${lagId} not found.`, 400);
    lag.lagState = "deleted";
    this.lags.delete(lagId);
    return lag;
  }

  tagResource(resourceArn: string, tags: { key: string; value: string }[]): void {
    const existing = this.resourceTags.get(resourceArn) ?? [];
    for (const tag of tags) {
      const idx = existing.findIndex((t) => t.key === tag.key);
      if (idx >= 0) existing[idx] = tag;
      else existing.push(tag);
    }
    this.resourceTags.set(resourceArn, existing);
  }

  untagResource(resourceArn: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(resourceArn) ?? [];
    this.resourceTags.set(resourceArn, existing.filter((t) => !tagKeys.includes(t.key)));
  }

  describeTags(resourceArns: string[]): { resourceArn: string; tags: { key: string; value: string }[] }[] {
    return resourceArns.map((arn) => ({
      resourceArn: arn,
      tags: this.resourceTags.get(arn) ?? [],
    }));
  }
}
