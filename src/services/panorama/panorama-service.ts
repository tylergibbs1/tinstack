import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface PanoramaPackage {
  packageId: string;
  packageName: string;
  arn: string;
  storageLocation: { bucket: string; repoPrefixLocation: string; generatedPrefixLocation: string; binaryPrefixLocation: string; manifestPrefixLocation: string };
  tags: Record<string, string>;
  createdTime: string;
}

export interface PanoramaDevice {
  deviceId: string;
  name: string;
  arn: string;
  status: string;
  type: string;
  serialNumber: string;
  createdTime: string;
  tags: Record<string, string>;
}

export interface ApplicationInstance {
  applicationInstanceId: string;
  name: string;
  arn: string;
  defaultRuntimeContextDeviceName: string;
  status: string;
  healthStatus: string;
  createdTime: string;
  tags: Record<string, string>;
}

export class PanoramaService {
  private packages: StorageBackend<string, PanoramaPackage>;
  private devices: StorageBackend<string, PanoramaDevice>;
  private appInstances: StorageBackend<string, ApplicationInstance>;

  constructor(private accountId: string) {
    this.packages = new InMemoryStorage();
    this.devices = new InMemoryStorage();
    this.appInstances = new InMemoryStorage();
  }

  createPackage(packageName: string, region: string, tags?: Record<string, string>): PanoramaPackage {
    const id = `package-${crypto.randomUUID().slice(0, 12).replace(/-/g, "")}`;
    const pkg: PanoramaPackage = {
      packageId: id, packageName, arn: buildArn("panorama", region, this.accountId, "packages/", id),
      storageLocation: { bucket: `panorama-${this.accountId}`, repoPrefixLocation: "repo", generatedPrefixLocation: "gen", binaryPrefixLocation: "bin", manifestPrefixLocation: "manifest" },
      tags: tags ?? {}, createdTime: Math.floor(Date.now() / 1000),
    };
    this.packages.set(id, pkg);
    return pkg;
  }

  describePackage(packageId: string): PanoramaPackage {
    const pkg = this.packages.get(packageId);
    if (!pkg) throw new AwsError("ResourceNotFoundException", `Package ${packageId} not found.`, 404);
    return pkg;
  }

  listPackages(): PanoramaPackage[] { return this.packages.values(); }

  deletePackage(packageId: string): void {
    if (!this.packages.has(packageId)) throw new AwsError("ResourceNotFoundException", `Package ${packageId} not found.`, 404);
    this.packages.delete(packageId);
  }

  provisionDevice(name: string, region: string, tags?: Record<string, string>): PanoramaDevice {
    const id = `device-${crypto.randomUUID().slice(0, 12).replace(/-/g, "")}`;
    const device: PanoramaDevice = {
      deviceId: id, name, arn: buildArn("panorama", region, this.accountId, "devices/", id),
      status: "AWAITING_PROVISIONING", type: "PANORAMA_APPLIANCE",
      serialNumber: crypto.randomUUID().slice(0, 16).replace(/-/g, "").toUpperCase(),
      createdTime: Math.floor(Date.now() / 1000), tags: tags ?? {},
    };
    this.devices.set(id, device);
    return device;
  }

  describeDevice(deviceId: string): PanoramaDevice {
    const d = this.devices.get(deviceId);
    if (!d) throw new AwsError("ResourceNotFoundException", `Device ${deviceId} not found.`, 404);
    return d;
  }

  listDevices(): PanoramaDevice[] { return this.devices.values(); }

  deleteDevice(deviceId: string): void {
    if (!this.devices.has(deviceId)) throw new AwsError("ResourceNotFoundException", `Device ${deviceId} not found.`, 404);
    this.devices.delete(deviceId);
  }

  createApplicationInstance(name: string, deviceId: string, region: string, manifestPayload?: any): ApplicationInstance {
    const id = `appInstance-${crypto.randomUUID().slice(0, 12).replace(/-/g, "")}`;
    const inst: ApplicationInstance = {
      applicationInstanceId: id, name, arn: buildArn("panorama", region, this.accountId, "applicationInstances/", id),
      defaultRuntimeContextDeviceName: deviceId, status: "DEPLOYMENT_SUCCEEDED",
      healthStatus: "RUNNING", createdTime: Math.floor(Date.now() / 1000), tags: {},
    };
    this.appInstances.set(id, inst);
    return inst;
  }

  describeApplicationInstance(id: string): ApplicationInstance {
    const inst = this.appInstances.get(id);
    if (!inst) throw new AwsError("ResourceNotFoundException", `ApplicationInstance ${id} not found.`, 404);
    return inst;
  }

  listApplicationInstances(): ApplicationInstance[] { return this.appInstances.values(); }
}
