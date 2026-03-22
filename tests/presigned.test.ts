import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { startServer, stopServer, clientConfig } from "./helpers";

const s3 = new S3Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("S3 Presigned URLs", () => {
  const bucket = "presign-test-" + Date.now();

  test("Presigned PUT + GET", async () => {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));

    // Generate presigned PUT URL
    const putUrl = await getSignedUrl(s3, new PutObjectCommand({
      Bucket: bucket,
      Key: "presigned.txt",
      ContentType: "text/plain",
    }), { expiresIn: 3600 });

    expect(putUrl).toContain("X-Amz-Signature");

    // Use presigned URL to upload
    const putRes = await fetch(putUrl, {
      method: "PUT",
      body: "Presigned upload works!",
      headers: { "Content-Type": "text/plain" },
    });
    expect(putRes.status).toBe(200);

    // Generate presigned GET URL
    const getUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: bucket,
      Key: "presigned.txt",
    }), { expiresIn: 3600 });

    // Use presigned URL to download
    const getRes = await fetch(getUrl);
    expect(getRes.status).toBe(200);
    const body = await getRes.text();
    expect(body).toBe("Presigned upload works!");
  });
});
