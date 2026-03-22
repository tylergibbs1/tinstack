import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { RamService } from "./ram-service";

export class RamHandler {
  constructor(private service: RamService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // CreateResourceShare: POST /createresourceshare
      if (path === "/createresourceshare" && method === "POST") {
        const body = await req.json();
        const share = this.service.createResourceShare(body, ctx.region);
        return this.json({ resourceShare: this.service.formatResourceShare(share) }, ctx);
      }

      // GetResourceShares: POST /getresourceshares
      if (path === "/getresourceshares" && method === "POST") {
        const body = await req.json();
        const shares = this.service.getResourceShares(body.resourceOwner ?? "SELF");
        return this.json({ resourceShares: shares.map((s) => this.service.formatResourceShare(s)) }, ctx);
      }

      // UpdateResourceShare: POST /updateresourceshare
      if (path === "/updateresourceshare" && method === "POST") {
        const body = await req.json();
        const share = this.service.updateResourceShare(body);
        return this.json({ resourceShare: this.service.formatResourceShare(share) }, ctx);
      }

      // DeleteResourceShare: DELETE /deleteresourceshare?resourceShareArn=...
      if (path === "/deleteresourceshare" && method === "DELETE") {
        const arn = url.searchParams.get("resourceShareArn");
        if (!arn) throw new AwsError("InvalidParameterException", "resourceShareArn is required.", 400);
        this.service.deleteResourceShare(arn);
        return this.json({ returnValue: true }, ctx);
      }

      // AssociateResourceShare: POST /associateresourceshare
      if (path === "/associateresourceshare" && method === "POST") {
        const body = await req.json();
        const assocs = this.service.associateResourceShare(body);
        return this.json({ resourceShareAssociations: assocs }, ctx);
      }

      // DisassociateResourceShare: POST /disassociateresourceshare
      if (path === "/disassociateresourceshare" && method === "POST") {
        const body = await req.json();
        const assocs = this.service.disassociateResourceShare(body);
        return this.json({ resourceShareAssociations: assocs }, ctx);
      }

      // GetResourceShareAssociations: POST /getresourceshareassociations
      if (path === "/getresourceshareassociations" && method === "POST") {
        const body = await req.json();
        const assocs = this.service.getResourceShareAssociations(
          body.associationType ?? "PRINCIPAL",
          body.resourceShareArns,
        );
        return this.json({ resourceShareAssociations: assocs }, ctx);
      }

      // ListResources: POST /listresources
      if (path === "/listresources" && method === "POST") {
        const body = await req.json();
        const resources = this.service.listResources(
          body.resourceOwner ?? "SELF",
          body.resourceShareArns,
        );
        return this.json({ resources }, ctx);
      }

      // TagResource: POST /tagresource
      if (path === "/tagresource" && method === "POST") {
        const body = await req.json();
        this.service.tagResource(body.resourceShareArn, body.tags ?? []);
        return this.json({}, ctx);
      }

      // UntagResource: POST /untagresource
      if (path === "/untagresource" && method === "POST") {
        const body = await req.json();
        this.service.untagResource(body.resourceShareArn, body.tagKeys ?? []);
        return this.json({}, ctx);
      }

      // ListTagsForResource: (uses the tags on the share itself)
      // This is handled implicitly through getResourceShares

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown RAM operation: ${method} ${path}`, 400),
        ctx.requestId,
      );
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
