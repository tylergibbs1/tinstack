import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { MediaStoreDataService } from "./mediastore-data-service";

export class MediaStoreDataHandler {
  constructor(private service: MediaStoreDataService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // PUT /{path+} — PutObject
      if (method === "PUT") {
        const data = new Uint8Array(await req.arrayBuffer());
        const contentType = req.headers.get("content-type") ?? "application/octet-stream";
        const obj = this.service.putObject(path, data, contentType);
        return new Response(null, { status: 200, headers: { "Content-Type": obj.contentType, ETag: obj.eTag, "x-amzn-RequestId": ctx.requestId } });
      }

      // GET /{path+} — GetObject
      if (method === "GET" && path !== "/") {
        const obj = this.service.getObject(path);
        return new Response(obj.data, { headers: { "Content-Type": obj.contentType, ETag: obj.eTag, "Content-Length": String(obj.contentLength), "x-amzn-RequestId": ctx.requestId } });
      }

      // DELETE /{path+} — DeleteObject
      if (method === "DELETE") {
        this.service.deleteObject(path);
        return new Response(null, { status: 200, headers: { "x-amzn-RequestId": ctx.requestId } });
      }

      // HEAD /{path+} — DescribeObject
      if (method === "HEAD") {
        const meta = this.service.describeObject(path);
        return new Response(null, { headers: { "Content-Type": meta.contentType, "Content-Length": String(meta.contentLength), ETag: meta.eTag, "x-amzn-RequestId": ctx.requestId } });
      }

      // GET / — ListItems
      if (method === "GET" && path === "/") {
        const items = this.service.listItems(url.searchParams.get("Path") ?? undefined);
        return this.json({ Items: items.map((i) => ({ Name: i.path, Type: "OBJECT", ContentType: i.contentType, ContentLength: i.contentLength, LastModified: i.lastModified, ETag: i.eTag })) }, ctx);
      }

      return jsonErrorResponse(new AwsError("NotFound", "Route not found", 404), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
