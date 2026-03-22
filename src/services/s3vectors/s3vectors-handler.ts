import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { S3VectorsService } from "./s3vectors-service";

export class S3VectorsHandler {
  constructor(private service: S3VectorsService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\//, "");
    const method = req.method;

    try {
      const body = method === "POST" || method === "PUT" ? await req.json().catch(() => ({})) : {};

      switch (path) {
        case "CreateVectorBucket": {
          const b = this.service.createVectorBucket(body.vectorBucketName, ctx.region);
          return this.json({ vectorBucketArn: b.vectorBucketArn, vectorBucketName: b.name, creationTime: b.creationTime }, ctx);
        }
        case "GetVectorBucket": {
          const b = this.service.getVectorBucket(body.vectorBucketName);
          return this.json({ vectorBucket: { vectorBucketArn: b.vectorBucketArn, vectorBucketName: b.name, creationTime: b.creationTime, ownerAccountId: "000000000000" } }, ctx);
        }
        case "ListVectorBuckets": {
          const buckets = this.service.listVectorBuckets();
          return this.json({ vectorBuckets: buckets.map(b => ({ vectorBucketArn: b.vectorBucketArn, vectorBucketName: b.name, creationTime: b.creationTime })), nextToken: null }, ctx);
        }
        case "DeleteVectorBucket": {
          this.service.deleteVectorBucket(body.vectorBucketName);
          return this.json({}, ctx);
        }
        case "CreateIndex": {
          const idx = this.service.createIndex(body.vectorBucketName, body.indexName, body.dimension ?? 128, body.distanceMetric ?? "cosine", ctx.region);
          return this.json(idx, ctx);
        }
        case "GetIndex": {
          const idx = this.service.getIndex(body.vectorBucketName, body.indexName);
          return this.json(idx, ctx);
        }
        case "ListIndexes": {
          const indexes = this.service.listIndexes(body.vectorBucketName);
          return this.json({ indexes }, ctx);
        }
        case "PutVectors": {
          const vectors = (body.vectors ?? []).map((v: any) => ({
            key: v.key,
            data: v.data?.float32 ?? v.data ?? [],
            metadata: v.metadata,
          }));
          this.service.putVectors(body.vectorBucketName, body.indexName, vectors);
          return this.json({}, ctx);
        }
        case "GetVectors": {
          const vectors = this.service.getVectors(body.vectorBucketName, body.indexName, body.keys ?? []);
          return this.json({ vectors: vectors.map(v => ({ key: v.key, data: { float32: v.data }, metadata: v.metadata })) }, ctx);
        }
        case "QueryVectors": {
          const queryVector = body.queryVector?.float32 ?? body.queryVector ?? [];
          const results = this.service.queryVectors(body.vectorBucketName, body.indexName, queryVector, body.topK ?? 10);
          return this.json({ vectors: results.map(r => ({ key: r.key, distance: r.distance })) }, ctx);
        }
        case "DeleteVectors": {
          return this.json({}, ctx);
        }
        default:
          // Also try REST-style paths
          return this.handleRestRoute(req, ctx, url.pathname, method, body);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private async handleRestRoute(_req: Request, ctx: RequestContext, path: string, method: string, body: any): Promise<Response> {
    return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown S3Vectors operation: ${method} ${path}`, 400), ctx.requestId);
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
