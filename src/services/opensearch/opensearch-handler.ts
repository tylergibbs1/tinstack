import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { OpenSearchService } from "./opensearch-service";

export class OpenSearchHandler {
  constructor(private service: OpenSearchService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /2021-01-01/opensearch/domain — CreateDomain
      if (path === "/2021-01-01/opensearch/domain" && method === "POST") {
        const body = await req.json();
        const domain = this.service.createDomain(
          body.DomainName, body.EngineVersion, body.ClusterConfig,
          body.EBSOptions, body.AccessPolicies, ctx.region, body.TagList,
        );
        return this.json({ DomainStatus: this.domainToJson(domain) }, ctx);
      }

      // GET /2021-01-01/opensearch/domain or /2021-01-01/domain — ListDomainNames
      if ((path === "/2021-01-01/opensearch/domain" || path === "/2021-01-01/domain") && method === "GET") {
        const names = this.service.listDomainNames();
        return this.json({ DomainNames: names }, ctx);
      }

      // Domain-specific routes
      const domainMatch = path.match(/^\/2021-01-01\/opensearch\/domain\/([^/]+)$/);
      if (domainMatch) {
        const domainName = decodeURIComponent(domainMatch[1]);
        if (method === "GET") {
          const domain = this.service.describeDomain(domainName);
          return this.json({ DomainStatus: this.domainToJson(domain) }, ctx);
        }
        if (method === "DELETE") {
          const domain = this.service.deleteDomain(domainName);
          return this.json({ DomainStatus: this.domainToJson(domain) }, ctx);
        }
      }

      // PUT /2021-01-01/opensearch/domain/{name}/config — UpdateDomainConfig
      const configMatch = path.match(/^\/2021-01-01\/opensearch\/domain\/([^/]+)\/config$/);
      if (configMatch && (method === "PUT" || method === "POST")) {
        const domainName = decodeURIComponent(configMatch[1]);
        const body = await req.json();
        const domain = this.service.updateDomainConfig(
          domainName, body.ClusterConfig, body.EBSOptions, body.AccessPolicies,
          body.AdvancedOptions, body.DomainEndpointOptions,
          body.AdvancedSecurityOptions, body.EncryptionAtRestOptions,
          body.NodeToNodeEncryptionOptions,
        );
        return this.json({ DomainConfig: this.service.describeDomainConfig(domainName) }, ctx);
      }

      // GET /2021-01-01/opensearch/domain/{name}/config — DescribeDomainConfig
      if (configMatch && method === "GET") {
        const domainName = decodeURIComponent(configMatch[1]);
        const config = this.service.describeDomainConfig(domainName);
        return this.json({ DomainConfig: config }, ctx);
      }

      // POST /2021-01-01/tags — AddTags
      if (path === "/2021-01-01/tags" && method === "POST") {
        const body = await req.json();
        this.service.addTags(body.ARN, body.TagList ?? []);
        return this.json({}, ctx);
      }

      // GET /2021-01-01/tags?arn=... — ListTags
      if (path === "/2021-01-01/tags" && method === "GET") {
        const arn = url.searchParams.get("arn") ?? "";
        const tags = this.service.listTags(arn);
        return this.json({ TagList: tags }, ctx);
      }

      // POST /2021-01-01/tags-removal — RemoveTags
      if (path === "/2021-01-01/tags-removal" && method === "POST") {
        const body = await req.json();
        this.service.removeTags(body.ARN, body.TagKeys ?? []);
        return this.json({}, ctx);
      }

      return jsonErrorResponse(new AwsError("UnsupportedOperation", `Route ${method} ${path} not supported.`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private domainToJson(domain: any): Record<string, any> {
    return {
      DomainId: domain.domainId,
      DomainName: domain.domainName,
      ARN: domain.arn,
      Created: domain.created,
      Deleted: domain.deleted,
      Processing: domain.processing,
      EngineVersion: domain.engineVersion,
      Endpoint: domain.endpoint,
      ClusterConfig: domain.clusterConfig,
      EBSOptions: domain.ebsOptions,
      AccessPolicies: domain.accessPolicies,
      SnapshotOptions: domain.snapshotOptions,
      AdvancedOptions: domain.advancedOptions,
      DomainEndpointOptions: domain.domainEndpointOptions,
      AdvancedSecurityOptions: domain.advancedSecurityOptions,
      EncryptionAtRestOptions: domain.encryptionAtRestOptions,
      NodeToNodeEncryptionOptions: domain.nodeToNodeEncryptionOptions,
    };
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
