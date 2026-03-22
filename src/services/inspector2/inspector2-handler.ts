import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { Inspector2Service } from "./inspector2-service";

export class Inspector2Handler {
  constructor(private service: Inspector2Service) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /enable
      if (path === "/enable" && method === "POST") {
        const body = await req.json();
        const status = this.service.enable(body.resourceTypes ?? [], ctx.region);
        return this.json({
          accounts: [accountStatusToJson(status)],
          failedAccounts: [],
        }, ctx);
      }

      // POST /disable
      if (path === "/disable" && method === "POST") {
        const body = await req.json();
        const status = this.service.disable(body.resourceTypes ?? []);
        return this.json({
          accounts: [accountStatusToJson(status)],
          failedAccounts: [],
        }, ctx);
      }

      // POST /status/batch/get
      if (path === "/status/batch/get" && method === "POST") {
        const statuses = this.service.batchGetAccountStatus();
        return this.json({
          accounts: statuses.map(accountStatusToBatchJson),
          failedAccounts: [],
        }, ctx);
      }

      // --- Findings ---

      // POST /findings/list
      if (path === "/findings/list" && method === "POST") {
        const findings = this.service.listFindings();
        return this.json({ findings }, ctx);
      }

      // --- Filters ---

      // POST /filters/create
      if (path === "/filters/create" && method === "POST") {
        const body = await req.json();
        const arn = this.service.createFilter(
          body.name,
          body.action,
          body.description,
          body.filterCriteria,
          body.tags,
          ctx.region,
        );
        return this.json({ arn }, ctx);
      }

      // POST /filters/list
      if (path === "/filters/list" && method === "POST") {
        const filters = this.service.listFilters();
        return this.json({
          filters: filters.map(filterToJson),
        }, ctx);
      }

      // POST /filters/delete
      if (path === "/filters/delete" && method === "POST") {
        const body = await req.json();
        this.service.deleteFilter(body.arn);
        return this.json({ arn: body.arn }, ctx);
      }

      // POST /filters/update
      if (path === "/filters/update" && method === "POST") {
        const body = await req.json();
        const arn = this.service.updateFilter(
          body.filterArn,
          body.name,
          body.action,
          body.description,
          body.filterCriteria,
        );
        return this.json({ arn }, ctx);
      }

      // --- Coverage ---

      // POST /coverage/list
      if (path === "/coverage/list" && method === "POST") {
        const coverage = this.service.listCoverage();
        return this.json({ coveredResources: coverage }, ctx);
      }

      // POST /organizationconfiguration/describe
      if (path === "/organizationconfiguration/describe" && method === "POST") {
        const config = this.service.describeOrganizationConfiguration();
        return this.json(config, ctx);
      }

      // --- Tags ---

      // POST /tags/{resourceArn}
      const tagPostMatch = path.match(/^\/tags\/(.+)$/);
      if (tagPostMatch && method === "POST") {
        const body = await req.json();
        this.service.tagResource(decodeURIComponent(tagPostMatch[1]), body.tags ?? {});
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
        new AwsError("UnknownOperationException", `Unknown Inspector2 operation: ${method} ${path}`, 404),
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

function accountStatusToJson(status: any) {
  return {
    accountId: status.accountId,
    resourceStatus: {
      ec2: status.ec2,
      ecr: status.ecr,
      lambda: status.lambda,
      lambdaCode: status.lambdaCode,
    },
    status: [status.ec2, status.ecr, status.lambda, status.lambdaCode].includes("ENABLED") ? "ENABLED" : "DISABLED",
  };
}

function accountStatusToBatchJson(status: any) {
  return {
    accountId: status.accountId,
    resourceState: {
      ec2: { status: status.ec2 },
      ecr: { status: status.ecr },
      lambda: { status: status.lambda },
      lambdaCode: { status: status.lambdaCode },
    },
    state: {
      status: [status.ec2, status.ecr, status.lambda, status.lambdaCode].includes("ENABLED") ? "ENABLED" : "DISABLED",
    },
  };
}

function filterToJson(filter: any) {
  return {
    arn: filter.arn,
    name: filter.name,
    action: filter.action,
    description: filter.description,
    criteria: filter.filterCriteria,
    createdAt: filter.createdAt,
    ownerId: filter.ownerId,
  };
}
