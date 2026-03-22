import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface S3Bucket {
  name: string;
  region: string;
  creationDate: string;
  versioning: string; // "" | "Enabled" | "Suspended"
  tags: Record<string, string>;
  cors: any[];
  policy: string | null;
  encryption: any;
  lifecycleRules: any[];
}

export interface S3Object {
  bucket: string;
  key: string;
  data: Buffer;
  contentType: string;
  contentLength: number;
  etag: string;
  lastModified: string;
  metadata: Record<string, string>;
  storageClass: string;
  tags: Record<string, string>;
}

export interface MultipartUpload {
  uploadId: string;
  bucket: string;
  key: string;
  parts: Map<number, { data: Buffer; etag: string }>;
  metadata: Record<string, string>;
  contentType: string;
  initiated: string;
}

export class S3Service {
  private buckets: StorageBackend<string, S3Bucket>;
  private objects: StorageBackend<string, S3Object>;
  private multipartUploads: Map<string, MultipartUpload> = new Map();

  constructor() {
    this.buckets = new InMemoryStorage();
    this.objects = new InMemoryStorage();
  }

  private objectKey(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }

  createBucket(name: string, region: string): S3Bucket {
    if (this.buckets.has(name)) {
      throw new AwsError("BucketAlreadyOwnedByYou", `Your previous request to create the named bucket succeeded and you already own it.`, 409);
    }
    const bucket: S3Bucket = {
      name, region, creationDate: new Date().toISOString(),
      versioning: "", tags: {}, cors: [], policy: null,
      encryption: null, lifecycleRules: [],
    };
    this.buckets.set(name, bucket);
    return bucket;
  }

  deleteBucket(name: string): void {
    if (!this.buckets.has(name)) {
      throw new AwsError("NoSuchBucket", `The specified bucket does not exist.`, 404);
    }
    // Check if bucket is empty
    const prefix = `${name}/`;
    const hasObjects = this.objects.keys().some((k) => k.startsWith(prefix));
    if (hasObjects) {
      throw new AwsError("BucketNotEmpty", `The bucket you tried to delete is not empty.`, 409);
    }
    this.buckets.delete(name);
  }

  headBucket(name: string): S3Bucket {
    const bucket = this.buckets.get(name);
    if (!bucket) throw new AwsError("NoSuchBucket", `The specified bucket does not exist.`, 404);
    return bucket;
  }

  listBuckets(): S3Bucket[] {
    return this.buckets.values();
  }

  putObject(bucket: string, key: string, data: Buffer, contentType: string, metadata: Record<string, string>): S3Object {
    this.requireBucket(bucket);
    const hasher = new Bun.CryptoHasher("md5");
    hasher.update(data);
    const etag = `"${hasher.digest("hex")}"`;

    const obj: S3Object = {
      bucket,
      key,
      data,
      contentType: contentType || "application/octet-stream",
      contentLength: data.length,
      etag,
      lastModified: new Date().toUTCString(),
      metadata,
      storageClass: "STANDARD",
      tags: {},
    };
    this.objects.set(this.objectKey(bucket, key), obj);
    return obj;
  }

  getObject(bucket: string, key: string): S3Object {
    this.requireBucket(bucket);
    const obj = this.objects.get(this.objectKey(bucket, key));
    if (!obj) throw new AwsError("NoSuchKey", `The specified key does not exist.`, 404);
    return obj;
  }

  headObject(bucket: string, key: string): S3Object {
    return this.getObject(bucket, key);
  }

  deleteObject(bucket: string, key: string): void {
    this.requireBucket(bucket);
    this.objects.delete(this.objectKey(bucket, key));
  }

  deleteObjects(bucket: string, keys: string[]): { deleted: string[]; errors: any[] } {
    this.requireBucket(bucket);
    const deleted: string[] = [];
    for (const key of keys) {
      this.objects.delete(this.objectKey(bucket, key));
      deleted.push(key);
    }
    return { deleted, errors: [] };
  }

  copyObject(srcBucket: string, srcKey: string, dstBucket: string, dstKey: string, metadata?: Record<string, string>): S3Object {
    const srcObj = this.getObject(srcBucket, srcKey);
    return this.putObject(dstBucket, dstKey, srcObj.data, srcObj.contentType, metadata ?? srcObj.metadata);
  }

  listObjectsV2(bucket: string, prefix: string = "", delimiter: string = "", maxKeys: number = 1000, continuationToken?: string, startAfter?: string): {
    contents: S3Object[];
    commonPrefixes: string[];
    isTruncated: boolean;
    nextContinuationToken?: string;
    keyCount: number;
  } {
    this.requireBucket(bucket);
    const bucketPrefix = `${bucket}/`;
    let allKeys = this.objects.keys()
      .filter((k) => k.startsWith(bucketPrefix))
      .map((k) => k.slice(bucketPrefix.length))
      .filter((k) => k.startsWith(prefix))
      .sort();

    const start = startAfter ?? (continuationToken ? Buffer.from(continuationToken, "base64").toString() : undefined);
    if (start) {
      allKeys = allKeys.filter((k) => k > start);
    }

    const commonPrefixes = new Set<string>();
    const contents: S3Object[] = [];
    let totalCount = 0;

    for (const key of allKeys) {
      if (totalCount >= maxKeys) break;
      if (delimiter) {
        const rest = key.slice(prefix.length);
        const delimIdx = rest.indexOf(delimiter);
        if (delimIdx >= 0) {
          const cp = prefix + rest.slice(0, delimIdx + delimiter.length);
          if (!commonPrefixes.has(cp)) {
            commonPrefixes.add(cp);
            totalCount++;
          }
          continue;
        }
      }
      const obj = this.objects.get(this.objectKey(bucket, key))!;
      contents.push(obj);
      totalCount++;
    }

    const isTruncated = totalCount >= maxKeys;
    let nextContinuationToken: string | undefined;
    if (isTruncated && contents.length > 0) {
      nextContinuationToken = Buffer.from(contents[contents.length - 1].key).toString("base64");
    }

    return {
      contents,
      commonPrefixes: [...commonPrefixes],
      isTruncated,
      nextContinuationToken,
      keyCount: contents.length,
    };
  }

  // Multipart Upload
  createMultipartUpload(bucket: string, key: string, contentType: string, metadata: Record<string, string>): string {
    this.requireBucket(bucket);
    const uploadId = crypto.randomUUID();
    this.multipartUploads.set(uploadId, {
      uploadId,
      bucket,
      key,
      parts: new Map(),
      metadata,
      contentType,
      initiated: new Date().toISOString(),
    });
    return uploadId;
  }

  uploadPart(bucket: string, key: string, uploadId: string, partNumber: number, data: Buffer): string {
    const upload = this.multipartUploads.get(uploadId);
    if (!upload) throw new AwsError("NoSuchUpload", `The specified upload does not exist.`, 404);

    const hasher = new Bun.CryptoHasher("md5");
    hasher.update(data);
    const etag = `"${hasher.digest("hex")}"`;
    upload.parts.set(partNumber, { data, etag });
    return etag;
  }

  completeMultipartUpload(bucket: string, key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]): S3Object {
    const upload = this.multipartUploads.get(uploadId);
    if (!upload) throw new AwsError("NoSuchUpload", `The specified upload does not exist.`, 404);

    const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);
    const buffers: Buffer[] = [];
    for (const part of sortedParts) {
      const storedPart = upload.parts.get(part.PartNumber);
      if (!storedPart) throw new AwsError("InvalidPart", `One or more of the specified parts could not be found.`, 400);
      buffers.push(storedPart.data);
    }

    const combinedData = Buffer.concat(buffers);

    // Compute multipart ETag: MD5 of concatenated per-part MD5 digests, then "-N"
    const partMd5Buffers: Buffer[] = [];
    for (const part of sortedParts) {
      const storedPart = upload.parts.get(part.PartNumber)!;
      const h = new Bun.CryptoHasher("md5");
      h.update(storedPart.data);
      partMd5Buffers.push(Buffer.from(h.digest()));
    }
    const combinedMd5 = Buffer.concat(partMd5Buffers);
    const finalHasher = new Bun.CryptoHasher("md5");
    finalHasher.update(combinedMd5);
    const multipartEtag = `"${finalHasher.digest("hex")}-${sortedParts.length}"`;

    this.multipartUploads.delete(uploadId);

    this.requireBucket(bucket);
    const obj: S3Object = {
      bucket,
      key,
      data: combinedData,
      contentType: upload.contentType || "application/octet-stream",
      contentLength: combinedData.length,
      etag: multipartEtag,
      lastModified: new Date().toUTCString(),
      metadata: upload.metadata,
      storageClass: "STANDARD",
      tags: {},
    };
    this.objects.set(this.objectKey(bucket, key), obj);
    return obj;
  }

  abortMultipartUpload(bucket: string, key: string, uploadId: string): void {
    if (!this.multipartUploads.has(uploadId)) {
      throw new AwsError("NoSuchUpload", `The specified upload does not exist.`, 404);
    }
    this.multipartUploads.delete(uploadId);
  }

  listMultipartUploads(bucket: string): MultipartUpload[] {
    this.requireBucket(bucket);
    return [...this.multipartUploads.values()].filter((u) => u.bucket === bucket);
  }

  listParts(bucket: string, key: string, uploadId: string): { partNumber: number; etag: string; size: number }[] {
    const upload = this.multipartUploads.get(uploadId);
    if (!upload) throw new AwsError("NoSuchUpload", `The specified upload does not exist.`, 404);
    return [...upload.parts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([partNumber, part]) => ({
        partNumber,
        etag: part.etag,
        size: part.data.length,
      }));
  }

  getBucketLocation(bucket: string): string {
    const b = this.buckets.get(bucket);
    if (!b) throw new AwsError("NoSuchBucket", `The specified bucket does not exist.`, 404);
    return b.region;
  }

  // Bucket versioning
  getBucketVersioning(bucket: string): string {
    const b = this.requireBucketReturn(bucket);
    return b.versioning;
  }

  putBucketVersioning(bucket: string, status: string): void {
    const b = this.requireBucketReturn(bucket);
    b.versioning = status;
  }

  // Bucket tagging
  getBucketTagging(bucket: string): Record<string, string> {
    const b = this.requireBucketReturn(bucket);
    return b.tags;
  }

  putBucketTagging(bucket: string, tags: Record<string, string>): void {
    const b = this.requireBucketReturn(bucket);
    b.tags = tags;
  }

  deleteBucketTagging(bucket: string): void {
    const b = this.requireBucketReturn(bucket);
    b.tags = {};
  }

  // Bucket policy
  getBucketPolicy(bucket: string): string {
    const b = this.requireBucketReturn(bucket);
    if (!b.policy) throw new AwsError("NoSuchBucketPolicy", "The bucket policy does not exist", 404);
    return b.policy;
  }

  putBucketPolicy(bucket: string, policy: string): void {
    const b = this.requireBucketReturn(bucket);
    b.policy = policy;
  }

  deleteBucketPolicy(bucket: string): void {
    const b = this.requireBucketReturn(bucket);
    b.policy = null;
  }

  // Bucket CORS
  getBucketCors(bucket: string): any[] {
    const b = this.requireBucketReturn(bucket);
    if (b.cors.length === 0) throw new AwsError("NoSuchCORSConfiguration", "The CORS configuration does not exist", 404);
    return b.cors;
  }

  putBucketCors(bucket: string, cors: any[]): void {
    const b = this.requireBucketReturn(bucket);
    b.cors = cors;
  }

  deleteBucketCors(bucket: string): void {
    const b = this.requireBucketReturn(bucket);
    b.cors = [];
  }

  // Object tagging
  getObjectTagging(bucket: string, key: string): Record<string, string> {
    const obj = this.getObject(bucket, key);
    return obj.tags;
  }

  putObjectTagging(bucket: string, key: string, tags: Record<string, string>): void {
    const obj = this.getObject(bucket, key);
    obj.tags = tags;
  }

  deleteObjectTagging(bucket: string, key: string): void {
    const obj = this.getObject(bucket, key);
    obj.tags = {};
  }

  // ListObjectsV1
  listObjectsV1(bucket: string, prefix: string = "", delimiter: string = "", maxKeys: number = 1000, marker?: string): {
    contents: S3Object[];
    commonPrefixes: string[];
    isTruncated: boolean;
    nextMarker?: string;
  } {
    this.requireBucket(bucket);
    const bucketPrefix = `${bucket}/`;
    let allKeys = this.objects.keys()
      .filter((k) => k.startsWith(bucketPrefix))
      .map((k) => k.slice(bucketPrefix.length))
      .filter((k) => k.startsWith(prefix))
      .sort();

    if (marker) {
      allKeys = allKeys.filter((k) => k > marker);
    }

    const commonPrefixes = new Set<string>();
    const contents: S3Object[] = [];
    let totalCount = 0;

    for (const key of allKeys) {
      if (totalCount >= maxKeys) break;
      if (delimiter) {
        const rest = key.slice(prefix.length);
        const delimIdx = rest.indexOf(delimiter);
        if (delimIdx >= 0) {
          const cp = prefix + rest.slice(0, delimIdx + delimiter.length);
          if (!commonPrefixes.has(cp)) {
            commonPrefixes.add(cp);
            totalCount++;
          }
          continue;
        }
      }
      const obj = this.objects.get(this.objectKey(bucket, key))!;
      contents.push(obj);
      totalCount++;
    }

    const isTruncated = totalCount >= maxKeys;
    let nextMarker: string | undefined;
    if (isTruncated && contents.length > 0) {
      nextMarker = contents[contents.length - 1].key;
    }

    return { contents, commonPrefixes: [...commonPrefixes], isTruncated, nextMarker };
  }

  private requireBucketReturn(name: string): S3Bucket {
    const b = this.buckets.get(name);
    if (!b) throw new AwsError("NoSuchBucket", `The specified bucket does not exist.`, 404);
    return b;
  }

  private requireBucket(name: string): void {
    if (!this.buckets.has(name)) {
      throw new AwsError("NoSuchBucket", `The specified bucket does not exist.`, 404);
    }
  }
}
