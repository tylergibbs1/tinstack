import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { S3TablesService } from "./s3tables-service";

export class S3TablesHandler {
  constructor(private service: S3TablesService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // GetTable: GET /get-table?tableBucketARN=...&namespace=...&name=...
      if (path === "/get-table" && method === "GET") {
        const bucketARN = decodeURIComponent(url.searchParams.get("tableBucketARN") ?? "");
        const ns = url.searchParams.get("namespace") ?? "default";
        const name = url.searchParams.get("name") ?? "";
        return this.json(this.service.getTable(bucketARN, ns, name), ctx);
      }

      // Table operations: /tables/{tableBucketARN}/{namespace}/{tableName}
      const tableMatch = path.match(/^\/tables\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if (tableMatch) {
        const [, bucketARN, ns, name] = tableMatch.map(decodeURIComponent);
        if (method === "GET") return this.json(this.service.getTable(bucketARN, ns, name), ctx);
        if (method === "DELETE") { this.service.deleteTable(bucketARN, ns, name); return this.json({}, ctx, 204); }
      }

      // Create table / List tables: /tables/{tableBucketARN}/{namespace}
      // SDK sends PUT to create, GET to list
      const tablesNsMatch = path.match(/^\/tables\/([^/]+)\/([^/]+)$/);
      if (tablesNsMatch) {
        const [, bucketARN, ns] = tablesNsMatch.map(decodeURIComponent);
        if (method === "PUT") {
          const body = await req.json();
          const table = this.service.createTable(bucketARN, ns, body.name, body.format ?? "ICEBERG", ctx.region);
          return this.json(table, ctx);
        }
        if (method === "GET") {
          return this.json({ tables: this.service.listTables(bucketARN, ns) }, ctx);
        }
      }

      // List tables without namespace: /tables/{tableBucketARN}
      const tablesMatch = path.match(/^\/tables\/([^/]+)$/);
      if (tablesMatch) {
        const bucketARN = decodeURIComponent(tablesMatch[1]);
        if (method === "GET") {
          const ns = url.searchParams.get("namespace") ?? undefined;
          return this.json({ tables: this.service.listTables(bucketARN, ns) }, ctx);
        }
      }

      // Table bucket by ARN: /buckets/{tableBucketARN}
      const bucketArnMatch = path.match(/^\/buckets\/(.+)$/);
      if (bucketArnMatch) {
        const arn = decodeURIComponent(bucketArnMatch[1]);
        if (method === "GET") return this.json(this.service.getTableBucket(arn), ctx);
        if (method === "DELETE") { this.service.deleteTableBucket(arn); return this.json({}, ctx); }
      }

      // Create/List table buckets: /buckets
      if (path === "/buckets") {
        if (method === "PUT") {
          const body = await req.json();
          const tb = this.service.createTableBucket(body.name, ctx.region);
          return this.json({ arn: tb.arn }, ctx);
        }
        if (method === "GET") {
          return this.json({ tableBuckets: this.service.listTableBuckets() }, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown S3Tables operation: ${method} ${path}`, 400), ctx.requestId);
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
