import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder } from "../../core/xml";
import type { CloudFrontService, Distribution, Invalidation } from "./cloudfront-service";

const NS = "http://cloudfront.amazonaws.com/doc/2020-05-31/";

export class CloudFrontHandler {
  constructor(private service: CloudFrontService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // GetInvalidation: GET /2020-05-31/distribution/{id}/invalidation/{invId}
      const getInvMatch = path.match(/^\/2020-05-31\/distribution\/([^/]+)\/invalidation\/([^/]+)$/);
      if (getInvMatch && method === "GET") {
        const inv = this.service.getInvalidation(getInvMatch[1], getInvMatch[2]);
        return this.xml(this.invalidationXml(inv), ctx);
      }

      // CreateInvalidation: POST /2020-05-31/distribution/{id}/invalidation
      // ListInvalidations: GET /2020-05-31/distribution/{id}/invalidation
      const invMatch = path.match(/^\/2020-05-31\/distribution\/([^/]+)\/invalidation\/?$/);
      if (invMatch) {
        const distId = invMatch[1];
        if (method === "POST") {
          const body = await req.text();
          return this.createInvalidation(distId, body, ctx);
        }
        if (method === "GET") {
          return this.listInvalidations(distId, ctx);
        }
      }

      // UpdateDistribution: PUT /2020-05-31/distribution/{id}/config
      const updateMatch = path.match(/^\/2020-05-31\/distribution\/([^/]+)\/config$/);
      if (updateMatch && method === "PUT") {
        const body = await req.text();
        const ifMatch = req.headers.get("if-match") ?? undefined;
        return this.updateDistribution(updateMatch[1], body, ifMatch, ctx);
      }

      // Single distribution: GET/DELETE /2020-05-31/distribution/{id}
      const distMatch = path.match(/^\/2020-05-31\/distribution\/([^/]+)$/);
      if (distMatch) {
        const id = distMatch[1];
        if (method === "GET") {
          const dist = this.service.getDistribution(id);
          return this.distributionResponse(dist, ctx);
        }
        if (method === "DELETE") {
          const ifMatch = req.headers.get("if-match") ?? undefined;
          this.service.deleteDistribution(id, ifMatch);
          return new Response(null, {
            status: 204,
            headers: { "x-amzn-RequestId": ctx.requestId },
          });
        }
      }

      // List/Create distributions: GET/POST /2020-05-31/distribution
      if (path === "/2020-05-31/distribution" || path === "/2020-05-31/distribution/") {
        if (method === "POST") {
          const body = await req.text();
          return this.createDistribution(body, ctx);
        }
        if (method === "GET") {
          return this.listDistributions(ctx);
        }
      }

      return xmlErrorResponse(
        new AwsError("UnknownOperationException", `Unknown CloudFront operation: ${method} ${path}`, 400),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private createDistribution(body: string, ctx: RequestContext): Response {
    const config = this.parseDistributionConfig(body);
    const dist = this.service.createDistribution(config);
    return this.distributionResponse(dist, ctx, 201);
  }

  private updateDistribution(id: string, body: string, ifMatch: string | undefined, ctx: RequestContext): Response {
    const config = this.parseDistributionConfig(body);
    const dist = this.service.updateDistribution(id, config, ifMatch);
    return this.distributionResponse(dist, ctx);
  }

  private distributionResponse(dist: Distribution, ctx: RequestContext, status = 200): Response {
    const xml = this.distributionXml(dist);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
      status,
      headers: {
        "Content-Type": "application/xml",
        "x-amzn-RequestId": ctx.requestId,
        ETag: dist.ETag,
      },
    });
  }

  private listDistributions(ctx: RequestContext): Response {
    const distributions = this.service.listDistributions();

    const xb = new XmlBuilder()
      .start("DistributionList", { xmlns: NS })
      .elem("Marker", "")
      .elem("MaxItems", 100)
      .elem("IsTruncated", false)
      .elem("Quantity", distributions.length)
      .start("Items");

    for (const dist of distributions) {
      xb.start("DistributionSummary")
        .elem("Id", dist.Id)
        .elem("ARN", dist.ARN)
        .elem("Status", dist.Status)
        .elem("LastModifiedTime", dist.LastModifiedTime)
        .elem("DomainName", dist.DomainName)
        .elem("Comment", dist.DistributionConfig.Comment ?? "")
        .elem("Enabled", dist.DistributionConfig.Enabled)
        .end("DistributionSummary");
    }

    xb.end("Items").end("DistributionList");
    return this.xml(xb.build(), ctx);
  }

  private createInvalidation(distributionId: string, body: string, ctx: RequestContext): Response {
    const callerReference = this.extractXmlValue(body, "CallerReference") ?? crypto.randomUUID();

    const paths: string[] = [];
    const pathRegex = /<Path>([^<]+)<\/Path>/g;
    let pathMatch;
    while ((pathMatch = pathRegex.exec(body)) !== null) {
      paths.push(pathMatch[1]);
    }

    const inv = this.service.createInvalidation(distributionId, callerReference, paths);
    return this.xml(this.invalidationXml(inv), ctx, 201);
  }

  private listInvalidations(distributionId: string, ctx: RequestContext): Response {
    const invalidations = this.service.listInvalidations(distributionId);

    const xb = new XmlBuilder()
      .start("InvalidationList", { xmlns: NS })
      .elem("Marker", "")
      .elem("MaxItems", 100)
      .elem("IsTruncated", false)
      .elem("Quantity", invalidations.length)
      .start("Items");

    for (const inv of invalidations) {
      xb.start("InvalidationSummary")
        .elem("Id", inv.Id)
        .elem("CreateTime", inv.CreateTime)
        .elem("Status", inv.Status)
        .end("InvalidationSummary");
    }

    xb.end("Items").end("InvalidationList");
    return this.xml(xb.build(), ctx);
  }

  private distributionXml(dist: Distribution): string {
    const config = dist.DistributionConfig;
    const xb = new XmlBuilder()
      .start("Distribution", { xmlns: NS })
      .elem("Id", dist.Id)
      .elem("ARN", dist.ARN)
      .elem("Status", dist.Status)
      .elem("LastModifiedTime", dist.LastModifiedTime)
      .elem("DomainName", dist.DomainName)
      .start("DistributionConfig")
      .elem("CallerReference", config.CallerReference)
      .elem("Comment", config.Comment ?? "")
      .elem("Enabled", config.Enabled);

    // Origins
    xb.start("Origins")
      .elem("Quantity", config.Origins.length)
      .start("Items");
    for (const origin of config.Origins) {
      xb.start("Origin")
        .elem("Id", origin.Id)
        .elem("DomainName", origin.DomainName)
        .end("Origin");
    }
    xb.end("Items").end("Origins");

    // DefaultCacheBehavior
    xb.start("DefaultCacheBehavior")
      .elem("TargetOriginId", config.DefaultCacheBehavior.TargetOriginId)
      .elem("ViewerProtocolPolicy", config.DefaultCacheBehavior.ViewerProtocolPolicy)
      .end("DefaultCacheBehavior");

    if (config.DefaultRootObject) {
      xb.elem("DefaultRootObject", config.DefaultRootObject);
    }
    if (config.PriceClass) {
      xb.elem("PriceClass", config.PriceClass);
    }

    xb.end("DistributionConfig").end("Distribution");
    return xb.build();
  }

  private invalidationXml(inv: Invalidation): string {
    const xb = new XmlBuilder()
      .start("Invalidation", { xmlns: NS })
      .elem("Id", inv.Id)
      .elem("Status", inv.Status)
      .elem("CreateTime", inv.CreateTime)
      .start("InvalidationBatch")
      .elem("CallerReference", inv.CallerReference)
      .start("Paths")
      .elem("Quantity", inv.Paths.length)
      .start("Items");

    for (const p of inv.Paths) {
      xb.elem("Path", p);
    }

    xb.end("Items").end("Paths").end("InvalidationBatch").end("Invalidation");
    return xb.build();
  }

  private xml(body: string, ctx: RequestContext, status = 200): Response {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
      status,
      headers: {
        "Content-Type": "application/xml",
        "x-amzn-RequestId": ctx.requestId,
      },
    });
  }

  private parseDistributionConfig(body: string): any {
    const callerReference = this.extractXmlValue(body, "CallerReference") ?? crypto.randomUUID();
    const comment = this.extractXmlValue(body, "Comment") ?? "";
    const enabledStr = this.extractXmlValue(body, "Enabled");
    const enabled = enabledStr ? enabledStr === "true" : true;
    const defaultRootObject = this.extractXmlValue(body, "DefaultRootObject");
    const priceClass = this.extractXmlValue(body, "PriceClass");

    // Parse Origins
    const origins: any[] = [];
    const originRegex = /<Origin>([\s\S]*?)<\/Origin>/g;
    let originMatch;
    while ((originMatch = originRegex.exec(body)) !== null) {
      const block = originMatch[1];
      origins.push({
        Id: this.extractXmlValue(block, "Id") ?? "",
        DomainName: this.extractXmlValue(block, "DomainName") ?? "",
      });
    }

    // Parse DefaultCacheBehavior
    const dcbBlock = body.match(/<DefaultCacheBehavior>([\s\S]*?)<\/DefaultCacheBehavior>/);
    const defaultCacheBehavior = {
      TargetOriginId: dcbBlock ? (this.extractXmlValue(dcbBlock[1], "TargetOriginId") ?? "") : "",
      ViewerProtocolPolicy: dcbBlock ? (this.extractXmlValue(dcbBlock[1], "ViewerProtocolPolicy") ?? "allow-all") : "allow-all",
    };

    return {
      CallerReference: callerReference,
      Comment: comment,
      Enabled: enabled,
      Origins: origins.length > 0 ? origins : [{ Id: "default", DomainName: "example.com" }],
      DefaultCacheBehavior: defaultCacheBehavior,
      DefaultRootObject: defaultRootObject,
      PriceClass: priceClass,
    };
  }

  private extractXmlValue(xml: string, tag: string): string | undefined {
    const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
    return match?.[1];
  }
}
