import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ElasticsearchService, EsDomain } from "./es-service";

function toDomainStatus(d: EsDomain) {
  return {
    DomainId: d.domainId,
    DomainName: d.domainName,
    ARN: d.arn,
    ElasticsearchVersion: d.elasticsearchVersion,
    Created: d.created,
    Deleted: d.deleted,
    Processing: d.processing,
    Endpoint: d.endpoint,
  };
}

export class ElasticsearchHandler {
  constructor(private service: ElasticsearchService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /2015-01-01/es/domain — CreateElasticsearchDomain
      if (path === "/2015-01-01/es/domain" && method === "POST") {
        const body = await req.json();
        const d = this.service.createDomain(body.DomainName, body.ElasticsearchVersion);
        return this.json({ DomainStatus: toDomainStatus(d) }, ctx);
      }

      // GET /2015-01-01/domain — ListDomainNames (note: no /es/ prefix for list)
      if ((path === "/2015-01-01/domain" || path === "/2015-01-01/es/domain") && method === "GET") {
        return this.json({ DomainNames: this.service.listDomainNames() }, ctx);
      }

      // GET /2015-01-01/es/domain/{domainName}
      const domainMatch = path.match(/^\/2015-01-01\/es\/domain\/([^/]+)$/);
      if (domainMatch && method === "GET") {
        const d = this.service.describeDomain(domainMatch[1]);
        return this.json({ DomainStatus: toDomainStatus(d) }, ctx);
      }
      if (domainMatch && method === "DELETE") {
        const d = this.service.deleteDomain(domainMatch[1]);
        return this.json({ DomainStatus: toDomainStatus(d) }, ctx);
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
