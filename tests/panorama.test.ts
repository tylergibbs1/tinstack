import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  PanoramaClient,
  CreatePackageCommand,
  DescribePackageCommand,
  ListPackagesCommand,
  DeletePackageCommand,
  ProvisionDeviceCommand,
  ListDevicesCommand,
} from "@aws-sdk/client-panorama";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new PanoramaClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Panorama", () => {
  let packageId: string;

  test("CreatePackage", async () => {
    const res = await client.send(new CreatePackageCommand({ PackageName: "test-pkg" }));
    expect(res.PackageId).toBeDefined();
    expect(res.Arn).toContain("panorama");
    packageId = res.PackageId!;
  });

  test("DescribePackage", async () => {
    const res = await client.send(new DescribePackageCommand({ PackageId: packageId }));
    expect(res.PackageName).toBe("test-pkg");
  });

  test("ListPackages", async () => {
    const res = await client.send(new ListPackagesCommand({}));
    expect(res.Packages).toBeDefined();
    expect(res.Packages!.length).toBeGreaterThanOrEqual(1);
  });

  test("ProvisionDevice + ListDevices", async () => {
    const res = await client.send(new ProvisionDeviceCommand({ Name: "test-device" }));
    expect(res.DeviceId).toBeDefined();

    const list = await client.send(new ListDevicesCommand({}));
    expect(list.Devices).toBeDefined();
    expect(list.Devices!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeletePackage", async () => {
    await client.send(new DeletePackageCommand({ PackageId: packageId }));
    const res = await client.send(new ListPackagesCommand({}));
    expect(res.Packages!.some((p: any) => p.packageId === packageId)).toBe(false);
  });
});
