import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  S3ControlClient,
  CreateAccessPointCommand,
  GetAccessPointCommand,
  ListAccessPointsCommand,
  DeleteAccessPointCommand,
  PutPublicAccessBlockCommand,
  GetPublicAccessBlockCommand,
  DeletePublicAccessBlockCommand,
  PutStorageLensConfigurationCommand,
  GetStorageLensConfigurationCommand,
  ListStorageLensConfigurationsCommand,
  DeleteStorageLensConfigurationCommand,
} from "@aws-sdk/client-s3-control";
import { startServer, stopServer, clientConfig } from "./helpers";

const s3control = new S3ControlClient({
  ...clientConfig,
  // S3 Control needs an account ID header
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("S3 Control", () => {
  const accountId = "000000000000";

  test("CreateAccessPoint", async () => {
    const res = await s3control.send(new CreateAccessPointCommand({
      AccountId: accountId,
      Name: "test-access-point",
      Bucket: "my-bucket",
    }));
    expect(res.AccessPointArn).toBeDefined();
    expect(res.Alias).toBeDefined();
  });

  test("GetAccessPoint", async () => {
    const res = await s3control.send(new GetAccessPointCommand({
      AccountId: accountId,
      Name: "test-access-point",
    }));
    expect(res.Name).toBe("test-access-point");
    expect(res.Bucket).toBe("my-bucket");
    expect(res.AccessPointArn).toBeDefined();
    expect(res.NetworkOrigin).toBe("Internet");
  });

  test("ListAccessPoints", async () => {
    const res = await s3control.send(new ListAccessPointsCommand({
      AccountId: accountId,
    }));
    expect(res.AccessPointList).toBeDefined();
    expect(res.AccessPointList!.length).toBeGreaterThanOrEqual(1);
    const found = res.AccessPointList!.find((ap) => ap.Name === "test-access-point");
    expect(found).toBeDefined();
  });

  test("CreateAccessPoint - duplicate", async () => {
    await expect(
      s3control.send(new CreateAccessPointCommand({
        AccountId: accountId,
        Name: "test-access-point",
        Bucket: "other-bucket",
      })),
    ).rejects.toThrow();
  });

  test("DeleteAccessPoint", async () => {
    await s3control.send(new DeleteAccessPointCommand({
      AccountId: accountId,
      Name: "test-access-point",
    }));
    await expect(
      s3control.send(new GetAccessPointCommand({
        AccountId: accountId,
        Name: "test-access-point",
      })),
    ).rejects.toThrow();
  });

  // --- Public Access Block ---

  test("PutPublicAccessBlock", async () => {
    await s3control.send(new PutPublicAccessBlockCommand({
      AccountId: accountId,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
    }));
  });

  test("GetPublicAccessBlock", async () => {
    const res = await s3control.send(new GetPublicAccessBlockCommand({
      AccountId: accountId,
    }));
    expect(res.PublicAccessBlockConfiguration).toBeDefined();
    expect(res.PublicAccessBlockConfiguration!.BlockPublicAcls).toBe(true);
    expect(res.PublicAccessBlockConfiguration!.IgnorePublicAcls).toBe(true);
    expect(res.PublicAccessBlockConfiguration!.BlockPublicPolicy).toBe(true);
    expect(res.PublicAccessBlockConfiguration!.RestrictPublicBuckets).toBe(true);
  });

  test("DeletePublicAccessBlock", async () => {
    await s3control.send(new DeletePublicAccessBlockCommand({
      AccountId: accountId,
    }));
    await expect(
      s3control.send(new GetPublicAccessBlockCommand({ AccountId: accountId })),
    ).rejects.toThrow();
  });

  // --- Storage Lens ---

  test("PutStorageLensConfiguration", async () => {
    await s3control.send(new PutStorageLensConfigurationCommand({
      AccountId: accountId,
      ConfigId: "test-lens",
      StorageLensConfiguration: {
        Id: "test-lens",
        IsEnabled: true,
        AccountLevel: {
          BucketLevel: {},
        },
      },
    }));
  });

  test("GetStorageLensConfiguration", async () => {
    const res = await s3control.send(new GetStorageLensConfigurationCommand({
      AccountId: accountId,
      ConfigId: "test-lens",
    }));
    expect(res.StorageLensConfiguration).toBeDefined();
    expect(res.StorageLensConfiguration!.Id).toBe("test-lens");
    expect(res.StorageLensConfiguration!.IsEnabled).toBe(true);
    expect(res.StorageLensConfiguration!.StorageLensArn).toBeDefined();
  });

  test("ListStorageLensConfigurations", async () => {
    const res = await s3control.send(new ListStorageLensConfigurationsCommand({
      AccountId: accountId,
    }));
    expect(res.StorageLensConfigurationList).toBeDefined();
    expect(res.StorageLensConfigurationList!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteStorageLensConfiguration", async () => {
    await s3control.send(new DeleteStorageLensConfigurationCommand({
      AccountId: accountId,
      ConfigId: "test-lens",
    }));
    await expect(
      s3control.send(new GetStorageLensConfigurationCommand({
        AccountId: accountId,
        ConfigId: "test-lens",
      })),
    ).rejects.toThrow();
  });

  test("DeleteStorageLensConfiguration - not found", async () => {
    await expect(
      s3control.send(new DeleteStorageLensConfigurationCommand({
        AccountId: accountId,
        ConfigId: "nonexistent",
      })),
    ).rejects.toThrow();
  });
});
