import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SsmService } from "./ssm-service";

export class SsmHandler {
  constructor(private service: SsmService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "PutParameter":
          return this.putParameter(body, ctx);
        case "GetParameter":
          return this.getParameter(body, ctx);
        case "GetParameters":
          return this.getParameters(body, ctx);
        case "GetParametersByPath":
          return this.getParametersByPath(body, ctx);
        case "DeleteParameter":
          return this.deleteParameter(body, ctx);
        case "DeleteParameters":
          return this.deleteParameters(body, ctx);
        case "DescribeParameters":
          return this.describeParameters(body, ctx);
        case "GetParameterHistory":
          return this.getParameterHistory(body, ctx);
        case "AddTagsToResource":
          return this.addTagsToResource(body, ctx);
        case "ListTagsForResource":
          return this.listTagsForResource(body, ctx);
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

  private putParameter(body: any, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    if (body.Tags) {
      for (const tag of body.Tags) tags[tag.Key] = tag.Value;
    }
    const result = this.service.putParameter(
      body.Name, body.Value, body.Type ?? "String",
      body.Description, body.Overwrite ?? false, tags, ctx.region,
    );
    return this.json({ Version: result.version, Tier: result.tier }, ctx);
  }

  private getParameter(body: any, ctx: RequestContext): Response {
    const param = this.service.getParameter(body.Name, body.WithDecryption ?? false, ctx.region);
    return this.json({
      Parameter: {
        Name: param.name,
        Type: param.type,
        Value: param.value,
        Version: param.version,
        LastModifiedDate: param.lastModifiedDate,
        ARN: param.arn,
        DataType: param.dataType,
      },
    }, ctx);
  }

  private getParameters(body: any, ctx: RequestContext): Response {
    const result = this.service.getParameters(body.Names, ctx.region);
    return this.json({
      Parameters: result.parameters.map((p) => ({
        Name: p.name, Type: p.type, Value: p.value, Version: p.version,
        LastModifiedDate: p.lastModifiedDate, ARN: p.arn, DataType: p.dataType,
      })),
      InvalidParameters: result.invalidParameters,
    }, ctx);
  }

  private getParametersByPath(body: any, ctx: RequestContext): Response {
    const result = this.service.getParametersByPath(body.Path, body.Recursive ?? false, ctx.region, body.MaxResults, body.NextToken);
    return this.json({
      Parameters: result.parameters.map((p) => ({
        Name: p.name, Type: p.type, Value: p.value, Version: p.version,
        LastModifiedDate: p.lastModifiedDate, ARN: p.arn, DataType: p.dataType,
      })),
      NextToken: result.nextToken,
    }, ctx);
  }

  private deleteParameter(body: any, ctx: RequestContext): Response {
    this.service.deleteParameter(body.Name, ctx.region);
    return this.json({}, ctx);
  }

  private deleteParameters(body: any, ctx: RequestContext): Response {
    const result = this.service.deleteParameters(body.Names, ctx.region);
    return this.json({
      DeletedParameters: result.deletedParameters,
      InvalidParameters: result.invalidParameters,
    }, ctx);
  }

  private describeParameters(body: any, ctx: RequestContext): Response {
    const result = this.service.describeParameters(ctx.region, body.ParameterFilters, body.MaxResults, body.NextToken);
    return this.json({
      Parameters: result.parameters,
      NextToken: result.nextToken,
    }, ctx);
  }

  private getParameterHistory(body: any, ctx: RequestContext): Response {
    const history = this.service.getParameterHistory(body.Name, ctx.region);
    return this.json({
      Parameters: history.map((h) => ({
        Name: h.name, Value: h.value, Type: h.type, Version: h.version,
        LastModifiedDate: h.lastModifiedDate, Description: h.description,
      })),
    }, ctx);
  }

  private addTagsToResource(body: any, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    for (const tag of body.Tags ?? []) tags[tag.Key] = tag.Value;
    this.service.addTagsToResource(body.ResourceId, tags, ctx.region);
    return this.json({}, ctx);
  }

  private listTagsForResource(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTagsForResource(body.ResourceId, ctx.region);
    return this.json({
      TagList: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
    }, ctx);
  }
}
