import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { LakeFormationService } from "./lakeformation-service";

export class LakeFormationHandler {
  constructor(private service: LakeFormationService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      const body = await req.json().catch(() => ({}));
      const action = path.replace(/^\//, "");

      switch (action) {
        case "RegisterResource": return this.registerResource(body, ctx);
        case "DeregisterResource": return this.deregisterResource(body, ctx);
        case "ListResources": return this.listResources(body, ctx);
        case "GrantPermissions": return this.grantPermissions(body, ctx);
        case "RevokePermissions": return this.revokePermissions(body, ctx);
        case "ListPermissions": return this.listPermissions(body, ctx);
        case "GetDataLakeSettings": return this.getDataLakeSettings(body, ctx);
        case "PutDataLakeSettings": return this.putDataLakeSettings(body, ctx);
        case "CreateLFTag": return this.createLFTag(body, ctx);
        case "GetLFTag": return this.getLFTag(body, ctx);
        case "ListLFTags": return this.listLFTags(body, ctx);
        case "DeleteLFTag": return this.deleteLFTag(body, ctx);
        case "AddLFTagsToResource": return this.addLFTagsToResource(body, ctx);
        case "GetResourceLFTags": return this.getResourceLFTags(body, ctx);
        case "RemoveLFTagsFromResource": return this.removeLFTagsFromResource(body, ctx);
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
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

  private registerResource(body: any, ctx: RequestContext): Response {
    this.service.registerResource(body.ResourceArn, body.RoleArn);
    return this.json({}, ctx);
  }

  private deregisterResource(body: any, ctx: RequestContext): Response {
    this.service.deregisterResource(body.ResourceArn);
    return this.json({}, ctx);
  }

  private listResources(_body: any, ctx: RequestContext): Response {
    const resources = this.service.listResources();
    return this.json({
      ResourceInfoList: resources.map((r) => ({
        ResourceArn: r.resourceArn,
        RoleArn: r.roleArn,
      })),
    }, ctx);
  }

  private grantPermissions(body: any, ctx: RequestContext): Response {
    this.service.grantPermissions(
      body.Principal,
      body.Resource,
      body.Permissions ?? [],
      body.PermissionsWithGrantOption ?? [],
    );
    return this.json({}, ctx);
  }

  private revokePermissions(body: any, ctx: RequestContext): Response {
    this.service.revokePermissions(
      body.Principal,
      body.Resource,
      body.Permissions ?? [],
      body.PermissionsWithGrantOption ?? [],
    );
    return this.json({}, ctx);
  }

  private listPermissions(body: any, ctx: RequestContext): Response {
    const perms = this.service.listPermissions(body.Principal, body.Resource);
    return this.json({
      PrincipalResourcePermissions: perms.map((p) => ({
        Principal: p.principal,
        Resource: p.resource,
        Permissions: p.permissions,
        PermissionsWithGrantOption: p.permissionsWithGrantOption,
      })),
    }, ctx);
  }

  private getDataLakeSettings(body: any, ctx: RequestContext): Response {
    const catalogId = body.CatalogId ?? ctx.accountId;
    const settings = this.service.getDataLakeSettings(catalogId);
    return this.json({ DataLakeSettings: settings }, ctx);
  }

  private putDataLakeSettings(body: any, ctx: RequestContext): Response {
    const catalogId = body.CatalogId ?? ctx.accountId;
    this.service.putDataLakeSettings(catalogId, body.DataLakeSettings);
    return this.json({}, ctx);
  }

  private createLFTag(body: any, ctx: RequestContext): Response {
    const catalogId = body.CatalogId ?? ctx.accountId;
    this.service.createLFTag(catalogId, body.TagKey, body.TagValues);
    return this.json({}, ctx);
  }

  private getLFTag(body: any, ctx: RequestContext): Response {
    const catalogId = body.CatalogId ?? ctx.accountId;
    const tag = this.service.getLFTag(catalogId, body.TagKey);
    return this.json({
      CatalogId: tag.catalogId,
      TagKey: tag.tagKey,
      TagValues: tag.tagValues,
    }, ctx);
  }

  private listLFTags(body: any, ctx: RequestContext): Response {
    const catalogId = body.CatalogId ?? ctx.accountId;
    const tags = this.service.listLFTags(catalogId);
    return this.json({
      LFTags: tags.map((t) => ({
        CatalogId: t.catalogId,
        TagKey: t.tagKey,
        TagValues: t.tagValues,
      })),
    }, ctx);
  }

  private deleteLFTag(body: any, ctx: RequestContext): Response {
    const catalogId = body.CatalogId ?? ctx.accountId;
    this.service.deleteLFTag(catalogId, body.TagKey);
    return this.json({}, ctx);
  }

  private addLFTagsToResource(body: any, ctx: RequestContext): Response {
    const result = this.service.addLFTagsToResource(body.Resource, body.LFTags);
    return this.json(result, ctx);
  }

  private getResourceLFTags(body: any, ctx: RequestContext): Response {
    const tags = this.service.getResourceLFTags(body.Resource);
    return this.json({
      LFTagOnDatabase: tags,
    }, ctx);
  }

  private removeLFTagsFromResource(body: any, ctx: RequestContext): Response {
    const result = this.service.removeLFTagsFromResource(body.Resource, body.LFTags);
    return this.json(result, ctx);
  }
}
