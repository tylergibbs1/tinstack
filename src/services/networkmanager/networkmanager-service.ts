import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface GlobalNetwork { globalNetworkId: string; globalNetworkArn: string; description: string; state: string; }
export interface Site { siteId: string; siteArn: string; globalNetworkId: string; description: string; }
export interface Device { deviceId: string; deviceArn: string; globalNetworkId: string; description: string; }

export class NetworkManagerService {
  private networks: StorageBackend<string, GlobalNetwork>;
  private sites: StorageBackend<string, Site>;
  private devices: StorageBackend<string, Device>;

  constructor(private accountId: string) {
    this.networks = new InMemoryStorage();
    this.sites = new InMemoryStorage();
    this.devices = new InMemoryStorage();
  }

  createGlobalNetwork(description: string): GlobalNetwork {
    const id = `gn-${crypto.randomUUID().slice(0, 8)}`;
    const gn: GlobalNetwork = { globalNetworkId: id, globalNetworkArn: `arn:aws:networkmanager::${this.accountId}:global-network/${id}`, description: description ?? "", state: "AVAILABLE" };
    this.networks.set(id, gn);
    return gn;
  }

  getGlobalNetwork(id: string): GlobalNetwork {
    const gn = this.networks.get(id);
    if (!gn) throw new AwsError("ResourceNotFoundException", `Global network ${id} not found`, 404);
    return gn;
  }

  listGlobalNetworks(): GlobalNetwork[] { return this.networks.values(); }

  deleteGlobalNetwork(id: string): void {
    if (!this.networks.has(id)) throw new AwsError("ResourceNotFoundException", `Global network ${id} not found`, 404);
    this.networks.delete(id);
  }

  createSite(globalNetworkId: string, description: string): Site {
    const id = `site-${crypto.randomUUID().slice(0, 8)}`;
    const s: Site = { siteId: id, siteArn: `arn:aws:networkmanager::${this.accountId}:site/${globalNetworkId}/${id}`, globalNetworkId, description: description ?? "" };
    this.sites.set(id, s);
    return s;
  }

  getSites(globalNetworkId: string): Site[] { return this.sites.values().filter((s) => s.globalNetworkId === globalNetworkId); }

  createDevice(globalNetworkId: string, description: string): Device {
    const id = `device-${crypto.randomUUID().slice(0, 8)}`;
    const d: Device = { deviceId: id, deviceArn: `arn:aws:networkmanager::${this.accountId}:device/${globalNetworkId}/${id}`, globalNetworkId, description: description ?? "" };
    this.devices.set(id, d);
    return d;
  }

  getDevices(globalNetworkId: string): Device[] { return this.devices.values().filter((d) => d.globalNetworkId === globalNetworkId); }
}
