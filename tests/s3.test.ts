import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteBucketCommand,
  ListBucketsCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutBucketLifecycleConfigurationCommand,
  GetBucketLifecycleConfigurationCommand,
  DeleteBucketLifecycleCommand,
  PutBucketEncryptionCommand,
  GetBucketEncryptionCommand,
  DeleteBucketEncryptionCommand,
  PutBucketVersioningCommand,
  ListObjectVersionsCommand,
  GetObjectAclCommand,
  PutObjectAclCommand,
  PutBucketNotificationConfigurationCommand,
  GetBucketNotificationConfigurationCommand,
  PutBucketWebsiteCommand,
  GetBucketWebsiteCommand,
  DeleteBucketWebsiteCommand,
  PutPublicAccessBlockCommand,
  GetPublicAccessBlockCommand,
  DeletePublicAccessBlockCommand,
  PutBucketLoggingCommand,
  GetBucketLoggingCommand,
  PutObjectLockConfigurationCommand,
  GetObjectLockConfigurationCommand,
  PutObjectRetentionCommand,
  GetObjectRetentionCommand,
  PutObjectLegalHoldCommand,
  GetObjectLegalHoldCommand,
  GetObjectAttributesCommand,
} from "@aws-sdk/client-s3";
import { startServer, stopServer, clientConfig } from "./helpers";

const s3 = new S3Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("S3", () => {
  const bucket = "test-bucket-" + Date.now();

  test("CreateBucket", async () => {
    const res = await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("ListBuckets", async () => {
    const res = await s3.send(new ListBucketsCommand({}));
    expect(res.Buckets?.some((b) => b.Name === bucket)).toBe(true);
  });

  test("PutObject + GetObject", async () => {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: "hello.txt",
      Body: "Hello, tinstack!",
      ContentType: "text/plain",
    }));

    const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: "hello.txt" }));
    const body = await get.Body!.transformToString();
    expect(body).toBe("Hello, tinstack!");
    expect(get.ContentType).toBe("text/plain");
    expect(get.ETag).toBeDefined();
  });

  test("HeadObject", async () => {
    const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: "hello.txt" }));
    expect(res.ContentLength).toBe(16);
    expect(res.ETag).toBeDefined();
  });

  test("ListObjectsV2", async () => {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "dir/file1.txt", Body: "a" }));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "dir/file2.txt", Body: "b" }));

    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "dir/" }));
    expect(res.Contents?.length).toBe(2);
    expect(res.KeyCount).toBe(2);
  });

  test("ListObjectsV2 with delimiter", async () => {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Delimiter: "/" }));
    expect(res.CommonPrefixes?.some((p) => p.Prefix === "dir/")).toBe(true);
  });

  test("CopyObject", async () => {
    await s3.send(new CopyObjectCommand({
      Bucket: bucket,
      Key: "hello-copy.txt",
      CopySource: `${bucket}/hello.txt`,
    }));

    const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: "hello-copy.txt" }));
    const body = await get.Body!.transformToString();
    expect(body).toBe("Hello, tinstack!");
  });

  test("DeleteObject", async () => {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: "hello-copy.txt" }));
    try {
      await s3.send(new GetObjectCommand({ Bucket: bucket, Key: "hello-copy.txt" }));
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.name).toBe("NoSuchKey");
    }
  });

  test("Multipart Upload", async () => {
    const key = "multipart-test.bin";
    const create = await s3.send(new CreateMultipartUploadCommand({
      Bucket: bucket, Key: key, ContentType: "application/octet-stream",
    }));
    const uploadId = create.UploadId!;

    const part1Data = Buffer.alloc(5 * 1024 * 1024, "a");
    const part2Data = Buffer.from("final-chunk");

    const p1 = await s3.send(new UploadPartCommand({
      Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: 1, Body: part1Data,
    }));
    const p2 = await s3.send(new UploadPartCommand({
      Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: 2, Body: part2Data,
    }));

    await s3.send(new CompleteMultipartUploadCommand({
      Bucket: bucket, Key: key, UploadId: uploadId,
      MultipartUpload: {
        Parts: [
          { PartNumber: 1, ETag: p1.ETag },
          { PartNumber: 2, ETag: p2.ETag },
        ],
      },
    }));

    const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const getBody = await get.Body!.transformToByteArray();
    expect(getBody.length).toBe(5 * 1024 * 1024 + 11);
  });

  test("DeleteBucket (non-empty fails)", async () => {
    try {
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("BucketNotEmpty");
    }
  });

  // Lifecycle Configuration
  test("PutBucketLifecycleConfiguration + GetBucketLifecycleConfiguration", async () => {
    await s3.send(new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: "archive-rule",
            Filter: { Prefix: "logs/" },
            Status: "Enabled",
            Transitions: [{ Days: 30, StorageClass: "GLACIER" }],
            Expiration: { Days: 365 },
          },
        ],
      },
    }));

    const res = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
    expect(res.Rules).toBeDefined();
    expect(res.Rules!.length).toBe(1);
    expect(res.Rules![0].ID).toBe("archive-rule");
    expect(res.Rules![0].Status).toBe("Enabled");
    expect(res.Rules![0].Transitions![0].Days).toBe(30);
    expect(res.Rules![0].Transitions![0].StorageClass).toBe("GLACIER");
    expect(res.Rules![0].Expiration!.Days).toBe(365);
  });

  test("DeleteBucketLifecycle", async () => {
    await s3.send(new DeleteBucketLifecycleCommand({ Bucket: bucket }));
    try {
      await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("NoSuchLifecycleConfiguration");
    }
  });

  // Encryption Configuration
  test("PutBucketEncryption + GetBucketEncryption", async () => {
    await s3.send(new PutBucketEncryptionCommand({
      Bucket: bucket,
      ServerSideEncryptionConfiguration: {
        Rules: [
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: "aws:kms",
              KMSMasterKeyID: "arn:aws:kms:us-east-1:000000000000:key/test-key",
            },
            BucketKeyEnabled: true,
          },
        ],
      },
    }));

    const res = await s3.send(new GetBucketEncryptionCommand({ Bucket: bucket }));
    expect(res.ServerSideEncryptionConfiguration).toBeDefined();
    const rules = res.ServerSideEncryptionConfiguration!.Rules!;
    expect(rules.length).toBe(1);
    expect(rules[0].ApplyServerSideEncryptionByDefault!.SSEAlgorithm).toBe("aws:kms");
    expect(rules[0].ApplyServerSideEncryptionByDefault!.KMSMasterKeyID).toBe("arn:aws:kms:us-east-1:000000000000:key/test-key");
    expect(rules[0].BucketKeyEnabled).toBe(true);
  });

  test("DeleteBucketEncryption returns default AES256", async () => {
    await s3.send(new DeleteBucketEncryptionCommand({ Bucket: bucket }));
    // After deletion, AWS returns default AES256 for new buckets; we do the same
    const res = await s3.send(new GetBucketEncryptionCommand({ Bucket: bucket }));
    const rules = res.ServerSideEncryptionConfiguration!.Rules!;
    expect(rules[0].ApplyServerSideEncryptionByDefault!.SSEAlgorithm).toBe("AES256");
  });

  // List Object Versions
  test("ListObjectVersions with versioned bucket", async () => {
    const vBucket = "versioned-bucket-" + Date.now();
    await s3.send(new CreateBucketCommand({ Bucket: vBucket }));
    await s3.send(new PutBucketVersioningCommand({
      Bucket: vBucket,
      VersioningConfiguration: { Status: "Enabled" },
    }));

    // Put same key twice to create two versions
    await s3.send(new PutObjectCommand({ Bucket: vBucket, Key: "doc.txt", Body: "v1" }));
    await s3.send(new PutObjectCommand({ Bucket: vBucket, Key: "doc.txt", Body: "v2" }));
    await s3.send(new PutObjectCommand({ Bucket: vBucket, Key: "other.txt", Body: "x" }));

    const res = await s3.send(new ListObjectVersionsCommand({ Bucket: vBucket }));
    expect(res.Versions).toBeDefined();
    // 2 versions of doc.txt + 1 version of other.txt = 3
    expect(res.Versions!.length).toBe(3);

    const docVersions = res.Versions!.filter(v => v.Key === "doc.txt");
    expect(docVersions.length).toBe(2);
    // Exactly one should be latest
    expect(docVersions.filter(v => v.IsLatest).length).toBe(1);
    // Each should have a unique VersionId
    expect(docVersions[0].VersionId).not.toBe(docVersions[1].VersionId);
  });

  // Object ACL
  test("GetObjectAcl returns default ACL", async () => {
    const res = await s3.send(new GetObjectAclCommand({ Bucket: bucket, Key: "hello.txt" }));
    expect(res.Owner).toBeDefined();
    expect(res.Grants).toBeDefined();
    expect(res.Grants!.length).toBeGreaterThanOrEqual(1);
    expect(res.Grants![0].Permission).toBe("FULL_CONTROL");
  });

  test("PutObjectAcl accepts canned ACL", async () => {
    const res = await s3.send(new PutObjectAclCommand({
      Bucket: bucket,
      Key: "hello.txt",
      ACL: "public-read",
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  // Notification Configuration
  test("PutBucketNotificationConfiguration + GetBucketNotificationConfiguration", async () => {
    await s3.send(new PutBucketNotificationConfigurationCommand({
      Bucket: bucket,
      NotificationConfiguration: {
        QueueConfigurations: [
          {
            Id: "queue-notify",
            QueueArn: "arn:aws:sqs:us-east-1:000000000000:my-queue",
            Events: ["s3:ObjectCreated:*"],
          },
        ],
      },
    }));

    const res = await s3.send(new GetBucketNotificationConfigurationCommand({ Bucket: bucket }));
    expect(res.QueueConfigurations).toBeDefined();
    expect(res.QueueConfigurations!.length).toBe(1);
    expect(res.QueueConfigurations![0].QueueArn).toBe("arn:aws:sqs:us-east-1:000000000000:my-queue");
    expect(res.QueueConfigurations![0].Events).toContain("s3:ObjectCreated:*");
  });

  test("PutBucketWebsite + GetBucketWebsite", async () => {
    await s3.send(new PutBucketWebsiteCommand({
      Bucket: bucket,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: "index.html" },
        ErrorDocument: { Key: "error.html" },
      },
    }));

    const res = await s3.send(new GetBucketWebsiteCommand({ Bucket: bucket }));
    expect(res.IndexDocument?.Suffix).toBe("index.html");
    expect(res.ErrorDocument?.Key).toBe("error.html");
  });

  test("DeleteBucketWebsite", async () => {
    await s3.send(new DeleteBucketWebsiteCommand({ Bucket: bucket }));
    try {
      await s3.send(new GetBucketWebsiteCommand({ Bucket: bucket }));
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.name).toContain("NoSuchWebsiteConfiguration");
    }
  });

  test("PutPublicAccessBlock + GetPublicAccessBlock", async () => {
    await s3.send(new PutPublicAccessBlockCommand({
      Bucket: bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false,
      },
    }));

    const res = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucket }));
    expect(res.PublicAccessBlockConfiguration?.BlockPublicAcls).toBe(true);
    expect(res.PublicAccessBlockConfiguration?.IgnorePublicAcls).toBe(true);
    expect(res.PublicAccessBlockConfiguration?.BlockPublicPolicy).toBe(false);
    expect(res.PublicAccessBlockConfiguration?.RestrictPublicBuckets).toBe(false);
  });

  test("DeletePublicAccessBlock", async () => {
    await s3.send(new DeletePublicAccessBlockCommand({ Bucket: bucket }));
    // After delete, GET should return defaults (all false)
    const res = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucket }));
    expect(res.PublicAccessBlockConfiguration?.BlockPublicAcls).toBe(false);
  });

  test("PutBucketLogging + GetBucketLogging", async () => {
    await s3.send(new PutBucketLoggingCommand({
      Bucket: bucket,
      BucketLoggingStatus: {
        LoggingEnabled: {
          TargetBucket: bucket,
          TargetPrefix: "logs/",
        },
      },
    }));

    const res = await s3.send(new GetBucketLoggingCommand({ Bucket: bucket }));
    expect(res.LoggingEnabled).toBeDefined();
    expect(res.LoggingEnabled!.TargetBucket).toBe(bucket);
    expect(res.LoggingEnabled!.TargetPrefix).toBe("logs/");
  });

  test("PutBucketLogging disable", async () => {
    await s3.send(new PutBucketLoggingCommand({
      Bucket: bucket,
      BucketLoggingStatus: {},
    }));

    const res = await s3.send(new GetBucketLoggingCommand({ Bucket: bucket }));
    expect(res.LoggingEnabled).toBeUndefined();
  });

  // --- Object Lock ---

  test("PutObjectLockConfiguration + GetObjectLockConfiguration", async () => {
    await s3.send(new PutObjectLockConfigurationCommand({
      Bucket: bucket,
      ObjectLockConfiguration: {
        ObjectLockEnabled: "Enabled",
        Rule: {
          DefaultRetention: {
            Mode: "GOVERNANCE",
            Days: 30,
          },
        },
      },
    }));

    const res = await s3.send(new GetObjectLockConfigurationCommand({ Bucket: bucket }));
    expect(res.ObjectLockConfiguration?.ObjectLockEnabled).toBe("Enabled");
    expect(res.ObjectLockConfiguration?.Rule?.DefaultRetention?.Mode).toBe("GOVERNANCE");
    expect(res.ObjectLockConfiguration?.Rule?.DefaultRetention?.Days).toBe(30);
  });

  // --- Object Retention ---

  test("PutObjectRetention + GetObjectRetention", async () => {
    const retainDate = new Date(Date.now() + 86400000 * 30);
    await s3.send(new PutObjectRetentionCommand({
      Bucket: bucket,
      Key: "hello.txt",
      Retention: {
        Mode: "GOVERNANCE",
        RetainUntilDate: retainDate,
      },
    }));

    const res = await s3.send(new GetObjectRetentionCommand({
      Bucket: bucket,
      Key: "hello.txt",
    }));
    expect(res.Retention?.Mode).toBe("GOVERNANCE");
    expect(res.Retention?.RetainUntilDate).toBeDefined();
  });

  // --- Object Legal Hold ---

  test("PutObjectLegalHold + GetObjectLegalHold", async () => {
    await s3.send(new PutObjectLegalHoldCommand({
      Bucket: bucket,
      Key: "hello.txt",
      LegalHold: { Status: "ON" },
    }));

    const res = await s3.send(new GetObjectLegalHoldCommand({
      Bucket: bucket,
      Key: "hello.txt",
    }));
    expect(res.LegalHold?.Status).toBe("ON");

    // Turn off
    await s3.send(new PutObjectLegalHoldCommand({
      Bucket: bucket,
      Key: "hello.txt",
      LegalHold: { Status: "OFF" },
    }));

    const res2 = await s3.send(new GetObjectLegalHoldCommand({
      Bucket: bucket,
      Key: "hello.txt",
    }));
    expect(res2.LegalHold?.Status).toBe("OFF");
  });

  // --- GetObjectAttributes ---

  test("GetObjectAttributes", async () => {
    const res = await s3.send(new GetObjectAttributesCommand({
      Bucket: bucket,
      Key: "hello.txt",
      ObjectAttributes: ["ETag", "StorageClass", "ObjectSize"],
    }));
    expect(res.ETag).toBeDefined();
    expect(res.StorageClass).toBe("STANDARD");
    expect(res.ObjectSize).toBeGreaterThan(0);
  });

  // --- S3 Versioning: Delete Markers and VersionId ---

  describe("Versioned bucket delete markers", () => {
    const vBucket = "versioning-delete-test-" + Date.now();

    test("setup versioned bucket", async () => {
      await s3.send(new CreateBucketCommand({ Bucket: vBucket }));
      await s3.send(new PutBucketVersioningCommand({
        Bucket: vBucket,
        VersioningConfiguration: { Status: "Enabled" },
      }));
    });

    test("delete without versionId creates delete marker, GET returns 404", async () => {
      await s3.send(new PutObjectCommand({ Bucket: vBucket, Key: "file.txt", Body: "content" }));

      // Verify object exists
      const get1 = await s3.send(new GetObjectCommand({ Bucket: vBucket, Key: "file.txt" }));
      expect(await get1.Body!.transformToString()).toBe("content");

      // Delete without versionId
      const del = await s3.send(new DeleteObjectCommand({ Bucket: vBucket, Key: "file.txt" }));
      expect(del.DeleteMarker).toBe(true);
      expect(del.VersionId).toBeDefined();

      // GET should now return 404
      try {
        await s3.send(new GetObjectCommand({ Bucket: vBucket, Key: "file.txt" }));
        expect(true).toBe(false); // should not reach
      } catch (e: any) {
        expect(e.name).toBe("NoSuchKey");
      }
    });

    test("get specific version by versionId", async () => {
      await s3.send(new PutObjectCommand({ Bucket: vBucket, Key: "versioned.txt", Body: "v1" }));
      await s3.send(new PutObjectCommand({ Bucket: vBucket, Key: "versioned.txt", Body: "v2" }));

      // List versions to get versionIds
      const versions = await s3.send(new ListObjectVersionsCommand({
        Bucket: vBucket, Prefix: "versioned.txt",
      }));
      const allVersions = versions.Versions!.filter(v => v.Key === "versioned.txt");
      expect(allVersions.length).toBe(2);

      // Get the older version (isLatest=false)
      const olderVersion = allVersions.find(v => !v.IsLatest)!;
      const get = await s3.send(new GetObjectCommand({
        Bucket: vBucket, Key: "versioned.txt", VersionId: olderVersion.VersionId,
      }));
      const body = await get.Body!.transformToString();
      expect(body).toBe("v1");

      // Get the latest version
      const latestVersion = allVersions.find(v => v.IsLatest)!;
      const get2 = await s3.send(new GetObjectCommand({
        Bucket: vBucket, Key: "versioned.txt", VersionId: latestVersion.VersionId,
      }));
      const body2 = await get2.Body!.transformToString();
      expect(body2).toBe("v2");
    });

    test("delete with versionId removes specific version", async () => {
      await s3.send(new PutObjectCommand({ Bucket: vBucket, Key: "del-ver.txt", Body: "v1" }));
      await s3.send(new PutObjectCommand({ Bucket: vBucket, Key: "del-ver.txt", Body: "v2" }));

      const versions = await s3.send(new ListObjectVersionsCommand({
        Bucket: vBucket, Prefix: "del-ver.txt",
      }));
      const allVersions = versions.Versions!.filter(v => v.Key === "del-ver.txt");
      const olderVersion = allVersions.find(v => !v.IsLatest)!;

      // Delete the older version
      await s3.send(new DeleteObjectCommand({
        Bucket: vBucket, Key: "del-ver.txt", VersionId: olderVersion.VersionId,
      }));

      // Should still have 1 version
      const versions2 = await s3.send(new ListObjectVersionsCommand({
        Bucket: vBucket, Prefix: "del-ver.txt",
      }));
      const remaining = versions2.Versions!.filter(v => v.Key === "del-ver.txt");
      expect(remaining.length).toBe(1);
      expect(remaining[0].IsLatest).toBe(true);

      // Object should still be accessible
      const get = await s3.send(new GetObjectCommand({ Bucket: vBucket, Key: "del-ver.txt" }));
      const body = await get.Body!.transformToString();
      expect(body).toBe("v2");
    });

    test("delete marker deletion undeletes object", async () => {
      await s3.send(new PutObjectCommand({ Bucket: vBucket, Key: "undelete.txt", Body: "alive" }));

      // Create a delete marker
      const del = await s3.send(new DeleteObjectCommand({ Bucket: vBucket, Key: "undelete.txt" }));
      expect(del.DeleteMarker).toBe(true);
      const deleteMarkerId = del.VersionId!;

      // Verify it's "deleted"
      try {
        await s3.send(new GetObjectCommand({ Bucket: vBucket, Key: "undelete.txt" }));
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.name).toBe("NoSuchKey");
      }

      // Remove the delete marker by deleting with its versionId
      const del2 = await s3.send(new DeleteObjectCommand({
        Bucket: vBucket, Key: "undelete.txt", VersionId: deleteMarkerId,
      }));
      expect(del2.DeleteMarker).toBe(true);

      // Object should be accessible again
      const get = await s3.send(new GetObjectCommand({ Bucket: vBucket, Key: "undelete.txt" }));
      const body = await get.Body!.transformToString();
      expect(body).toBe("alive");
    });
  });
});
