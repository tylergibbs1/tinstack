import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { PanoramaService } from "./panorama-service";

export class PanoramaHandler {
  constructor(private service: PanoramaService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Application Instances
      const appIdMatch = path.match(/^\/applicationInstances\/(.+)$/);
      if (appIdMatch) {
        const id = decodeURIComponent(appIdMatch[1]);
        if (method === "GET") {
          const inst = this.service.describeApplicationInstance(id);
          return this.json({
            ApplicationInstanceId: inst.applicationInstanceId, Name: inst.name,
            Arn: inst.arn, Status: inst.status, HealthStatus: inst.healthStatus,
            CreatedTime: inst.createdTime,
          }, ctx);
        }
      }
      if (path === "/applicationInstances") {
        if (method === "POST") {
          const body = await req.json();
          const inst = this.service.createApplicationInstance(body.Name ?? "", body.DefaultRuntimeContextDevice ?? "", ctx.region, body.ManifestPayload);
          return this.json({ ApplicationInstanceId: inst.applicationInstanceId }, ctx);
        }
        if (method === "GET") {
          return this.json({ ApplicationInstances: this.service.listApplicationInstances().map(i => ({
            ApplicationInstanceId: i.applicationInstanceId, Name: i.name, Arn: i.arn,
            Status: i.status, CreatedTime: i.createdTime,
          })) }, ctx);
        }
      }

      // Devices
      const deviceIdMatch = path.match(/^\/devices\/(.+)$/);
      if (deviceIdMatch) {
        const id = decodeURIComponent(deviceIdMatch[1]);
        if (method === "GET") {
          const d = this.service.describeDevice(id);
          return this.json({
            DeviceId: d.deviceId, Name: d.name, Arn: d.arn, Status: d.status,
            Type: d.type, SerialNumber: d.serialNumber, CreatedTime: d.createdTime,
          }, ctx);
        }
        if (method === "DELETE") { this.service.deleteDevice(id); return this.json({}, ctx); }
      }
      if (path === "/devices") {
        if (method === "POST") {
          const body = await req.json();
          const device = this.service.provisionDevice(body.Name ?? "", ctx.region, body.Tags);
          return this.json({
            DeviceId: device.deviceId, Arn: device.arn, Status: device.status,
            Certificates: btoa("mock-certificate"),
          }, ctx);
        }
        if (method === "GET") {
          return this.json({ Devices: this.service.listDevices().map(d => ({
            DeviceId: d.deviceId, Name: d.name, Status: d.status, CreatedTime: d.createdTime,
          })) }, ctx);
        }
      }

      // Packages: DescribePackage is GET /packages/metadata/{packageId}
      const pkgMetadataMatch = path.match(/^\/packages\/metadata\/(.+)$/);
      if (pkgMetadataMatch && method === "GET") {
        const pkg = this.service.describePackage(decodeURIComponent(pkgMetadataMatch[1]));
        return this.json({
          PackageId: pkg.packageId, PackageName: pkg.packageName, Arn: pkg.arn,
          StorageLocation: pkg.storageLocation, Tags: pkg.tags, CreatedTime: pkg.createdTime,
        }, ctx);
      }
      // Delete: DELETE /packages/{packageId}
      const pkgIdMatch = path.match(/^\/packages\/(.+)$/);
      if (pkgIdMatch && !path.includes("/metadata/")) {
        const id = decodeURIComponent(pkgIdMatch[1]);
        if (method === "DELETE") { this.service.deletePackage(id); return this.json({}, ctx); }
        if (method === "GET") {
          const pkg = this.service.describePackage(id);
          return this.json({
            PackageId: pkg.packageId, PackageName: pkg.packageName, Arn: pkg.arn,
            StorageLocation: pkg.storageLocation,
          }, ctx);
        }
      }
      if (path === "/packages") {
        if (method === "POST") {
          const body = await req.json();
          const pkg = this.service.createPackage(body.PackageName ?? "", ctx.region, body.Tags);
          return this.json({ PackageId: pkg.packageId, Arn: pkg.arn, StorageLocation: pkg.storageLocation }, ctx);
        }
        if (method === "GET") {
          return this.json({ Packages: this.service.listPackages().map(p => ({
            PackageId: p.packageId, PackageName: p.packageName, Arn: p.arn, CreatedTime: p.createdTime,
          })) }, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown Panorama operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
