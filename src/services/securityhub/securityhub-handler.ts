import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SecurityHubService } from "./securityhub-service";

export class SecurityHubHandler {
  constructor(private service: SecurityHubService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /accounts (EnableSecurityHub)
      if (path === "/accounts" && method === "POST") {
        const body = await req.json().catch(() => ({}));
        this.service.enableSecurityHub(body.EnableDefaultStandards, body.Tags, ctx.region);
        return this.json({}, ctx);
      }

      // GET /accounts (DescribeHub)
      if (path === "/accounts" && method === "GET") {
        const hub = this.service.describeHub(ctx.region);
        return this.json(hub, ctx);
      }

      // --- Standards ---

      // GET /standards (GetEnabledStandards)
      if (path === "/standards" && method === "GET") {
        const standards = this.service.getEnabledStandards();
        return this.json({ StandardsSubscriptions: standards.map(stdToJson) }, ctx);
      }

      // POST /standards/get (GetEnabledStandards POST variant)
      if (path === "/standards/get" && method === "POST") {
        const standards = this.service.getEnabledStandards();
        return this.json({ StandardsSubscriptions: standards.map(stdToJson) }, ctx);
      }

      // POST /standards/register (BatchEnableStandards)
      if (path === "/standards/register" && method === "POST") {
        const body = await req.json();
        const standards = this.service.batchEnableStandards(
          body.StandardsSubscriptionRequests ?? [],
          ctx.region,
        );
        return this.json({ StandardsSubscriptions: standards.map(stdToJson) }, ctx);
      }

      // POST /standards/deregister (BatchDisableStandards)
      if (path === "/standards/deregister" && method === "POST") {
        const body = await req.json();
        const standards = this.service.batchDisableStandards(
          body.StandardsSubscriptionArns ?? [],
        );
        return this.json({ StandardsSubscriptions: standards.map(stdToJson) }, ctx);
      }

      // --- Findings ---

      // POST /findings (GetFindings)
      if (path === "/findings" && method === "POST") {
        const findings = this.service.getFindings();
        return this.json({ Findings: findings }, ctx);
      }

      // POST /findings/import (BatchImportFindings)
      if (path === "/findings/import" && method === "POST") {
        const body = await req.json();
        const result = this.service.batchImportFindings(body.Findings ?? []);
        return this.json({
          FailedCount: result.failedCount,
          SuccessCount: result.successCount,
          FailedFindings: result.failedFindings,
        }, ctx);
      }

      // PATCH /findings/batchupdate (BatchUpdateFindings)
      if (path === "/findings/batchupdate" && method === "PATCH") {
        const body = await req.json();
        const result = this.service.batchUpdateFindings(
          body.FindingIdentifiers ?? [],
          body.Note,
          body.Severity,
          body.Workflow,
        );
        return this.json({
          ProcessedFindings: result.processedFindings,
          UnprocessedFindings: result.unprocessedFindings,
        }, ctx);
      }

      // --- Insights ---

      // POST /insights (CreateInsight)
      if (path === "/insights" && method === "POST") {
        const body = await req.json();
        const insightArn = this.service.createInsight(
          body.Name,
          body.Filters,
          body.GroupByAttribute,
          ctx.region,
        );
        return this.json({ InsightArn: insightArn }, ctx);
      }

      // POST /insights/get (GetInsights)
      if (path === "/insights/get" && method === "POST") {
        const body = await req.json();
        const insights = this.service.getInsights(body.InsightArns);
        return this.json({ Insights: insights.map(insightToJson) }, ctx);
      }

      // GET /insights (GetInsights)
      if (path === "/insights" && method === "GET") {
        const insights = this.service.getInsights();
        return this.json({ Insights: insights.map(insightToJson) }, ctx);
      }

      // DELETE /insights/{insightArn+}
      const insightDeleteMatch = path.match(/^\/insights\/(.+)$/);
      if (insightDeleteMatch && method === "DELETE") {
        const arn = decodeURIComponent(insightDeleteMatch[1]);
        const deletedArn = this.service.deleteInsight(arn);
        return this.json({ InsightArn: deletedArn }, ctx);
      }

      // --- Tags ---

      // POST /tags/{resourceArn}
      const tagPostMatch = path.match(/^\/tags\/(.+)$/);
      if (tagPostMatch && method === "POST") {
        const body = await req.json();
        this.service.tagResource(decodeURIComponent(tagPostMatch[1]), body.Tags ?? {});
        return this.json({}, ctx);
      }

      // DELETE /tags/{resourceArn}
      const tagDeleteMatch = path.match(/^\/tags\/(.+)$/);
      if (tagDeleteMatch && method === "DELETE") {
        const tagKeys = url.searchParams.getAll("tagKeys");
        this.service.untagResource(decodeURIComponent(tagDeleteMatch[1]), tagKeys);
        return this.json({}, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown SecurityHub operation: ${method} ${path}`, 404),
        ctx.requestId,
      );
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

function stdToJson(std: any) {
  return {
    StandardsArn: std.standardsArn,
    StandardsSubscriptionArn: std.standardsSubscriptionArn,
    StandardsStatus: std.standardsStatus,
  };
}

function insightToJson(insight: any) {
  return {
    InsightArn: insight.insightArn,
    Name: insight.name,
    Filters: insight.filters,
    GroupByAttribute: insight.groupByAttribute,
  };
}
