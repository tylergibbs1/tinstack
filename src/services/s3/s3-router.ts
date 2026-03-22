import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse, escapeXml } from "../../core/errors";
import { XmlBuilder } from "../../core/xml";
import type { S3Service } from "./s3-service";

export class S3Router {
  constructor(private service: S3Service) {}

  async dispatch(req: Request, ctx: RequestContext): Promise<Response> {
    try {
      const url = new URL(req.url);
      const { bucket, key } = this.parsePath(url, req.headers.get("host"));
      const method = req.method;
      const params = url.searchParams;

      // Bucket-level operations
      if (!key && !bucket) {
        return this.listBuckets(ctx);
      }

      if (bucket && !key) {
        // Check query params for sub-resources
        if (params.has("uploads")) {
          if (method === "GET") return this.listMultipartUploads(bucket, ctx);
        }
        if (params.has("delete") && method === "POST") {
          return this.deleteObjects(bucket, req, ctx);
        }
        if (params.has("location")) {
          return this.getBucketLocation(bucket, ctx);
        }

        // Bucket sub-resource GET handlers (Terraform compatibility)
        if (method === "GET") {
          const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
          if (params.has("policy")) return this.s3Error("NoSuchBucketPolicy", "The bucket policy does not exist", 404, ctx);
          if (params.has("versioning")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><VersioningConfiguration xmlns="${ns}"/>`, ctx);
          if (params.has("encryption")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><ServerSideEncryptionConfiguration xmlns="${ns}"><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>AES256</SSEAlgorithm></ApplyServerSideEncryptionByDefault><BucketKeyEnabled>false</BucketKeyEnabled></Rule></ServerSideEncryptionConfiguration>`, ctx);
          if (params.has("acl")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><AccessControlPolicy xmlns="${ns}"><Owner><ID>000000000000</ID><DisplayName>tinstack</DisplayName></Owner><AccessControlList><Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser"><ID>000000000000</ID><DisplayName>tinstack</DisplayName></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>`, ctx);
          if (params.has("tagging")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><Tagging xmlns="${ns}"><TagSet/></Tagging>`, ctx);
          if (params.has("cors")) return this.s3Error("NoSuchCORSConfiguration", "The CORS configuration does not exist", 404, ctx);
          if (params.has("logging")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><BucketLoggingStatus xmlns="${ns}"/>`, ctx);
          if (params.has("website")) return this.s3Error("NoSuchWebsiteConfiguration", "The specified bucket does not have a website configuration", 404, ctx);
          if (params.has("replication")) return this.s3Error("ReplicationConfigurationNotFoundError", "The replication configuration was not found", 404, ctx);
          if (params.has("request-payment")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><RequestPaymentConfiguration xmlns="${ns}"><Payer>BucketOwner</Payer></RequestPaymentConfiguration>`, ctx);
          if (params.has("object-lock")) return this.s3Error("ObjectLockConfigurationNotFoundError", "Object Lock configuration does not exist for this bucket", 404, ctx);
          if (params.has("ownershipControls")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><OwnershipControls xmlns="${ns}"><Rule><ObjectOwnership>BucketOwnerEnforced</ObjectOwnership></Rule></OwnershipControls>`, ctx);
          if (params.has("publicAccessBlock")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><PublicAccessBlockConfiguration xmlns="${ns}"><BlockPublicAcls>false</BlockPublicAcls><IgnorePublicAcls>false</IgnorePublicAcls><BlockPublicPolicy>false</BlockPublicPolicy><RestrictPublicBuckets>false</RestrictPublicBuckets></PublicAccessBlockConfiguration>`, ctx);
          if (params.has("accelerate")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><AccelerateConfiguration xmlns="${ns}"/>`, ctx);
        }

        // Bucket sub-resource PUT handlers (Terraform compatibility - stub 200 OK)
        if (method === "PUT") {
          if (params.has("policy") || params.has("versioning") || params.has("encryption") ||
              params.has("acl") || params.has("tagging") || params.has("cors") ||
              params.has("logging") || params.has("publicAccessBlock") || params.has("ownershipControls")) {
            return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
          }
        }

        // Bucket sub-resource DELETE handlers (Terraform compatibility - stub 204)
        if (method === "DELETE") {
          if (params.has("policy") || params.has("cors") || params.has("encryption") ||
              params.has("tagging") || params.has("publicAccessBlock") || params.has("ownershipControls")) {
            return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } });
          }
        }

        switch (method) {
          case "PUT":
            return this.createBucket(bucket, ctx);
          case "DELETE":
            return this.deleteBucket(bucket, ctx);
          case "HEAD":
            return this.headBucket(bucket, ctx);
          case "GET":
            return this.listObjects(bucket, params, ctx);
        }
      }

      // Object-level operations
      if (bucket && key) {
        // Multipart upload operations
        if (params.has("uploadId")) {
          const uploadId = params.get("uploadId")!;
          if (method === "PUT") {
            const partNumber = parseInt(params.get("partNumber") ?? "0");
            return this.uploadPart(bucket, key, uploadId, partNumber, req, ctx);
          }
          if (method === "POST") return this.completeMultipartUpload(bucket, key, uploadId, req, ctx);
          if (method === "DELETE") return this.abortMultipartUpload(bucket, key, uploadId, ctx);
          if (method === "GET") return this.listParts(bucket, key, uploadId, ctx);
        }

        if (params.has("uploads") && method === "POST") {
          return this.createMultipartUpload(bucket, key, req, ctx);
        }

        switch (method) {
          case "PUT": {
            // Check for copy source header
            const copySource = req.headers.get("x-amz-copy-source");
            if (copySource) return this.copyObject(copySource, bucket, key, req, ctx);
            return this.putObject(bucket, key, req, ctx);
          }
          case "GET":
            return this.getObject(bucket, key, ctx);
          case "HEAD":
            return this.headObject(bucket, key, ctx);
          case "DELETE":
            return this.deleteObject(bucket, key, ctx);
        }
      }

      return xmlErrorResponse(new AwsError("MethodNotAllowed", "The specified method is not allowed.", 405), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private parsePath(url: URL, host: string | null): { bucket?: string; key?: string } {
    // Virtual-host style: bucket.s3.localhost:4566
    if (host) {
      const hostParts = host.split(".");
      if (hostParts.length >= 3 && (hostParts[1] === "s3" || hostParts[1].startsWith("s3-"))) {
        const bucket = hostParts[0];
        const key = url.pathname.slice(1) || undefined;
        return { bucket, key };
      }
    }

    // Path-style: /bucket/key
    const path = decodeURIComponent(url.pathname);
    if (path === "/" || path === "") return {};
    const parts = path.slice(1).split("/");
    const bucket = parts[0];
    const key = parts.length > 1 ? parts.slice(1).join("/") : undefined;
    return { bucket, key: key || undefined };
  }

  private s3Error(code: string, message: string, status: number, ctx: RequestContext): Response {
    const body = `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${escapeXml(code)}</Code><Message>${escapeXml(message)}</Message><RequestId>${ctx.requestId}</RequestId></Error>`;
    return this.xml(body, ctx, status);
  }

  private xml(body: string, ctx: RequestContext, status = 200, headers?: Record<string, string>): Response {
    return new Response(body, {
      status,
      headers: {
        "Content-Type": "application/xml",
        "x-amz-request-id": ctx.requestId,
        "x-amz-id-2": ctx.requestId,
        ...headers,
      },
    });
  }

  private listBuckets(ctx: RequestContext): Response {
    const buckets = this.service.listBuckets();
    const xml = new XmlBuilder()
      .start("ListAllMyBucketsResult", { xmlns: "http://s3.amazonaws.com/doc/2006-03-01/" })
      .start("Owner")
      .elem("ID", ctx.accountId)
      .elem("DisplayName", "tinstack")
      .end("Owner")
      .start("Buckets");
    for (const b of buckets) {
      xml.start("Bucket")
        .elem("Name", b.name)
        .elem("CreationDate", b.creationDate)
        .end("Bucket");
    }
    xml.end("Buckets").end("ListAllMyBucketsResult");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private createBucket(bucket: string, ctx: RequestContext): Response {
    this.service.createBucket(bucket, ctx.region);
    return new Response(null, {
      status: 200,
      headers: {
        Location: `/${bucket}`,
        "x-amz-request-id": ctx.requestId,
      },
    });
  }

  private deleteBucket(bucket: string, ctx: RequestContext): Response {
    this.service.deleteBucket(bucket);
    return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } });
  }

  private headBucket(bucket: string, ctx: RequestContext): Response {
    this.service.headBucket(bucket);
    return new Response(null, {
      status: 200,
      headers: {
        "x-amz-bucket-region": ctx.region,
        "x-amz-request-id": ctx.requestId,
      },
    });
  }

  private listObjects(bucket: string, params: URLSearchParams, ctx: RequestContext): Response {
    const listType = params.get("list-type");
    const prefix = params.get("prefix") ?? "";
    const delimiter = params.get("delimiter") ?? "";
    const maxKeys = parseInt(params.get("max-keys") ?? "1000");
    const continuationToken = params.get("continuation-token") ?? undefined;
    const startAfter = params.get("start-after") ?? undefined;

    const result = this.service.listObjectsV2(bucket, prefix, delimiter, maxKeys, continuationToken, startAfter);

    const xml = new XmlBuilder()
      .start("ListBucketResult", { xmlns: "http://s3.amazonaws.com/doc/2006-03-01/" })
      .elem("Name", bucket)
      .elem("Prefix", prefix)
      .elem("MaxKeys", maxKeys)
      .elem("KeyCount", result.keyCount)
      .elem("IsTruncated", result.isTruncated);

    if (delimiter) xml.elem("Delimiter", delimiter);
    if (result.nextContinuationToken) xml.elem("NextContinuationToken", result.nextContinuationToken);

    for (const obj of result.contents) {
      xml.start("Contents")
        .elem("Key", obj.key)
        .elem("LastModified", new Date(obj.lastModified).toISOString())
        .elem("ETag", obj.etag)
        .elem("Size", obj.contentLength)
        .elem("StorageClass", obj.storageClass)
        .end("Contents");
    }

    for (const cp of result.commonPrefixes) {
      xml.start("CommonPrefixes").elem("Prefix", cp).end("CommonPrefixes");
    }

    xml.end("ListBucketResult");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private async putObject(bucket: string, key: string, req: Request, ctx: RequestContext): Promise<Response> {
    const data = Buffer.from(await req.arrayBuffer());
    const contentType = req.headers.get("content-type") ?? "application/octet-stream";
    const metadata: Record<string, string> = {};
    for (const [k, v] of req.headers) {
      if (k.startsWith("x-amz-meta-")) {
        metadata[k.slice(11)] = v;
      }
    }
    const obj = this.service.putObject(bucket, key, data, contentType, metadata);
    return new Response(null, {
      status: 200,
      headers: {
        ETag: obj.etag,
        "x-amz-request-id": ctx.requestId,
      },
    });
  }

  private getObject(bucket: string, key: string, ctx: RequestContext): Response {
    const obj = this.service.getObject(bucket, key);
    const headers: Record<string, string> = {
      "Content-Type": obj.contentType,
      "Content-Length": String(obj.contentLength),
      ETag: obj.etag,
      "Last-Modified": obj.lastModified,
      "x-amz-request-id": ctx.requestId,
    };
    for (const [k, v] of Object.entries(obj.metadata)) {
      headers[`x-amz-meta-${k}`] = v;
    }
    return new Response(obj.data, { status: 200, headers });
  }

  private headObject(bucket: string, key: string, ctx: RequestContext): Response {
    const obj = this.service.headObject(bucket, key);
    const headers: Record<string, string> = {
      "Content-Type": obj.contentType,
      "Content-Length": String(obj.contentLength),
      ETag: obj.etag,
      "Last-Modified": obj.lastModified,
      "x-amz-request-id": ctx.requestId,
    };
    for (const [k, v] of Object.entries(obj.metadata)) {
      headers[`x-amz-meta-${k}`] = v;
    }
    return new Response(null, { status: 200, headers });
  }

  private deleteObject(bucket: string, key: string, ctx: RequestContext): Response {
    this.service.deleteObject(bucket, key);
    return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } });
  }

  private async deleteObjects(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    // Parse XML to extract keys
    const keys: string[] = [];
    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    let match;
    while ((match = keyRegex.exec(body)) !== null) {
      keys.push(match[1]);
    }
    const result = this.service.deleteObjects(bucket, keys);
    const xml = new XmlBuilder()
      .start("DeleteResult", { xmlns: "http://s3.amazonaws.com/doc/2006-03-01/" });
    for (const key of result.deleted) {
      xml.start("Deleted").elem("Key", key).end("Deleted");
    }
    xml.end("DeleteResult");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private async copyObject(copySource: string, dstBucket: string, dstKey: string, req: Request, ctx: RequestContext): Promise<Response> {
    // copySource format: /bucket/key or bucket/key
    const decoded = decodeURIComponent(copySource);
    const src = decoded.startsWith("/") ? decoded.slice(1) : decoded;
    const slashIdx = src.indexOf("/");
    const srcBucket = src.slice(0, slashIdx);
    const srcKey = src.slice(slashIdx + 1);

    const obj = this.service.copyObject(srcBucket, srcKey, dstBucket, dstKey);
    const xml = new XmlBuilder()
      .start("CopyObjectResult")
      .elem("LastModified", new Date(obj.lastModified).toISOString())
      .elem("ETag", obj.etag)
      .end("CopyObjectResult");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private async createMultipartUpload(bucket: string, key: string, req: Request, ctx: RequestContext): Promise<Response> {
    const contentType = req.headers.get("content-type") ?? "application/octet-stream";
    const metadata: Record<string, string> = {};
    for (const [k, v] of req.headers) {
      if (k.startsWith("x-amz-meta-")) metadata[k.slice(11)] = v;
    }
    const uploadId = this.service.createMultipartUpload(bucket, key, contentType, metadata);
    const xml = new XmlBuilder()
      .start("InitiateMultipartUploadResult", { xmlns: "http://s3.amazonaws.com/doc/2006-03-01/" })
      .elem("Bucket", bucket)
      .elem("Key", key)
      .elem("UploadId", uploadId)
      .end("InitiateMultipartUploadResult");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private async uploadPart(bucket: string, key: string, uploadId: string, partNumber: number, req: Request, ctx: RequestContext): Promise<Response> {
    const data = Buffer.from(await req.arrayBuffer());
    const etag = this.service.uploadPart(bucket, key, uploadId, partNumber, data);
    return new Response(null, {
      status: 200,
      headers: { ETag: etag, "x-amz-request-id": ctx.requestId },
    });
  }

  private async completeMultipartUpload(bucket: string, key: string, uploadId: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const parts: { PartNumber: number; ETag: string }[] = [];
    // SDK may send ETag before or after PartNumber, so extract each separately
    const partRegex = /<Part>([\s\S]*?)<\/Part>/g;
    let match;
    while ((match = partRegex.exec(body)) !== null) {
      const partXml = match[1];
      const partNum = partXml.match(/<PartNumber>(\d+)<\/PartNumber>/);
      const etag = partXml.match(/<ETag>([^<]+)<\/ETag>/);
      if (partNum && etag) {
        // Decode XML entities like &quot;
        const etagValue = etag[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        parts.push({ PartNumber: parseInt(partNum[1]), ETag: etagValue });
      }
    }
    const obj = this.service.completeMultipartUpload(bucket, key, uploadId, parts);
    const xml = new XmlBuilder()
      .start("CompleteMultipartUploadResult", { xmlns: "http://s3.amazonaws.com/doc/2006-03-01/" })
      .elem("Bucket", bucket)
      .elem("Key", key)
      .elem("ETag", obj.etag)
      .end("CompleteMultipartUploadResult");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private abortMultipartUpload(bucket: string, key: string, uploadId: string, ctx: RequestContext): Response {
    this.service.abortMultipartUpload(bucket, key, uploadId);
    return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } });
  }

  private listMultipartUploads(bucket: string, ctx: RequestContext): Response {
    const uploads = this.service.listMultipartUploads(bucket);
    const xml = new XmlBuilder()
      .start("ListMultipartUploadsResult", { xmlns: "http://s3.amazonaws.com/doc/2006-03-01/" })
      .elem("Bucket", bucket);
    for (const u of uploads) {
      xml.start("Upload")
        .elem("Key", u.key)
        .elem("UploadId", u.uploadId)
        .elem("Initiated", u.initiated)
        .end("Upload");
    }
    xml.end("ListMultipartUploadsResult");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private listParts(bucket: string, key: string, uploadId: string, ctx: RequestContext): Response {
    const parts = this.service.listParts(bucket, key, uploadId);
    const xml = new XmlBuilder()
      .start("ListPartsResult", { xmlns: "http://s3.amazonaws.com/doc/2006-03-01/" })
      .elem("Bucket", bucket)
      .elem("Key", key)
      .elem("UploadId", uploadId);
    for (const p of parts) {
      xml.start("Part")
        .elem("PartNumber", p.partNumber)
        .elem("ETag", p.etag)
        .elem("Size", p.size)
        .end("Part");
    }
    xml.end("ListPartsResult");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private getBucketLocation(bucket: string, ctx: RequestContext): Response {
    const location = this.service.getBucketLocation(bucket);
    const xml = `<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${escapeXml(location)}</LocationConstraint>`;
    return this.xml(xml, ctx);
  }
}
