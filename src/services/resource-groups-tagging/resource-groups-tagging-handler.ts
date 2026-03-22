import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ResourceGroupsTaggingService } from "./resource-groups-tagging-service";

export class ResourceGroupsTaggingHandler {
  constructor(private service: ResourceGroupsTaggingService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "GetResources": {
          const resources = this.service.getResources(body.TagFilters);
          return this.json({
            ResourceTagMappingList: resources.map((r) => ({
              ResourceARN: r.resourceARN,
              Tags: r.tags,
            })),
          }, ctx);
        }
        case "GetTagKeys": {
          return this.json({ TagKeys: this.service.getTagKeys() }, ctx);
        }
        case "GetTagValues": {
          return this.json({ TagValues: this.service.getTagValues(body.Key) }, ctx);
        }
        case "TagResources": {
          const result = this.service.tagResources(body.ResourceARNList, body.Tags);
          return this.json({ FailedResourcesMap: {} }, ctx);
        }
        case "UntagResources": {
          const result = this.service.untagResources(body.ResourceARNList, body.TagKeys);
          return this.json({ FailedResourcesMap: {} }, ctx);
        }
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
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
