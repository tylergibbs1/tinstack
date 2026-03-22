import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import type { S3ControlService } from "./s3control-service";

export class S3ControlHandler {
  constructor(private service: S3ControlService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- Access Points ---
      const apMatch = path.match(/^\/v20180820\/accesspoint\/([^/]+)$/);
      if (apMatch) {
        const name = decodeURIComponent(apMatch[1]);
        if (method === "PUT") {
          const body = await this.parseBody(req);
          const ap = this.service.createAccessPoint(
            name,
            body.Bucket ?? body.CreateAccessPointRequest?.Bucket,
            body.VpcConfiguration ?? body.CreateAccessPointRequest?.VpcConfiguration,
            body.PublicAccessBlockConfiguration ?? body.CreateAccessPointRequest?.PublicAccessBlockConfiguration,
            ctx.region,
          );
          return this.xml(`<CreateAccessPointResult><AccessPointArn>${ap.accessPointArn}</AccessPointArn><Alias>${ap.alias}</Alias></CreateAccessPointResult>`, ctx);
        }
        if (method === "GET") {
          const ap = this.service.getAccessPoint(name);
          return this.xml(`<GetAccessPointResult><Name>${ap.name}</Name><Bucket>${ap.bucket}</Bucket><Alias>${ap.alias}</Alias><AccessPointArn>${ap.accessPointArn}</AccessPointArn><NetworkOrigin>${ap.networkOrigin}</NetworkOrigin>${ap.vpcId ? `<VpcConfiguration><VpcId>${ap.vpcId}</VpcId></VpcConfiguration>` : ""}<CreationDate>${ap.creationDate}</CreationDate><PublicAccessBlockConfiguration><BlockPublicAcls>${ap.publicAccessBlock.BlockPublicAcls}</BlockPublicAcls><IgnorePublicAcls>${ap.publicAccessBlock.IgnorePublicAcls}</IgnorePublicAcls><BlockPublicPolicy>${ap.publicAccessBlock.BlockPublicPolicy}</BlockPublicPolicy><RestrictPublicBuckets>${ap.publicAccessBlock.RestrictPublicBuckets}</RestrictPublicBuckets></PublicAccessBlockConfiguration></GetAccessPointResult>`, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteAccessPoint(name);
          return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
        }
      }

      // GET /v20180820/accesspoint
      if (path === "/v20180820/accesspoint" && method === "GET") {
        const bucket = url.searchParams.get("bucket") ?? undefined;
        const aps = this.service.listAccessPoints(bucket);
        return this.xml(
          `<ListAccessPointsResult><AccessPointList>${aps.map((ap) => `<AccessPoint><Name>${ap.name}</Name><Bucket>${ap.bucket}</Bucket><AccessPointArn>${ap.accessPointArn}</AccessPointArn><NetworkOrigin>${ap.networkOrigin}</NetworkOrigin></AccessPoint>`).join("")}</AccessPointList></ListAccessPointsResult>`,
          ctx,
        );
      }

      // --- Public Access Block ---
      if (path === "/v20180820/configuration/publicAccessBlock") {
        const accountId = req.headers.get("x-amz-account-id") ?? ctx.accountId;
        if (method === "PUT") {
          const body = await this.parseBody(req);
          const config = body.PublicAccessBlockConfiguration ?? body;
          this.service.putPublicAccessBlock(accountId, {
            BlockPublicAcls: parseBool(config.BlockPublicAcls),
            IgnorePublicAcls: parseBool(config.IgnorePublicAcls),
            BlockPublicPolicy: parseBool(config.BlockPublicPolicy),
            RestrictPublicBuckets: parseBool(config.RestrictPublicBuckets),
          });
          return new Response(null, { status: 200, headers: { "x-amzn-RequestId": ctx.requestId } });
        }
        if (method === "GET") {
          const config = this.service.getPublicAccessBlock(accountId);
          return this.xml(`<PublicAccessBlockConfiguration><BlockPublicAcls>${config.BlockPublicAcls}</BlockPublicAcls><IgnorePublicAcls>${config.IgnorePublicAcls}</IgnorePublicAcls><BlockPublicPolicy>${config.BlockPublicPolicy}</BlockPublicPolicy><RestrictPublicBuckets>${config.RestrictPublicBuckets}</RestrictPublicBuckets></PublicAccessBlockConfiguration>`, ctx);
        }
        if (method === "DELETE") {
          this.service.deletePublicAccessBlock(accountId);
          return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
        }
      }

      // --- Outposts Buckets ---
      const bucketMatch = path.match(/^\/v20180820\/bucket\/([^/]+)$/);
      if (bucketMatch) {
        if (method === "PUT") {
          const body = await this.parseBody(req);
          const ob = this.service.createBucket(
            decodeURIComponent(bucketMatch[1]),
            body.OutpostId ?? body.CreateBucketRequest?.OutpostId ?? "op-0001",
            ctx.region,
          );
          return this.xml(`<CreateBucketResult><BucketArn>${ob.bucketArn}</BucketArn></CreateBucketResult>`, ctx);
        }
        if (method === "GET") {
          const ob = this.service.getBucket(decodeURIComponent(bucketMatch[1]));
          return this.xml(`<GetBucketResult><Bucket>${ob.bucket}</Bucket><BucketArn>${ob.bucketArn}</BucketArn><OutpostId>${ob.outpostId}</OutpostId><CreationDate>${ob.creationDate}</CreationDate></GetBucketResult>`, ctx);
        }
      }

      // GET /v20180820/bucket
      if (path === "/v20180820/bucket" && method === "GET") {
        const outpostId = url.searchParams.get("outpostId") ?? undefined;
        const buckets = this.service.listRegionalBuckets(outpostId);
        return this.xml(`<ListRegionalBucketsResult><RegionalBucketList>${buckets.map((b) => `<RegionalBucket><Bucket>${b.bucket}</Bucket><BucketArn>${b.bucketArn}</BucketArn><OutpostId>${b.outpostId}</OutpostId><CreationDate>${b.creationDate}</CreationDate></RegionalBucket>`).join("")}</RegionalBucketList></ListRegionalBucketsResult>`, ctx);
      }

      // --- Storage Lens ---
      const slMatch = path.match(/^\/v20180820\/storagelens\/([^/]+)$/);
      if (slMatch) {
        const configId = decodeURIComponent(slMatch[1]);
        if (method === "PUT") {
          const body = await this.parseBody(req);
          const slConfig = body.StorageLensConfiguration ?? body;
          this.service.putStorageLensConfiguration(
            configId,
            slConfig,
            body.Tags,
            ctx.region,
          );
          return new Response(null, { status: 200, headers: { "x-amzn-RequestId": ctx.requestId } });
        }
        if (method === "GET") {
          const config = this.service.getStorageLensConfiguration(configId);
          return this.xml(`<StorageLensConfiguration><Id>${config.id}</Id><StorageLensArn>${config.storageLensArn}</StorageLensArn><HomeRegion>${config.homeRegion}</HomeRegion><IsEnabled>${config.isEnabled}</IsEnabled><AccountLevel></AccountLevel></StorageLensConfiguration>`, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteStorageLensConfiguration(configId);
          return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
        }
      }

      // GET /v20180820/storagelens
      if (path === "/v20180820/storagelens" && method === "GET") {
        const configs = this.service.listStorageLensConfigurations();
        return this.xml(`<ListStorageLensConfigurationResult>${configs.map((c) => `<StorageLensConfiguration><Id>${c.id}</Id><StorageLensArn>${c.storageLensArn}</StorageLensArn><HomeRegion>${c.homeRegion}</HomeRegion><IsEnabled>${c.isEnabled}</IsEnabled></StorageLensConfiguration>`).join("")}</ListStorageLensConfigurationResult>`, ctx);
      }

      return xmlErrorResponse(
        new AwsError("UnknownOperationException", `Unknown S3 Control operation: ${method} ${path}`, 404),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private async parseBody(req: Request): Promise<any> {
    const text = await req.text();
    if (!text) return {};
    // Try JSON first
    try {
      return JSON.parse(text);
    } catch {
      // Parse simple XML
      return parseSimpleXml(text);
    }
  }

  private xml(body: string, ctx: RequestContext, status = 200): Response {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
      status,
      headers: { "Content-Type": "application/xml", "x-amzn-RequestId": ctx.requestId },
    });
  }
}

function parseBool(val: any): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val.toLowerCase() === "true";
  return !!val;
}

function parseSimpleXml(xml: string): any {
  const result: any = {};
  // Strip XML declaration
  const content = xml.replace(/<\?xml[^?]*\?>\s*/g, "");
  // Extract top-level element content
  const topMatch = content.match(/^<(\w+)>([\s\S]*)<\/\1>$/);
  if (topMatch) {
    return { [topMatch[1]]: parseXmlContent(topMatch[2]) };
  }
  return parseXmlContent(content);
}

function parseXmlContent(xml: string): any {
  const result: any = {};
  const tagRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let match;
  let hasChildren = false;
  while ((match = tagRegex.exec(xml)) !== null) {
    hasChildren = true;
    const [, tag, content] = match;
    // Check if content has nested tags
    if (/<\w+>/.test(content)) {
      result[tag] = parseXmlContent(content);
    } else {
      result[tag] = content;
    }
  }
  if (!hasChildren) return xml;
  return result;
}
