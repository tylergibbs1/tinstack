import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { XRayService } from "./xray-service";

export class XRayHandler {
  constructor(private service: XRayService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // PutTraceSegments: POST /TraceSegments
      if (path === "/TraceSegments" && method === "POST") {
        const body = await req.json();
        const result = this.service.putTraceSegments(body.TraceSegmentDocuments ?? []);
        return this.json(result, ctx);
      }

      // GetTraceSummaries: POST /TraceSummaries
      if (path === "/TraceSummaries" && method === "POST") {
        const body = await req.json();
        const summaries = this.service.getTraceSummaries(body.StartTime ?? 0, body.EndTime ?? Date.now() / 1000);
        return this.json({ TraceSummaries: summaries, ApproximateTime: Date.now() / 1000 }, ctx);
      }

      // BatchGetTraces: POST /Traces
      if (path === "/Traces" && method === "POST") {
        const body = await req.json();
        const result = this.service.batchGetTraces(body.TraceIds ?? []);
        return this.json(result, ctx);
      }

      // GetServiceGraph: POST /ServiceGraph
      if (path === "/ServiceGraph" && method === "POST") {
        const body = await req.json();
        const result = this.service.getServiceGraph(body.StartTime ?? 0, body.EndTime ?? Date.now() / 1000);
        return this.json(result, ctx);
      }

      // CreateGroup: POST /CreateGroup
      if (path === "/CreateGroup" && method === "POST") {
        const body = await req.json();
        const group = this.service.createGroup(body.GroupName, body.FilterExpression, ctx.region);
        return this.json({ Group: { GroupName: group.groupName, GroupARN: group.groupArn, FilterExpression: group.filterExpression, InsightsConfiguration: group.insightsConfiguration } }, ctx);
      }

      // GetGroup: POST /GetGroup
      if (path === "/GetGroup" && method === "POST") {
        const body = await req.json();
        const group = this.service.getGroup(body.GroupName ?? body.GroupARN);
        return this.json({ Group: { GroupName: group.groupName, GroupARN: group.groupArn, FilterExpression: group.filterExpression, InsightsConfiguration: group.insightsConfiguration } }, ctx);
      }

      // GetGroups: POST /Groups
      if (path === "/Groups" && method === "POST") {
        const groups = this.service.getGroups();
        return this.json({
          Groups: groups.map((g) => ({
            GroupName: g.groupName,
            GroupARN: g.groupArn,
            FilterExpression: g.filterExpression,
            InsightsConfiguration: g.insightsConfiguration,
          })),
        }, ctx);
      }

      // DeleteGroup: POST /DeleteGroup
      if (path === "/DeleteGroup" && method === "POST") {
        const body = await req.json();
        this.service.deleteGroup(body.GroupName ?? body.GroupARN);
        return this.json({}, ctx);
      }

      // CreateSamplingRule: POST /CreateSamplingRule
      if (path === "/CreateSamplingRule" && method === "POST") {
        const body = await req.json();
        const rule = this.service.createSamplingRule(body.SamplingRule, ctx.region);
        return this.json({ SamplingRuleRecord: this.service.formatSamplingRuleRecord(rule) }, ctx);
      }

      // GetSamplingRules: POST /GetSamplingRules
      if (path === "/GetSamplingRules" && method === "POST") {
        const rules = this.service.getSamplingRules();
        return this.json({
          SamplingRuleRecords: rules.map((r) => this.service.formatSamplingRuleRecord(r)),
        }, ctx);
      }

      // UpdateSamplingRule: POST /UpdateSamplingRule
      if (path === "/UpdateSamplingRule" && method === "POST") {
        const body = await req.json();
        const rule = this.service.updateSamplingRule(body.SamplingRuleUpdate);
        return this.json({ SamplingRuleRecord: this.service.formatSamplingRuleRecord(rule) }, ctx);
      }

      // DeleteSamplingRule: POST /DeleteSamplingRule
      if (path === "/DeleteSamplingRule" && method === "POST") {
        const body = await req.json();
        this.service.deleteSamplingRule(body.RuleName);
        return this.json({}, ctx);
      }

      // TagResource: POST /TagResource
      if (path === "/TagResource" && method === "POST") {
        const body = await req.json();
        this.service.tagResource(body.ResourceARN, body.Tags ?? []);
        return this.json({}, ctx);
      }

      // UntagResource: POST /UntagResource
      if (path === "/UntagResource" && method === "POST") {
        const body = await req.json();
        this.service.untagResource(body.ResourceARN, body.TagKeys ?? []);
        return this.json({}, ctx);
      }

      // ListTagsForResource: POST /ListTagsForResource
      if (path === "/ListTagsForResource" && method === "POST") {
        const body = await req.json();
        const tags = this.service.listTagsForResource(body.ResourceARN);
        return this.json({ Tags: tags }, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown X-Ray operation: ${method} ${path}`, 400),
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
