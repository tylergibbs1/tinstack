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
});
