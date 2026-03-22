import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CloudFrontClient,
  CreateDistributionCommand,
  GetDistributionCommand,
  ListDistributionsCommand,
  UpdateDistributionCommand,
  DeleteDistributionCommand,
  CreateInvalidationCommand,
  GetInvalidationCommand,
  ListInvalidationsCommand,
} from "@aws-sdk/client-cloudfront";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new CloudFrontClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("CloudFront", () => {
  let distributionId: string;
  let etag: string;
  let invalidationId: string;

  test("CreateDistribution", async () => {
    const res = await client.send(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "test-ref-1",
          Comment: "Test distribution",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "my-origin",
                DomainName: "my-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "my-origin",
            ViewerProtocolPolicy: "redirect-to-https",
            MinTTL: 0,
            ForwardedValues: {
              QueryString: false,
              Cookies: { Forward: "none" },
            },
          },
        },
      }),
    );
    expect(res.Distribution).toBeDefined();
    expect(res.Distribution!.Id).toBeDefined();
    expect(res.Distribution!.DomainName).toContain(".cloudfront.net");
    expect(res.Distribution!.Status).toBe("Deployed");
    expect(res.ETag).toBeDefined();

    distributionId = res.Distribution!.Id!;
    etag = res.ETag!;
  });

  test("CreateDistribution — duplicate CallerReference", async () => {
    try {
      await client.send(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "test-ref-1",
            Comment: "Duplicate",
            Enabled: true,
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: "origin",
                  DomainName: "example.com",
                  S3OriginConfig: { OriginAccessIdentity: "" },
                },
              ],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "origin",
              ViewerProtocolPolicy: "allow-all",
              MinTTL: 0,
              ForwardedValues: {
                QueryString: false,
                Cookies: { Forward: "none" },
              },
            },
          },
        }),
      );
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("DistributionAlreadyExists");
    }
  });

  test("GetDistribution", async () => {
    const res = await client.send(
      new GetDistributionCommand({ Id: distributionId }),
    );
    expect(res.Distribution).toBeDefined();
    expect(res.Distribution!.Id).toBe(distributionId);
    expect(res.Distribution!.DistributionConfig?.Comment).toBe("Test distribution");
    expect(res.Distribution!.DistributionConfig?.Enabled).toBe(true);
    expect(res.ETag).toBeDefined();
    etag = res.ETag!;
  });

  test("GetDistribution — not found", async () => {
    try {
      await client.send(new GetDistributionCommand({ Id: "ENOTEXIST12345" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("NoSuchDistribution");
    }
  });

  test("ListDistributions", async () => {
    const res = await client.send(new ListDistributionsCommand({}));
    expect(res.DistributionList).toBeDefined();
    expect(res.DistributionList!.Items).toBeDefined();
    expect(res.DistributionList!.Items!.length).toBeGreaterThanOrEqual(1);
    expect(res.DistributionList!.Items!.some((d) => d.Id === distributionId)).toBe(true);
  });

  test("UpdateDistribution", async () => {
    const res = await client.send(
      new UpdateDistributionCommand({
        Id: distributionId,
        IfMatch: etag,
        DistributionConfig: {
          CallerReference: "test-ref-1",
          Comment: "Updated distribution",
          Enabled: false,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "my-origin",
                DomainName: "my-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "my-origin",
            ViewerProtocolPolicy: "https-only",
            MinTTL: 0,
            ForwardedValues: {
              QueryString: false,
              Cookies: { Forward: "none" },
            },
          },
        },
      }),
    );
    expect(res.Distribution).toBeDefined();
    expect(res.Distribution!.DistributionConfig?.Comment).toBe("Updated distribution");
    expect(res.Distribution!.DistributionConfig?.Enabled).toBe(false);
    etag = res.ETag!;
  });

  test("CreateInvalidation", async () => {
    const res = await client.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: "inv-ref-1",
          Paths: {
            Quantity: 2,
            Items: ["/index.html", "/images/*"],
          },
        },
      }),
    );
    expect(res.Invalidation).toBeDefined();
    expect(res.Invalidation!.Id).toBeDefined();
    expect(res.Invalidation!.Status).toBe("Completed");
    invalidationId = res.Invalidation!.Id!;
  });

  test("GetInvalidation", async () => {
    const res = await client.send(
      new GetInvalidationCommand({
        DistributionId: distributionId,
        Id: invalidationId,
      }),
    );
    expect(res.Invalidation).toBeDefined();
    expect(res.Invalidation!.Id).toBe(invalidationId);
    expect(res.Invalidation!.InvalidationBatch?.CallerReference).toBe("inv-ref-1");
    expect(res.Invalidation!.InvalidationBatch?.Paths?.Items).toContain("/index.html");
    expect(res.Invalidation!.InvalidationBatch?.Paths?.Items).toContain("/images/*");
  });

  test("ListInvalidations", async () => {
    const res = await client.send(
      new ListInvalidationsCommand({ DistributionId: distributionId }),
    );
    expect(res.InvalidationList).toBeDefined();
    expect(res.InvalidationList!.Items!.length).toBeGreaterThanOrEqual(1);
    expect(res.InvalidationList!.Items!.some((i) => i.Id === invalidationId)).toBe(true);
  });

  test("DeleteDistribution — must be disabled", async () => {
    // Distribution is now disabled from UpdateDistribution test, so this should succeed
    await client.send(
      new DeleteDistributionCommand({ Id: distributionId, IfMatch: etag }),
    );

    try {
      await client.send(new GetDistributionCommand({ Id: distributionId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("NoSuchDistribution");
    }
  });

  test("DeleteDistribution — enabled distribution fails", async () => {
    const create = await client.send(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "test-ref-delete-fail",
          Comment: "Cannot delete while enabled",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "origin",
                DomainName: "example.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "origin",
            ViewerProtocolPolicy: "allow-all",
            MinTTL: 0,
            ForwardedValues: {
              QueryString: false,
              Cookies: { Forward: "none" },
            },
          },
        },
      }),
    );

    try {
      await client.send(
        new DeleteDistributionCommand({
          Id: create.Distribution!.Id!,
          IfMatch: create.ETag!,
        }),
      );
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("DistributionNotDisabled");
    }
  });
});
