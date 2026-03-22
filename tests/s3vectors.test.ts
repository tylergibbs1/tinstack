import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  S3VectorsClient,
  CreateVectorBucketCommand,
  GetVectorBucketCommand,
  ListVectorBucketsCommand,
  DeleteVectorBucketCommand,
  CreateIndexCommand,
  ListIndexesCommand,
  PutVectorsCommand,
  GetVectorsCommand,
  QueryVectorsCommand,
} from "@aws-sdk/client-s3vectors";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new S3VectorsClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("S3Vectors", () => {
  const bucketName = "test-vector-bucket";
  const indexName = "test-index";

  test("CreateVectorBucket", async () => {
    const res = await client.send(new CreateVectorBucketCommand({ vectorBucketName: bucketName }));
    expect(res.vectorBucketArn).toBeDefined();
  });

  test("GetVectorBucket", async () => {
    const res = await client.send(new GetVectorBucketCommand({ vectorBucketName: bucketName }));
    expect(res.vectorBucket).toBeDefined();
    expect(res.vectorBucket!.vectorBucketName).toBe(bucketName);
  });

  test("ListVectorBuckets", async () => {
    const res = await client.send(new ListVectorBucketsCommand({}));
    expect(res.vectorBuckets).toBeDefined();
    expect(res.vectorBuckets!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateIndex + PutVectors + QueryVectors", async () => {
    await client.send(new CreateIndexCommand({
      vectorBucketName: bucketName,
      indexName,
      dimension: 3,
      distanceMetric: "cosine",
    }));

    const indexes = await client.send(new ListIndexesCommand({ vectorBucketName: bucketName }));
    expect(indexes.indexes!.length).toBeGreaterThanOrEqual(1);

    await client.send(new PutVectorsCommand({
      vectorBucketName: bucketName,
      indexName,
      vectors: [
        { key: "vec1", data: { float32: [1.0, 0.0, 0.0] } },
        { key: "vec2", data: { float32: [0.0, 1.0, 0.0] } },
      ],
    }));

    const queryRes = await client.send(new QueryVectorsCommand({
      vectorBucketName: bucketName,
      indexName,
      queryVector: { float32: [1.0, 0.0, 0.0] },
      topK: 2,
    }));
    expect(queryRes.vectors).toBeDefined();
    expect(queryRes.vectors!.length).toBeLessThanOrEqual(2);
  });

  test("DeleteVectorBucket", async () => {
    await client.send(new DeleteVectorBucketCommand({ vectorBucketName: bucketName }));
    const res = await client.send(new ListVectorBucketsCommand({}));
    expect(res.vectorBuckets!.some((b: any) => b.name === bucketName)).toBe(false);
  });
});
