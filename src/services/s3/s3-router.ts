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

        // Bucket sub-resource GET handlers
        if (method === "GET") {
          const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
          if (params.has("versioning")) return this.getBucketVersioning(bucket, ctx);
          if (params.has("tagging")) return this.getBucketTagging(bucket, ctx);
          if (params.has("policy")) return this.getBucketPolicy(bucket, ctx);
          if (params.has("cors")) return this.getBucketCors(bucket, ctx);
          if (params.has("encryption")) return this.getBucketEncryption(bucket, ctx);
          if (params.has("notification")) return this.getBucketNotificationConfiguration(bucket, ctx);
          if (params.has("versions")) return this.listObjectVersions(bucket, params, ctx);
          if (params.has("acl")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><AccessControlPolicy xmlns="${ns}"><Owner><ID>000000000000</ID><DisplayName>tinstack</DisplayName></Owner><AccessControlList><Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser"><ID>000000000000</ID><DisplayName>tinstack</DisplayName></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>`, ctx);
          if (params.has("logging")) return this.getBucketLogging(bucket, ctx);
          if (params.has("website")) return this.getBucketWebsite(bucket, ctx);
          if (params.has("replication")) return this.s3Error("ReplicationConfigurationNotFoundError", "The replication configuration was not found", 404, ctx);
          if (params.has("request-payment")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><RequestPaymentConfiguration xmlns="${ns}"><Payer>BucketOwner</Payer></RequestPaymentConfiguration>`, ctx);
          if (params.has("object-lock")) return this.getObjectLockConfiguration(bucket, ctx);
          if (params.has("ownershipControls")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><OwnershipControls xmlns="${ns}"><Rule><ObjectOwnership>BucketOwnerEnforced</ObjectOwnership></Rule></OwnershipControls>`, ctx);
          if (params.has("publicAccessBlock")) return this.getPublicAccessBlock(bucket, ctx);
          if (params.has("accelerate")) return this.xml(`<?xml version="1.0" encoding="UTF-8"?><AccelerateConfiguration xmlns="${ns}"/>`, ctx);
          if (params.has("lifecycle")) return this.getBucketLifecycleConfiguration(bucket, ctx);
        }

        // Bucket sub-resource PUT handlers
        if (method === "PUT") {
          if (params.has("versioning")) return this.putBucketVersioning(bucket, req, ctx);
          if (params.has("tagging")) return this.putBucketTagging(bucket, req, ctx);
          if (params.has("policy")) return this.putBucketPolicy(bucket, req, ctx);
          if (params.has("cors")) return this.putBucketCors(bucket, req, ctx);
          if (params.has("lifecycle")) return this.putBucketLifecycleConfiguration(bucket, req, ctx);
          if (params.has("encryption")) return this.putBucketEncryption(bucket, req, ctx);
          if (params.has("notification")) return this.putBucketNotificationConfiguration(bucket, req, ctx);
          if (params.has("website")) return this.putBucketWebsite(bucket, req, ctx);
          if (params.has("publicAccessBlock")) return this.putPublicAccessBlock(bucket, req, ctx);
          if (params.has("logging")) return this.putBucketLogging(bucket, req, ctx);
          if (params.has("object-lock")) return this.putObjectLockConfiguration(bucket, req, ctx);
          if (params.has("acl") || params.has("ownershipControls")) {
            return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
          }
        }

        // Bucket sub-resource DELETE handlers
        if (method === "DELETE") {
          if (params.has("policy")) { this.service.deleteBucketPolicy(bucket); return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } }); }
          if (params.has("cors")) { this.service.deleteBucketCors(bucket); return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } }); }
          if (params.has("tagging")) { this.service.deleteBucketTagging(bucket); return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } }); }
          if (params.has("lifecycle")) { this.service.deleteBucketLifecycle(bucket); return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } }); }
          if (params.has("encryption")) { this.service.deleteBucketEncryption(bucket); return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } }); }
          if (params.has("website")) { this.service.deleteBucketWebsite(bucket); return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } }); }
          if (params.has("publicAccessBlock")) { this.service.deletePublicAccessBlock(bucket); return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } }); }
          if (params.has("ownershipControls")) {
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
        // Object retention
        if (params.has("retention")) {
          if (method === "GET") return this.getObjectRetention(bucket, key, ctx);
          if (method === "PUT") return this.putObjectRetention(bucket, key, req, ctx);
        }

        // Object legal hold
        if (params.has("legal-hold")) {
          if (method === "GET") return this.getObjectLegalHold(bucket, key, ctx);
          if (method === "PUT") return this.putObjectLegalHold(bucket, key, req, ctx);
        }

        // Object attributes
        if (params.has("attributes") && method === "GET") {
          return this.getObjectAttributes(bucket, key, req, ctx);
        }

        // Object tagging
        if (params.has("tagging")) {
          if (method === "GET") return this.getObjectTagging(bucket, key, ctx);
          if (method === "PUT") return this.putObjectTagging(bucket, key, req, ctx);
          if (method === "DELETE") return this.deleteObjectTagging(bucket, key, ctx);
        }

        // Object ACL
        if (params.has("acl")) {
          if (method === "GET") return this.getObjectAcl(bucket, key, ctx);
          if (method === "PUT") return this.putObjectAcl(bucket, key, req, ctx);
        }

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
            return this.getObject(bucket, key, params, ctx);
          case "HEAD":
            return this.headObject(bucket, key, params, ctx);
          case "DELETE":
            return this.deleteObject(bucket, key, params, ctx);
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

    // ListObjectsV1 (when list-type param is absent)
    if (listType !== "2") {
      const marker = params.get("marker") ?? undefined;
      const result = this.service.listObjectsV1(bucket, prefix, delimiter, maxKeys, marker);

      const xml = new XmlBuilder()
        .start("ListBucketResult", { xmlns: "http://s3.amazonaws.com/doc/2006-03-01/" })
        .elem("Name", bucket)
        .elem("Prefix", prefix)
        .elem("MaxKeys", maxKeys)
        .elem("IsTruncated", result.isTruncated);

      if (marker) xml.elem("Marker", marker);
      if (delimiter) xml.elem("Delimiter", delimiter);
      if (result.nextMarker) xml.elem("NextMarker", result.nextMarker);

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

    // ListObjectsV2
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

  private getObject(bucket: string, key: string, params: URLSearchParams, ctx: RequestContext): Response {
    const versionId = params.get("versionId") ?? undefined;
    try {
      const obj = this.service.getObject(bucket, key, versionId);
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
    } catch (e: any) {
      if (e instanceof AwsError && e.deleteMarker) {
        return xmlErrorResponse(
          e,
          ctx.requestId,
          { "x-amz-delete-marker": "true", "x-amz-version-id": e.versionId ?? "" },
        );
      }
      throw e;
    }
  }

  private headObject(bucket: string, key: string, params: URLSearchParams, ctx: RequestContext): Response {
    const versionId = params.get("versionId") ?? undefined;
    try {
      const obj = this.service.headObject(bucket, key, versionId);
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
    } catch (e: any) {
      if (e instanceof AwsError && e.deleteMarker) {
        return new Response(null, {
          status: 404,
          headers: {
            "x-amz-delete-marker": "true",
            "x-amz-version-id": e.versionId ?? "",
            "x-amz-request-id": ctx.requestId,
          },
        });
      }
      throw e;
    }
  }

  private deleteObject(bucket: string, key: string, params: URLSearchParams, ctx: RequestContext): Response {
    const versionId = params.get("versionId") ?? undefined;
    const result = this.service.deleteObject(bucket, key, versionId);
    const headers: Record<string, string> = { "x-amz-request-id": ctx.requestId };
    if (result.deleteMarker) headers["x-amz-delete-marker"] = "true";
    if (result.versionId) headers["x-amz-version-id"] = result.versionId;
    return new Response(null, { status: 204, headers });
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

  private getBucketVersioning(bucket: string, ctx: RequestContext): Response {
    const status = this.service.getBucketVersioning(bucket);
    const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
    if (!status) {
      return this.xml(`<?xml version="1.0" encoding="UTF-8"?><VersioningConfiguration xmlns="${ns}"/>`, ctx);
    }
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?><VersioningConfiguration xmlns="${ns}"><Status>${status}</Status></VersioningConfiguration>`, ctx);
  }

  private async putBucketVersioning(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const statusMatch = body.match(/<Status>([^<]+)<\/Status>/);
    const status = statusMatch ? statusMatch[1] : "";
    this.service.putBucketVersioning(bucket, status);
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  private getBucketTagging(bucket: string, ctx: RequestContext): Response {
    const tags = this.service.getBucketTagging(bucket);
    const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
    const xml = new XmlBuilder().start("Tagging", { xmlns: ns }).start("TagSet");
    for (const [k, v] of Object.entries(tags)) {
      xml.start("Tag").elem("Key", k).elem("Value", v).end("Tag");
    }
    xml.end("TagSet").end("Tagging");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private async putBucketTagging(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const tags: Record<string, string> = {};
    const tagRegex = /<Tag>\s*<Key>([^<]+)<\/Key>\s*<Value>([^<]*)<\/Value>\s*<\/Tag>/g;
    let match;
    while ((match = tagRegex.exec(body)) !== null) {
      tags[match[1]] = match[2];
    }
    this.service.putBucketTagging(bucket, tags);
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  private getBucketPolicy(bucket: string, ctx: RequestContext): Response {
    const policy = this.service.getBucketPolicy(bucket);
    return new Response(policy, {
      status: 200,
      headers: { "Content-Type": "application/json", "x-amz-request-id": ctx.requestId },
    });
  }

  private async putBucketPolicy(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    this.service.putBucketPolicy(bucket, body);
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  private getBucketCors(bucket: string, ctx: RequestContext): Response {
    const cors = this.service.getBucketCors(bucket);
    const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
    const xml = new XmlBuilder().start("CORSConfiguration", { xmlns: ns });
    for (const rule of cors) {
      xml.start("CORSRule");
      if (rule.AllowedOrigins) for (const o of rule.AllowedOrigins) xml.elem("AllowedOrigin", o);
      if (rule.AllowedMethods) for (const m of rule.AllowedMethods) xml.elem("AllowedMethod", m);
      if (rule.AllowedHeaders) for (const h of rule.AllowedHeaders) xml.elem("AllowedHeader", h);
      if (rule.MaxAgeSeconds !== undefined) xml.elem("MaxAgeSeconds", rule.MaxAgeSeconds);
      xml.end("CORSRule");
    }
    xml.end("CORSConfiguration");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private async putBucketCors(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const cors: any[] = [];
    const ruleRegex = /<CORSRule>([\s\S]*?)<\/CORSRule>/g;
    let match;
    while ((match = ruleRegex.exec(body)) !== null) {
      const ruleXml = match[1];
      const rule: any = {};
      const origins = [...ruleXml.matchAll(/<AllowedOrigin>([^<]*)<\/AllowedOrigin>/g)].map(m => m[1]);
      const methods = [...ruleXml.matchAll(/<AllowedMethod>([^<]*)<\/AllowedMethod>/g)].map(m => m[1]);
      const headers = [...ruleXml.matchAll(/<AllowedHeader>([^<]*)<\/AllowedHeader>/g)].map(m => m[1]);
      const maxAge = ruleXml.match(/<MaxAgeSeconds>(\d+)<\/MaxAgeSeconds>/);
      if (origins.length) rule.AllowedOrigins = origins;
      if (methods.length) rule.AllowedMethods = methods;
      if (headers.length) rule.AllowedHeaders = headers;
      if (maxAge) rule.MaxAgeSeconds = parseInt(maxAge[1]);
      cors.push(rule);
    }
    this.service.putBucketCors(bucket, cors);
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  private getObjectTagging(bucket: string, key: string, ctx: RequestContext): Response {
    const tags = this.service.getObjectTagging(bucket, key);
    const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
    const xml = new XmlBuilder().start("Tagging", { xmlns: ns }).start("TagSet");
    for (const [k, v] of Object.entries(tags)) {
      xml.start("Tag").elem("Key", k).elem("Value", v).end("Tag");
    }
    xml.end("TagSet").end("Tagging");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private async putObjectTagging(bucket: string, key: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const tags: Record<string, string> = {};
    const tagRegex = /<Tag>\s*<Key>([^<]+)<\/Key>\s*<Value>([^<]*)<\/Value>\s*<\/Tag>/g;
    let match;
    while ((match = tagRegex.exec(body)) !== null) {
      tags[match[1]] = match[2];
    }
    this.service.putObjectTagging(bucket, key, tags);
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  private deleteObjectTagging(bucket: string, key: string, ctx: RequestContext): Response {
    this.service.deleteObjectTagging(bucket, key);
    return new Response(null, { status: 204, headers: { "x-amz-request-id": ctx.requestId } });
  }

  // Bucket Lifecycle Configuration
  private getBucketLifecycleConfiguration(bucket: string, ctx: RequestContext): Response {
    try {
      const rules = this.service.getBucketLifecycleConfiguration(bucket);
      const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
      const xml = new XmlBuilder().start("LifecycleConfiguration", { xmlns: ns });
      for (const rule of rules) {
        xml.start("Rule");
        if (rule.ID) xml.elem("ID", rule.ID);
        if (rule.Prefix !== undefined) xml.elem("Prefix", rule.Prefix);
        if (rule.Filter) {
          xml.start("Filter");
          if (rule.Filter.Prefix !== undefined) xml.elem("Prefix", rule.Filter.Prefix);
          xml.end("Filter");
        }
        xml.elem("Status", rule.Status ?? "Enabled");
        if (rule.Transitions) {
          for (const t of rule.Transitions) {
            xml.start("Transition");
            if (t.Days !== undefined) xml.elem("Days", t.Days);
            if (t.Date) xml.elem("Date", t.Date);
            if (t.StorageClass) xml.elem("StorageClass", t.StorageClass);
            xml.end("Transition");
          }
        }
        if (rule.Expiration) {
          xml.start("Expiration");
          if (rule.Expiration.Days !== undefined) xml.elem("Days", rule.Expiration.Days);
          if (rule.Expiration.Date) xml.elem("Date", rule.Expiration.Date);
          if (rule.Expiration.ExpiredObjectDeleteMarker !== undefined) xml.elem("ExpiredObjectDeleteMarker", rule.Expiration.ExpiredObjectDeleteMarker);
          xml.end("Expiration");
        }
        if (rule.NoncurrentVersionExpiration) {
          xml.start("NoncurrentVersionExpiration");
          if (rule.NoncurrentVersionExpiration.NoncurrentDays !== undefined) xml.elem("NoncurrentDays", rule.NoncurrentVersionExpiration.NoncurrentDays);
          xml.end("NoncurrentVersionExpiration");
        }
        xml.end("Rule");
      }
      xml.end("LifecycleConfiguration");
      return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private async putBucketLifecycleConfiguration(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const rules: any[] = [];
    const ruleRegex = /<Rule>([\s\S]*?)<\/Rule>/g;
    let match;
    while ((match = ruleRegex.exec(body)) !== null) {
      const ruleXml = match[1];
      const rule: any = {};
      const id = ruleXml.match(/<ID>([^<]*)<\/ID>/);
      if (id) rule.ID = id[1];
      const prefix = ruleXml.match(/<Prefix>([^<]*)<\/Prefix>/);
      if (prefix) rule.Prefix = prefix[1];
      // Filter
      const filterMatch = ruleXml.match(/<Filter>([\s\S]*?)<\/Filter>/);
      if (filterMatch) {
        rule.Filter = {};
        const fp = filterMatch[1].match(/<Prefix>([^<]*)<\/Prefix>/);
        if (fp) rule.Filter.Prefix = fp[1];
      }
      const status = ruleXml.match(/<Status>([^<]+)<\/Status>/);
      if (status) rule.Status = status[1];
      // Transitions
      const transitions: any[] = [];
      const transRegex = /<Transition>([\s\S]*?)<\/Transition>/g;
      let tm;
      while ((tm = transRegex.exec(ruleXml)) !== null) {
        const t: any = {};
        const days = tm[1].match(/<Days>(\d+)<\/Days>/);
        if (days) t.Days = parseInt(days[1]);
        const date = tm[1].match(/<Date>([^<]+)<\/Date>/);
        if (date) t.Date = date[1];
        const sc = tm[1].match(/<StorageClass>([^<]+)<\/StorageClass>/);
        if (sc) t.StorageClass = sc[1];
        transitions.push(t);
      }
      if (transitions.length) rule.Transitions = transitions;
      // Expiration
      const expMatch = ruleXml.match(/<Expiration>([\s\S]*?)<\/Expiration>/);
      if (expMatch) {
        rule.Expiration = {};
        const days = expMatch[1].match(/<Days>(\d+)<\/Days>/);
        if (days) rule.Expiration.Days = parseInt(days[1]);
        const date = expMatch[1].match(/<Date>([^<]+)<\/Date>/);
        if (date) rule.Expiration.Date = date[1];
      }
      // NoncurrentVersionExpiration
      const nveMatch = ruleXml.match(/<NoncurrentVersionExpiration>([\s\S]*?)<\/NoncurrentVersionExpiration>/);
      if (nveMatch) {
        rule.NoncurrentVersionExpiration = {};
        const days = nveMatch[1].match(/<NoncurrentDays>(\d+)<\/NoncurrentDays>/);
        if (days) rule.NoncurrentVersionExpiration.NoncurrentDays = parseInt(days[1]);
      }
      rules.push(rule);
    }
    this.service.putBucketLifecycleConfiguration(bucket, rules);
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  // Bucket Encryption
  private getBucketEncryption(bucket: string, ctx: RequestContext): Response {
    try {
      const config = this.service.getBucketEncryption(bucket);
      const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
      const xml = new XmlBuilder().start("ServerSideEncryptionConfiguration", { xmlns: ns });
      for (const rule of config.rules ?? [config]) {
        xml.start("Rule").start("ApplyServerSideEncryptionByDefault");
        xml.elem("SSEAlgorithm", rule.SSEAlgorithm ?? "AES256");
        if (rule.KMSMasterKeyID) xml.elem("KMSMasterKeyID", rule.KMSMasterKeyID);
        xml.end("ApplyServerSideEncryptionByDefault");
        xml.elem("BucketKeyEnabled", rule.BucketKeyEnabled ?? false);
        xml.end("Rule");
      }
      xml.end("ServerSideEncryptionConfiguration");
      return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
    } catch (e) {
      if (e instanceof AwsError) {
        // Return default AES256 if no config is set (matches AWS behavior for new buckets)
        const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
        return this.xml(`<?xml version="1.0" encoding="UTF-8"?><ServerSideEncryptionConfiguration xmlns="${ns}"><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>AES256</SSEAlgorithm></ApplyServerSideEncryptionByDefault><BucketKeyEnabled>false</BucketKeyEnabled></Rule></ServerSideEncryptionConfiguration>`, ctx);
      }
      throw e;
    }
  }

  private async putBucketEncryption(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const rules: any[] = [];
    const ruleRegex = /<Rule>([\s\S]*?)<\/Rule>/g;
    let match;
    while ((match = ruleRegex.exec(body)) !== null) {
      const ruleXml = match[1];
      const rule: any = {};
      const algo = ruleXml.match(/<SSEAlgorithm>([^<]+)<\/SSEAlgorithm>/);
      if (algo) rule.SSEAlgorithm = algo[1];
      const kmsKey = ruleXml.match(/<KMSMasterKeyID>([^<]+)<\/KMSMasterKeyID>/);
      if (kmsKey) rule.KMSMasterKeyID = kmsKey[1];
      const bke = ruleXml.match(/<BucketKeyEnabled>([^<]+)<\/BucketKeyEnabled>/);
      if (bke) rule.BucketKeyEnabled = bke[1] === "true";
      rules.push(rule);
    }
    this.service.putBucketEncryption(bucket, { rules });
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  // List Object Versions
  private listObjectVersions(bucket: string, params: URLSearchParams, ctx: RequestContext): Response {
    const prefix = params.get("prefix") ?? "";
    const delimiter = params.get("delimiter") ?? "";
    const maxKeys = parseInt(params.get("max-keys") ?? "1000");
    const keyMarker = params.get("key-marker") ?? undefined;

    const result = this.service.listObjectVersions(bucket, prefix, delimiter, maxKeys, keyMarker);
    const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
    const xml = new XmlBuilder()
      .start("ListVersionsResult", { xmlns: ns })
      .elem("Name", bucket)
      .elem("Prefix", prefix)
      .elem("MaxKeys", maxKeys)
      .elem("IsTruncated", result.isTruncated);

    if (delimiter) xml.elem("Delimiter", delimiter);
    if (keyMarker) xml.elem("KeyMarker", keyMarker);
    if (result.nextKeyMarker) xml.elem("NextKeyMarker", result.nextKeyMarker);

    for (const v of result.versions) {
      xml.start("Version")
        .elem("Key", v.key)
        .elem("VersionId", v.versionId)
        .elem("IsLatest", v.isLatest)
        .elem("LastModified", v.lastModified)
        .elem("Size", v.size)
        .elem("ETag", v.etag)
        .elem("StorageClass", "STANDARD")
        .end("Version");
    }

    for (const cp of result.commonPrefixes) {
      xml.start("CommonPrefixes").elem("Prefix", cp).end("CommonPrefixes");
    }

    xml.end("ListVersionsResult");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  // Bucket Notification Configuration
  private getBucketNotificationConfiguration(bucket: string, ctx: RequestContext): Response {
    const config = this.service.getBucketNotificationConfiguration(bucket);
    const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
    const xml = new XmlBuilder().start("NotificationConfiguration", { xmlns: ns });
    if (config.LambdaFunctionConfigurations) {
      for (const c of config.LambdaFunctionConfigurations) {
        xml.start("CloudFunctionConfiguration");
        if (c.Id) xml.elem("Id", c.Id);
        if (c.LambdaFunctionArn) xml.elem("CloudFunction", c.LambdaFunctionArn);
        if (c.Events) for (const e of c.Events) xml.elem("Event", e);
        xml.end("CloudFunctionConfiguration");
      }
    }
    if (config.QueueConfigurations) {
      for (const c of config.QueueConfigurations) {
        xml.start("QueueConfiguration");
        if (c.Id) xml.elem("Id", c.Id);
        if (c.QueueArn) xml.elem("Queue", c.QueueArn);
        if (c.Events) for (const e of c.Events) xml.elem("Event", e);
        xml.end("QueueConfiguration");
      }
    }
    if (config.TopicConfigurations) {
      for (const c of config.TopicConfigurations) {
        xml.start("TopicConfiguration");
        if (c.Id) xml.elem("Id", c.Id);
        if (c.TopicArn) xml.elem("Topic", c.TopicArn);
        if (c.Events) for (const e of c.Events) xml.elem("Event", e);
        xml.end("TopicConfiguration");
      }
    }
    xml.end("NotificationConfiguration");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private async putBucketNotificationConfiguration(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const config: any = {};
    // Parse Lambda configurations
    const lambdaRegex = /<CloudFunctionConfiguration>([\s\S]*?)<\/CloudFunctionConfiguration>/g;
    let match;
    const lambdas: any[] = [];
    while ((match = lambdaRegex.exec(body)) !== null) {
      const c: any = {};
      const id = match[1].match(/<Id>([^<]*)<\/Id>/);
      if (id) c.Id = id[1];
      const arn = match[1].match(/<CloudFunction>([^<]+)<\/CloudFunction>/);
      if (arn) c.LambdaFunctionArn = arn[1];
      const events = [...match[1].matchAll(/<Event>([^<]+)<\/Event>/g)].map(m => m[1]);
      if (events.length) c.Events = events;
      lambdas.push(c);
    }
    if (lambdas.length) config.LambdaFunctionConfigurations = lambdas;
    // Parse Queue configurations
    const queueRegex = /<QueueConfiguration>([\s\S]*?)<\/QueueConfiguration>/g;
    const queues: any[] = [];
    while ((match = queueRegex.exec(body)) !== null) {
      const c: any = {};
      const id = match[1].match(/<Id>([^<]*)<\/Id>/);
      if (id) c.Id = id[1];
      const arn = match[1].match(/<Queue>([^<]+)<\/Queue>/);
      if (arn) c.QueueArn = arn[1];
      const events = [...match[1].matchAll(/<Event>([^<]+)<\/Event>/g)].map(m => m[1]);
      if (events.length) c.Events = events;
      queues.push(c);
    }
    if (queues.length) config.QueueConfigurations = queues;
    // Parse Topic configurations
    const topicRegex = /<TopicConfiguration>([\s\S]*?)<\/TopicConfiguration>/g;
    const topics: any[] = [];
    while ((match = topicRegex.exec(body)) !== null) {
      const c: any = {};
      const id = match[1].match(/<Id>([^<]*)<\/Id>/);
      if (id) c.Id = id[1];
      const arn = match[1].match(/<Topic>([^<]+)<\/Topic>/);
      if (arn) c.TopicArn = arn[1];
      const events = [...match[1].matchAll(/<Event>([^<]+)<\/Event>/g)].map(m => m[1]);
      if (events.length) c.Events = events;
      topics.push(c);
    }
    if (topics.length) config.TopicConfigurations = topics;
    this.service.putBucketNotificationConfiguration(bucket, config);
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  // Object ACL
  private getObjectAcl(bucket: string, key: string, ctx: RequestContext): Response {
    const acl = this.service.getObjectAcl(bucket, key);
    const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
    const xml = new XmlBuilder().start("AccessControlPolicy", { xmlns: ns });
    xml.start("Owner")
      .elem("ID", acl.owner.id)
      .elem("DisplayName", acl.owner.displayName)
      .end("Owner");
    xml.start("AccessControlList");
    for (const grant of acl.grants) {
      xml.start("Grant");
      xml.raw(`<Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="${grant.grantee.type}">`);
      xml.elem("ID", grant.grantee.id);
      xml.elem("DisplayName", grant.grantee.displayName);
      xml.raw("</Grantee>");
      xml.elem("Permission", grant.permission);
      xml.end("Grant");
    }
    xml.end("AccessControlList").end("AccessControlPolicy");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private async putObjectAcl(bucket: string, key: string, req: Request, ctx: RequestContext): Promise<Response> {
    // Accept the ACL but store a simplified version
    const cannedAcl = req.headers.get("x-amz-acl");
    const acl = {
      owner: { id: "000000000000", displayName: "tinstack" },
      grants: [{ grantee: { id: "000000000000", displayName: "tinstack", type: "CanonicalUser" }, permission: cannedAcl === "public-read" ? "READ" : "FULL_CONTROL" }],
    };
    this.service.putObjectAcl(bucket, key, acl);
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  // Website Configuration
  private getBucketWebsite(bucket: string, ctx: RequestContext): Response {
    try {
      const config = this.service.getBucketWebsite(bucket);
      const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
      const xml = new XmlBuilder().start("WebsiteConfiguration", { xmlns: ns });
      if (config.RedirectAllRequestsTo) {
        xml.start("RedirectAllRequestsTo");
        xml.elem("HostName", config.RedirectAllRequestsTo.HostName);
        if (config.RedirectAllRequestsTo.Protocol) xml.elem("Protocol", config.RedirectAllRequestsTo.Protocol);
        xml.end("RedirectAllRequestsTo");
      }
      if (config.IndexDocument) {
        xml.start("IndexDocument").elem("Suffix", config.IndexDocument.Suffix).end("IndexDocument");
      }
      if (config.ErrorDocument) {
        xml.start("ErrorDocument").elem("Key", config.ErrorDocument.Key).end("ErrorDocument");
      }
      if (config.RoutingRules) {
        xml.start("RoutingRules");
        for (const rule of config.RoutingRules) {
          xml.start("RoutingRule");
          if (rule.Condition) {
            xml.start("Condition");
            if (rule.Condition.KeyPrefixEquals) xml.elem("KeyPrefixEquals", rule.Condition.KeyPrefixEquals);
            if (rule.Condition.HttpErrorCodeReturnedEquals) xml.elem("HttpErrorCodeReturnedEquals", rule.Condition.HttpErrorCodeReturnedEquals);
            xml.end("Condition");
          }
          if (rule.Redirect) {
            xml.start("Redirect");
            if (rule.Redirect.HostName) xml.elem("HostName", rule.Redirect.HostName);
            if (rule.Redirect.Protocol) xml.elem("Protocol", rule.Redirect.Protocol);
            if (rule.Redirect.ReplaceKeyPrefixWith) xml.elem("ReplaceKeyPrefixWith", rule.Redirect.ReplaceKeyPrefixWith);
            if (rule.Redirect.ReplaceKeyWith) xml.elem("ReplaceKeyWith", rule.Redirect.ReplaceKeyWith);
            if (rule.Redirect.HttpRedirectCode) xml.elem("HttpRedirectCode", rule.Redirect.HttpRedirectCode);
            xml.end("Redirect");
          }
          xml.end("RoutingRule");
        }
        xml.end("RoutingRules");
      }
      xml.end("WebsiteConfiguration");
      return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private async putBucketWebsite(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const config: any = {};

    const indexMatch = body.match(/<IndexDocument>\s*<Suffix>([^<]+)<\/Suffix>\s*<\/IndexDocument>/);
    if (indexMatch) config.IndexDocument = { Suffix: indexMatch[1] };

    const errorMatch = body.match(/<ErrorDocument>\s*<Key>([^<]+)<\/Key>\s*<\/ErrorDocument>/);
    if (errorMatch) config.ErrorDocument = { Key: errorMatch[1] };

    const redirectMatch = body.match(/<RedirectAllRequestsTo>([\s\S]*?)<\/RedirectAllRequestsTo>/);
    if (redirectMatch) {
      config.RedirectAllRequestsTo = {};
      const hostMatch = redirectMatch[1].match(/<HostName>([^<]+)<\/HostName>/);
      if (hostMatch) config.RedirectAllRequestsTo.HostName = hostMatch[1];
      const protocolMatch = redirectMatch[1].match(/<Protocol>([^<]+)<\/Protocol>/);
      if (protocolMatch) config.RedirectAllRequestsTo.Protocol = protocolMatch[1];
    }

    const routingRules: any[] = [];
    const ruleRegex = /<RoutingRule>([\s\S]*?)<\/RoutingRule>/g;
    let match;
    while ((match = ruleRegex.exec(body)) !== null) {
      const rule: any = {};
      const condMatch = match[1].match(/<Condition>([\s\S]*?)<\/Condition>/);
      if (condMatch) {
        rule.Condition = {};
        const kpe = condMatch[1].match(/<KeyPrefixEquals>([^<]+)<\/KeyPrefixEquals>/);
        if (kpe) rule.Condition.KeyPrefixEquals = kpe[1];
        const hecre = condMatch[1].match(/<HttpErrorCodeReturnedEquals>([^<]+)<\/HttpErrorCodeReturnedEquals>/);
        if (hecre) rule.Condition.HttpErrorCodeReturnedEquals = hecre[1];
      }
      const redirMatch = match[1].match(/<Redirect>([\s\S]*?)<\/Redirect>/);
      if (redirMatch) {
        rule.Redirect = {};
        const rhn = redirMatch[1].match(/<HostName>([^<]+)<\/HostName>/);
        if (rhn) rule.Redirect.HostName = rhn[1];
        const rp = redirMatch[1].match(/<Protocol>([^<]+)<\/Protocol>/);
        if (rp) rule.Redirect.Protocol = rp[1];
        const rkpw = redirMatch[1].match(/<ReplaceKeyPrefixWith>([^<]*)<\/ReplaceKeyPrefixWith>/);
        if (rkpw) rule.Redirect.ReplaceKeyPrefixWith = rkpw[1];
        const rkw = redirMatch[1].match(/<ReplaceKeyWith>([^<]*)<\/ReplaceKeyWith>/);
        if (rkw) rule.Redirect.ReplaceKeyWith = rkw[1];
        const hrc = redirMatch[1].match(/<HttpRedirectCode>([^<]+)<\/HttpRedirectCode>/);
        if (hrc) rule.Redirect.HttpRedirectCode = hrc[1];
      }
      routingRules.push(rule);
    }
    if (routingRules.length) config.RoutingRules = routingRules;

    this.service.putBucketWebsite(bucket, config);
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  // Public Access Block
  private getPublicAccessBlock(bucket: string, ctx: RequestContext): Response {
    try {
      const config = this.service.getPublicAccessBlock(bucket);
      const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
      return this.xml(`<?xml version="1.0" encoding="UTF-8"?><PublicAccessBlockConfiguration xmlns="${ns}"><BlockPublicAcls>${config.BlockPublicAcls ?? false}</BlockPublicAcls><IgnorePublicAcls>${config.IgnorePublicAcls ?? false}</IgnorePublicAcls><BlockPublicPolicy>${config.BlockPublicPolicy ?? false}</BlockPublicPolicy><RestrictPublicBuckets>${config.RestrictPublicBuckets ?? false}</RestrictPublicBuckets></PublicAccessBlockConfiguration>`, ctx);
    } catch (e) {
      if (e instanceof AwsError) {
        // Return default (all false) when not configured
        const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
        return this.xml(`<?xml version="1.0" encoding="UTF-8"?><PublicAccessBlockConfiguration xmlns="${ns}"><BlockPublicAcls>false</BlockPublicAcls><IgnorePublicAcls>false</IgnorePublicAcls><BlockPublicPolicy>false</BlockPublicPolicy><RestrictPublicBuckets>false</RestrictPublicBuckets></PublicAccessBlockConfiguration>`, ctx);
      }
      throw e;
    }
  }

  private async putPublicAccessBlock(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const config: any = {};
    const bpa = body.match(/<BlockPublicAcls>([^<]+)<\/BlockPublicAcls>/);
    if (bpa) config.BlockPublicAcls = bpa[1] === "true";
    const ipa = body.match(/<IgnorePublicAcls>([^<]+)<\/IgnorePublicAcls>/);
    if (ipa) config.IgnorePublicAcls = ipa[1] === "true";
    const bpp = body.match(/<BlockPublicPolicy>([^<]+)<\/BlockPublicPolicy>/);
    if (bpp) config.BlockPublicPolicy = bpp[1] === "true";
    const rpb = body.match(/<RestrictPublicBuckets>([^<]+)<\/RestrictPublicBuckets>/);
    if (rpb) config.RestrictPublicBuckets = rpb[1] === "true";
    this.service.putPublicAccessBlock(bucket, config);
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  // Bucket Logging
  private getBucketLogging(bucket: string, ctx: RequestContext): Response {
    const config = this.service.getBucketLogging(bucket);
    const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
    if (!config) {
      return this.xml(`<?xml version="1.0" encoding="UTF-8"?><BucketLoggingStatus xmlns="${ns}"/>`, ctx);
    }
    const xml = new XmlBuilder().start("BucketLoggingStatus", { xmlns: ns });
    if (config.TargetBucket) {
      xml.start("LoggingEnabled");
      xml.elem("TargetBucket", config.TargetBucket);
      if (config.TargetPrefix !== undefined) xml.elem("TargetPrefix", config.TargetPrefix);
      xml.end("LoggingEnabled");
    }
    xml.end("BucketLoggingStatus");
    return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
  }

  private async putBucketLogging(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const loggingMatch = body.match(/<LoggingEnabled>([\s\S]*?)<\/LoggingEnabled>/);
    if (loggingMatch) {
      const config: any = {};
      const tbMatch = loggingMatch[1].match(/<TargetBucket>([^<]+)<\/TargetBucket>/);
      if (tbMatch) config.TargetBucket = tbMatch[1];
      const tpMatch = loggingMatch[1].match(/<TargetPrefix>([^<]*)<\/TargetPrefix>/);
      if (tpMatch) config.TargetPrefix = tpMatch[1];
      this.service.putBucketLogging(bucket, config);
    } else {
      // Disable logging
      this.service.putBucketLogging(bucket, null);
    }
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  private getBucketLocation(bucket: string, ctx: RequestContext): Response {
    const location = this.service.getBucketLocation(bucket);
    const xml = `<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${escapeXml(location)}</LocationConstraint>`;
    return this.xml(xml, ctx);
  }

  // Object Lock Configuration
  private getObjectLockConfiguration(bucket: string, ctx: RequestContext): Response {
    try {
      const config = this.service.getObjectLockConfiguration(bucket);
      const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
      const xml = new XmlBuilder().start("ObjectLockConfiguration", { xmlns: ns });
      xml.elem("ObjectLockEnabled", config.objectLockEnabled ? "Enabled" : "Disabled");
      if (config.rule?.defaultRetention) {
        xml.start("Rule").start("DefaultRetention");
        xml.elem("Mode", config.rule.defaultRetention.mode);
        if (config.rule.defaultRetention.days !== undefined) xml.elem("Days", config.rule.defaultRetention.days);
        if (config.rule.defaultRetention.years !== undefined) xml.elem("Years", config.rule.defaultRetention.years);
        xml.end("DefaultRetention").end("Rule");
      }
      xml.end("ObjectLockConfiguration");
      return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private async putObjectLockConfiguration(bucket: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const enabled = body.includes("<ObjectLockEnabled>Enabled</ObjectLockEnabled>");
    const config: any = { objectLockEnabled: enabled };
    const modeMatch = body.match(/<DefaultRetention>[\s\S]*?<Mode>([^<]+)<\/Mode>/);
    if (modeMatch) {
      config.rule = { defaultRetention: { mode: modeMatch[1] } };
      const daysMatch = body.match(/<DefaultRetention>[\s\S]*?<Days>(\d+)<\/Days>/);
      if (daysMatch) config.rule.defaultRetention.days = parseInt(daysMatch[1]);
      const yearsMatch = body.match(/<DefaultRetention>[\s\S]*?<Years>(\d+)<\/Years>/);
      if (yearsMatch) config.rule.defaultRetention.years = parseInt(yearsMatch[1]);
    }
    this.service.putObjectLockConfiguration(bucket, config);
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  // Object Retention
  private getObjectRetention(bucket: string, key: string, ctx: RequestContext): Response {
    try {
      const retention = this.service.getObjectRetention(bucket, key);
      const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
      const xml = new XmlBuilder().start("Retention", { xmlns: ns });
      xml.elem("Mode", retention.mode);
      xml.elem("RetainUntilDate", retention.retainUntilDate);
      xml.end("Retention");
      return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private async putObjectRetention(bucket: string, key: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const modeMatch = body.match(/<Mode>([^<]+)<\/Mode>/);
    const dateMatch = body.match(/<RetainUntilDate>([^<]+)<\/RetainUntilDate>/);
    if (!modeMatch || !dateMatch) {
      return xmlErrorResponse(new AwsError("MalformedXML", "The XML you provided was not well-formed", 400), ctx.requestId);
    }
    this.service.putObjectRetention(bucket, key, {
      mode: modeMatch[1] as "GOVERNANCE" | "COMPLIANCE",
      retainUntilDate: dateMatch[1],
    });
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  // Object Legal Hold
  private getObjectLegalHold(bucket: string, key: string, ctx: RequestContext): Response {
    try {
      const legalHold = this.service.getObjectLegalHold(bucket, key);
      const ns = "http://s3.amazonaws.com/doc/2006-03-01/";
      const xml = new XmlBuilder().start("LegalHold", { xmlns: ns });
      xml.elem("Status", legalHold.status);
      xml.end("LegalHold");
      return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private async putObjectLegalHold(bucket: string, key: string, req: Request, ctx: RequestContext): Promise<Response> {
    const body = await req.text();
    const statusMatch = body.match(/<Status>([^<]+)<\/Status>/);
    if (!statusMatch) {
      return xmlErrorResponse(new AwsError("MalformedXML", "The XML you provided was not well-formed", 400), ctx.requestId);
    }
    this.service.putObjectLegalHold(bucket, key, {
      status: statusMatch[1] as "ON" | "OFF",
    });
    return new Response(null, { status: 200, headers: { "x-amz-request-id": ctx.requestId } });
  }

  // GetObjectAttributes
  private getObjectAttributes(bucket: string, key: string, req: Request, ctx: RequestContext): Response {
    try {
      const attrHeader = req.headers.get("x-amz-object-attributes") ?? "";
      const attributes = attrHeader.split(",").map(a => a.trim()).filter(Boolean);
      const result = this.service.getObjectAttributes(bucket, key, attributes);
      const xml = new XmlBuilder().start("GetObjectAttributesResponse", { xmlns: "http://s3.amazonaws.com/doc/2006-03-01/" });
      if (result.ETag !== undefined) xml.elem("ETag", result.ETag);
      if (result.StorageClass !== undefined) xml.elem("StorageClass", result.StorageClass);
      if (result.ObjectSize !== undefined) xml.elem("ObjectSize", result.ObjectSize);
      if (result.Checksum !== undefined) xml.start("Checksum").end("Checksum");
      if (result.ObjectParts !== undefined) {
        xml.start("ObjectParts");
        xml.elem("TotalPartsCount", result.ObjectParts.TotalPartsCount);
        xml.end("ObjectParts");
      }
      xml.end("GetObjectAttributesResponse");
      return this.xml(`<?xml version="1.0" encoding="UTF-8"?>${xml.build()}`, ctx);
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }
}
