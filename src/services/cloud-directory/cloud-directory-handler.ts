import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CloudDirectoryService } from "./cloud-directory-service";

export class CloudDirectoryHandler {
  constructor(private service: CloudDirectoryService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // PUT /amazonclouddirectory/2017-01-11/schema/create — CreateSchema
      if (path === "/amazonclouddirectory/2017-01-11/schema/create" && method === "PUT") {
        const body = await req.json();
        const schema = this.service.createSchema(body.Name);
        return this.json({ SchemaArn: schema.schemaArn }, ctx);
      }

      // POST /amazonclouddirectory/2017-01-11/schema/development — ListDevelopmentSchemaArns
      if (path === "/amazonclouddirectory/2017-01-11/schema/development" && method === "POST") {
        return this.json({ SchemaArns: this.service.listSchemas().map((s) => s.schemaArn) }, ctx);
      }

      // PUT /amazonclouddirectory/2017-01-11/directory/create — CreateDirectory
      if (path === "/amazonclouddirectory/2017-01-11/directory/create" && method === "PUT") {
        const body = await req.json();
        const schemaArn = req.headers.get("x-amz-data-partition") ?? body.SchemaArn ?? "";
        const dir = this.service.createDirectory(body.Name, schemaArn);
        return this.json({ DirectoryArn: dir.directoryArn, Name: dir.name, ObjectIdentifier: crypto.randomUUID(), AppliedSchemaArn: schemaArn }, ctx);
      }

      // POST /amazonclouddirectory/2017-01-11/directory/list — ListDirectories
      if (path === "/amazonclouddirectory/2017-01-11/directory/list" && method === "POST") {
        return this.json({ Directories: this.service.listDirectories().map((d) => ({ DirectoryArn: d.directoryArn, Name: d.name, State: d.state })) }, ctx);
      }

      // POST /amazonclouddirectory/2017-01-11/directory/get — GetDirectory
      if (path === "/amazonclouddirectory/2017-01-11/directory/get" && method === "POST") {
        const dirArn = req.headers.get("x-amz-data-partition") ?? "";
        const dir = this.service.getDirectory(dirArn);
        return this.json({ Directory: { DirectoryArn: dir.directoryArn, Name: dir.name, State: dir.state } }, ctx);
      }

      // PUT /amazonclouddirectory/2017-01-11/directory — DeleteDirectory (retireDirecory)
      if (path === "/amazonclouddirectory/2017-01-11/directory" && method === "PUT") {
        const dirArn = req.headers.get("x-amz-data-partition") ?? "";
        this.service.deleteDirectory(dirArn);
        return this.json({ DirectoryArn: dirArn }, ctx);
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
