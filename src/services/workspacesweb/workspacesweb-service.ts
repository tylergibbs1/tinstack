import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Portal {
  portalArn: string;
  portalEndpoint: string;
  displayName: string;
  portalStatus: string;
  browserSettingsArn: string;
  networkSettingsArn: string;
  userSettingsArn: string;
  creationDate: string;
}

export interface BrowserSettings {
  browserSettingsArn: string;
  browserPolicy: string;
}

export interface NetworkSettings {
  networkSettingsArn: string;
  vpcId: string;
  subnetIds: string[];
  securityGroupIds: string[];
}

export interface UserSettings {
  userSettingsArn: string;
  copyAllowed: string;
  pasteAllowed: string;
  downloadAllowed: string;
  uploadAllowed: string;
  printAllowed: string;
}

export class WorkSpacesWebService {
  private portals: StorageBackend<string, Portal>;
  private browserSettings: StorageBackend<string, BrowserSettings>;
  private networkSettings: StorageBackend<string, NetworkSettings>;
  private userSettings: StorageBackend<string, UserSettings>;

  constructor(private accountId: string) {
    this.portals = new InMemoryStorage();
    this.browserSettings = new InMemoryStorage();
    this.networkSettings = new InMemoryStorage();
    this.userSettings = new InMemoryStorage();
  }

  createPortal(displayName: string, region: string): Portal {
    const id = crypto.randomUUID().slice(0, 12).replace(/-/g, "");
    const arn = buildArn("workspaces-web", region, this.accountId, "portal/", id);
    const portal: Portal = {
      portalArn: arn, portalEndpoint: `https://${id}.workspaces-web.${region}.amazonaws.com`,
      displayName: displayName ?? "", portalStatus: "Active",
      browserSettingsArn: "", networkSettingsArn: "", userSettingsArn: "",
      creationDate: Math.floor(Date.now() / 1000),
    };
    this.portals.set(arn, portal);
    return portal;
  }

  getPortal(portalArn: string): Portal {
    const p = this.portals.get(portalArn);
    if (!p) throw new AwsError("ResourceNotFoundException", `Portal not found.`, 404);
    return p;
  }

  listPortals(): Portal[] { return this.portals.values(); }

  deletePortal(portalArn: string): void {
    if (!this.portals.has(portalArn)) throw new AwsError("ResourceNotFoundException", `Portal not found.`, 404);
    this.portals.delete(portalArn);
  }

  createBrowserSettings(browserPolicy: string, region: string): BrowserSettings {
    const id = crypto.randomUUID().slice(0, 12).replace(/-/g, "");
    const arn = buildArn("workspaces-web", region, this.accountId, "browserSettings/", id);
    const bs: BrowserSettings = { browserSettingsArn: arn, browserPolicy: browserPolicy ?? "{}" };
    this.browserSettings.set(arn, bs);
    return bs;
  }

  getBrowserSettings(arn: string): BrowserSettings {
    const bs = this.browserSettings.get(arn);
    if (!bs) throw new AwsError("ResourceNotFoundException", `BrowserSettings not found.`, 404);
    return bs;
  }

  createNetworkSettings(vpcId: string, subnetIds: string[], securityGroupIds: string[], region: string): NetworkSettings {
    const id = crypto.randomUUID().slice(0, 12).replace(/-/g, "");
    const arn = buildArn("workspaces-web", region, this.accountId, "networkSettings/", id);
    const ns: NetworkSettings = {
      networkSettingsArn: arn, vpcId: vpcId ?? "", subnetIds: subnetIds ?? [],
      securityGroupIds: securityGroupIds ?? [],
    };
    this.networkSettings.set(arn, ns);
    return ns;
  }

  getNetworkSettings(arn: string): NetworkSettings {
    const ns = this.networkSettings.get(arn);
    if (!ns) throw new AwsError("ResourceNotFoundException", `NetworkSettings not found.`, 404);
    return ns;
  }

  createUserSettings(settings: Partial<UserSettings>, region: string): UserSettings {
    const id = crypto.randomUUID().slice(0, 12).replace(/-/g, "");
    const arn = buildArn("workspaces-web", region, this.accountId, "userSettings/", id);
    const us: UserSettings = {
      userSettingsArn: arn,
      copyAllowed: settings.copyAllowed ?? "Disabled",
      pasteAllowed: settings.pasteAllowed ?? "Disabled",
      downloadAllowed: settings.downloadAllowed ?? "Disabled",
      uploadAllowed: settings.uploadAllowed ?? "Disabled",
      printAllowed: settings.printAllowed ?? "Disabled",
    };
    this.userSettings.set(arn, us);
    return us;
  }

  getUserSettings(arn: string): UserSettings {
    const us = this.userSettings.get(arn);
    if (!us) throw new AwsError("ResourceNotFoundException", `UserSettings not found.`, 404);
    return us;
  }
}
