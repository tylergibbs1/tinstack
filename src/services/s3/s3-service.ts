import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface ObjectLockConfiguration {
  objectLockEnabled: boolean;
  rule?: {
    defaultRetention?: {
      mode: "GOVERNANCE" | "COMPLIANCE";
      days?: number;
      years?: number;
    };
  };
}

export interface ObjectRetention {
  mode: "GOVERNANCE" | "COMPLIANCE";
  retainUntilDate: string;
}

export interface ObjectLegalHold {
  status: "ON" | "OFF";
}

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
  notificationConfiguration: any;
  objectAcls: Map<string, any>;
  websiteConfiguration: any | null;
  publicAccessBlock: any | null;
  loggingConfiguration: any | null;
  objectLockConfiguration: ObjectLockConfiguration | null;
}

export interface S3ObjectVersion {
  key: string;
  versionId: string;
  isLatest: boolean;
  lastModified: string;
  size: number;
  etag: string;
  isDeleteMarker?: boolean;
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
  retention: ObjectRetention | null;
  legalHold: ObjectLegalHold | null;
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
  private objectVersions: Map<string, S3ObjectVersion[]> = new Map();
  private versionedObjects: Map<string, S3Object> = new Map();

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
      notificationConfiguration: null, objectAcls: new Map(),
      websiteConfiguration: null, publicAccessBlock: null,
      loggingConfiguration: null, objectLockConfiguration: null,
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
    const b = this.requireBucketReturn(bucket);
    const hasher = new Bun.CryptoHasher("md5");
    hasher.update(data);
    const etag = `"${hasher.digest("hex")}"`;
    const lastModified = new Date().toUTCString();

    const obj: S3Object = {
      bucket,
      key,
      data,
      contentType: contentType || "application/octet-stream",
      contentLength: data.length,
      etag,
      lastModified,
      metadata,
      storageClass: "STANDARD",
      tags: {},
      retention: null,
      legalHold: null,
    };
    this.objects.set(this.objectKey(bucket, key), obj);

    // Track version history when versioning is enabled
    if (b.versioning === "Enabled") {
      const versionKey = this.objectKey(bucket, key);
      const versions = this.objectVersions.get(versionKey) ?? [];
      // Mark all existing versions as not latest
      for (const v of versions) v.isLatest = false;
      const versionId = crypto.randomUUID();
      versions.push({
        key,
        versionId,
        isLatest: true,
        lastModified: new Date(lastModified).toISOString(),
        size: data.length,
        etag,
      });
      this.objectVersions.set(versionKey, versions);
      // Store a copy of the object data for this version
      this.versionedObjects.set(`${versionKey}#${versionId}`, { ...obj, data: Buffer.from(data) });
    }

    return obj;
  }

  getObject(bucket: string, key: string, versionId?: string): S3Object {
    const b = this.requireBucketReturn(bucket);
    const versionKey = this.objectKey(bucket, key);

    if (versionId) {
      const versions = this.objectVersions.get(versionKey);
      const version = versions?.find(v => v.versionId === versionId);
      if (!version) throw new AwsError("NoSuchKey", `The specified key does not exist.`, 404);
      if (version.isDeleteMarker) {
        const err = new AwsError("NoSuchKey", `The specified key does not exist.`, 404);
        err.deleteMarker = true;
        err.versionId = versionId;
        throw err;
      }
      // For versioned gets, we need the stored object data.
      // The current object in storage is always the latest non-marker data.
      // For older versions we need version-specific storage.
      const obj = this.versionedObjects.get(`${versionKey}#${versionId}`);
      if (!obj) {
        // Fallback: if this is the version that matches the current object, return it
        const current = this.objects.get(versionKey);
        if (current) return current;
        throw new AwsError("NoSuchKey", `The specified key does not exist.`, 404);
      }
      return obj;
    }

    // No versionId: check if latest version is a delete marker
    if (b.versioning === "Enabled") {
      const versions = this.objectVersions.get(versionKey);
      if (versions && versions.length > 0) {
        const latest = versions.find(v => v.isLatest);
        if (latest?.isDeleteMarker) {
          const err = new AwsError("NoSuchKey", `The specified key does not exist.`, 404);
          err.deleteMarker = true;
          err.versionId = latest.versionId;
          throw err;
        }
      }
    }

    const obj = this.objects.get(versionKey);
    if (!obj) throw new AwsError("NoSuchKey", `The specified key does not exist.`, 404);
    return obj;
  }

  headObject(bucket: string, key: string, versionId?: string): S3Object {
    return this.getObject(bucket, key, versionId);
  }

  deleteObject(bucket: string, key: string, versionId?: string): { deleteMarker?: boolean; versionId?: string } {
    const b = this.requireBucketReturn(bucket);
    const compositeKey = this.objectKey(bucket, key);

    if (b.versioning === "Enabled") {
      if (versionId) {
        // Remove a specific version
        const versions = this.objectVersions.get(compositeKey);
        if (versions) {
          const idx = versions.findIndex(v => v.versionId === versionId);
          if (idx >= 0) {
            const removed = versions[idx];
            const wasDeleteMarker = removed.isDeleteMarker ?? false;
            versions.splice(idx, 1);
            this.versionedObjects.delete(`${compositeKey}#${versionId}`);

            // If we removed the latest, promote the next most recent
            if (removed.isLatest && versions.length > 0) {
              // Most recent is the last in the array
              const newLatest = versions[versions.length - 1];
              newLatest.isLatest = true;
              // If new latest is not a delete marker, restore the object in main storage
              if (!newLatest.isDeleteMarker) {
                const restoredObj = this.versionedObjects.get(`${compositeKey}#${newLatest.versionId}`);
                if (restoredObj) {
                  this.objects.set(compositeKey, restoredObj);
                }
              }
            }
            if (versions.length === 0) {
              this.objectVersions.delete(compositeKey);
              this.objects.delete(compositeKey);
            }
            return { deleteMarker: wasDeleteMarker, versionId };
          }
        }
        return { versionId };
      }

      // No versionId: create a delete marker
      const versions = this.objectVersions.get(compositeKey) ?? [];
      for (const v of versions) v.isLatest = false;
      const markerId = crypto.randomUUID();
      versions.push({
        key,
        versionId: markerId,
        isLatest: true,
        lastModified: new Date().toISOString(),
        size: 0,
        etag: "",
        isDeleteMarker: true,
      });
      this.objectVersions.set(compositeKey, versions);
      // Don't remove from objects storage -- old versions need the data
      return { deleteMarker: true, versionId: markerId };
    }

    // Non-versioned: just remove
    this.objects.delete(compositeKey);
    return {};
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
      retention: null,
      legalHold: null,
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

  // Bucket Lifecycle Configuration
  getBucketLifecycleConfiguration(bucket: string): any[] {
    const b = this.requireBucketReturn(bucket);
    if (b.lifecycleRules.length === 0) {
      throw new AwsError("NoSuchLifecycleConfiguration", "The lifecycle configuration does not exist", 404);
    }
    return b.lifecycleRules;
  }

  putBucketLifecycleConfiguration(bucket: string, rules: any[]): void {
    const b = this.requireBucketReturn(bucket);
    b.lifecycleRules = rules;
  }

  deleteBucketLifecycle(bucket: string): void {
    const b = this.requireBucketReturn(bucket);
    b.lifecycleRules = [];
  }

  // Bucket Encryption Configuration
  getBucketEncryption(bucket: string): any {
    const b = this.requireBucketReturn(bucket);
    if (!b.encryption) {
      throw new AwsError("ServerSideEncryptionConfigurationNotFoundError", "The server side encryption configuration was not found", 404);
    }
    return b.encryption;
  }

  putBucketEncryption(bucket: string, config: any): void {
    const b = this.requireBucketReturn(bucket);
    b.encryption = config;
  }

  deleteBucketEncryption(bucket: string): void {
    const b = this.requireBucketReturn(bucket);
    b.encryption = null;
  }

  // List Object Versions
  listObjectVersions(bucket: string, prefix: string = "", delimiter: string = "", maxKeys: number = 1000, keyMarker?: string): {
    versions: S3ObjectVersion[];
    commonPrefixes: string[];
    isTruncated: boolean;
    nextKeyMarker?: string;
  } {
    this.requireBucket(bucket);
    const bucketPrefix = `${bucket}/`;

    // Collect all versioned keys for this bucket
    const allVersions: S3ObjectVersion[] = [];
    for (const [compositeKey, versions] of this.objectVersions.entries()) {
      if (!compositeKey.startsWith(bucketPrefix)) continue;
      const objectKey = compositeKey.slice(bucketPrefix.length);
      if (!objectKey.startsWith(prefix)) continue;
      if (keyMarker && objectKey <= keyMarker) continue;
      allVersions.push(...versions);
    }

    // Also include non-versioned objects as "null" versions
    const versionedKeys = new Set(
      [...this.objectVersions.keys()].filter(k => k.startsWith(bucketPrefix))
    );
    const objectKeys = this.objects.keys()
      .filter(k => k.startsWith(bucketPrefix) && !versionedKeys.has(k));
    for (const compositeKey of objectKeys) {
      const objectKey = compositeKey.slice(bucketPrefix.length);
      if (!objectKey.startsWith(prefix)) continue;
      if (keyMarker && objectKey <= keyMarker) continue;
      const obj = this.objects.get(compositeKey)!;
      allVersions.push({
        key: objectKey,
        versionId: "null",
        isLatest: true,
        lastModified: new Date(obj.lastModified).toISOString(),
        size: obj.contentLength,
        etag: obj.etag,
      });
    }

    allVersions.sort((a, b) => a.key.localeCompare(b.key));

    const commonPrefixes = new Set<string>();
    const versions: S3ObjectVersion[] = [];

    if (delimiter) {
      const seen = new Set<string>();
      for (const v of allVersions) {
        const rest = v.key.slice(prefix.length);
        const delimIdx = rest.indexOf(delimiter);
        if (delimIdx >= 0) {
          const cp = prefix + rest.slice(0, delimIdx + delimiter.length);
          commonPrefixes.add(cp);
          continue;
        }
        if (versions.length + commonPrefixes.size >= maxKeys) break;
        versions.push(v);
      }
    } else {
      for (const v of allVersions) {
        if (versions.length >= maxKeys) break;
        versions.push(v);
      }
    }

    const isTruncated = versions.length >= maxKeys;
    const nextKeyMarker = isTruncated && versions.length > 0
      ? versions[versions.length - 1].key
      : undefined;

    return { versions, commonPrefixes: [...commonPrefixes], isTruncated, nextKeyMarker };
  }

  // Bucket Notification Configuration
  getBucketNotificationConfiguration(bucket: string): any {
    const b = this.requireBucketReturn(bucket);
    return b.notificationConfiguration ?? {};
  }

  putBucketNotificationConfiguration(bucket: string, config: any): void {
    const b = this.requireBucketReturn(bucket);
    b.notificationConfiguration = config;
  }

  // Object ACLs
  getObjectAcl(bucket: string, key: string): any {
    const b = this.requireBucketReturn(bucket);
    this.getObject(bucket, key); // ensure object exists
    const storedAcl = b.objectAcls.get(key);
    if (storedAcl) return storedAcl;
    // Return default ACL
    return {
      owner: { id: "000000000000", displayName: "tinstack" },
      grants: [{ grantee: { id: "000000000000", displayName: "tinstack", type: "CanonicalUser" }, permission: "FULL_CONTROL" }],
    };
  }

  putObjectAcl(bucket: string, key: string, acl: any): void {
    const b = this.requireBucketReturn(bucket);
    this.getObject(bucket, key); // ensure object exists
    b.objectAcls.set(key, acl);
  }

  // Website Configuration
  getBucketWebsite(bucket: string): any {
    const b = this.requireBucketReturn(bucket);
    if (!b.websiteConfiguration) {
      throw new AwsError("NoSuchWebsiteConfiguration", "The specified bucket does not have a website configuration", 404);
    }
    return b.websiteConfiguration;
  }

  putBucketWebsite(bucket: string, config: any): void {
    const b = this.requireBucketReturn(bucket);
    b.websiteConfiguration = config;
  }

  deleteBucketWebsite(bucket: string): void {
    const b = this.requireBucketReturn(bucket);
    b.websiteConfiguration = null;
  }

  // Public Access Block
  getPublicAccessBlock(bucket: string): any {
    const b = this.requireBucketReturn(bucket);
    if (!b.publicAccessBlock) {
      throw new AwsError("NoSuchPublicAccessBlockConfiguration", "The public access block configuration was not found", 404);
    }
    return b.publicAccessBlock;
  }

  putPublicAccessBlock(bucket: string, config: any): void {
    const b = this.requireBucketReturn(bucket);
    b.publicAccessBlock = config;
  }

  deletePublicAccessBlock(bucket: string): void {
    const b = this.requireBucketReturn(bucket);
    b.publicAccessBlock = null;
  }

  // Bucket Logging
  getBucketLogging(bucket: string): any {
    const b = this.requireBucketReturn(bucket);
    return b.loggingConfiguration;
  }

  putBucketLogging(bucket: string, config: any): void {
    const b = this.requireBucketReturn(bucket);
    b.loggingConfiguration = config;
  }

  // Object Lock Configuration
  putObjectLockConfiguration(bucket: string, config: ObjectLockConfiguration): void {
    const b = this.requireBucketReturn(bucket);
    b.objectLockConfiguration = config;
  }

  getObjectLockConfiguration(bucket: string): ObjectLockConfiguration {
    const b = this.requireBucketReturn(bucket);
    if (!b.objectLockConfiguration) {
      throw new AwsError("ObjectLockConfigurationNotFoundError", "Object Lock configuration does not exist for this bucket", 404);
    }
    return b.objectLockConfiguration;
  }

  // Object Retention
  putObjectRetention(bucket: string, key: string, retention: ObjectRetention): void {
    const obj = this.getObject(bucket, key);
    obj.retention = retention;
  }

  getObjectRetention(bucket: string, key: string): ObjectRetention {
    const obj = this.getObject(bucket, key);
    if (!obj.retention) {
      throw new AwsError("NoSuchObjectLockConfiguration", "The specified object does not have an Object Lock retention configuration", 404);
    }
    return obj.retention;
  }

  // Object Legal Hold
  putObjectLegalHold(bucket: string, key: string, legalHold: ObjectLegalHold): void {
    const obj = this.getObject(bucket, key);
    obj.legalHold = legalHold;
  }

  getObjectLegalHold(bucket: string, key: string): ObjectLegalHold {
    const obj = this.getObject(bucket, key);
    if (!obj.legalHold) {
      throw new AwsError("NoSuchObjectLockConfiguration", "The specified object does not have a Legal Hold configuration", 404);
    }
    return obj.legalHold;
  }

  // GetObjectAttributes
  getObjectAttributes(bucket: string, key: string, attributes: string[]): Record<string, any> {
    const obj = this.getObject(bucket, key);
    const result: Record<string, any> = {};
    for (const attr of attributes) {
      switch (attr) {
        case "ETag":
          result.ETag = obj.etag;
          break;
        case "StorageClass":
          result.StorageClass = obj.storageClass;
          break;
        case "ObjectSize":
          result.ObjectSize = obj.contentLength;
          break;
        case "Checksum":
          result.Checksum = {};
          break;
        case "ObjectParts":
          // Only meaningful for multipart objects (etag contains "-")
          if (obj.etag.includes("-")) {
            const dashIdx = obj.etag.lastIndexOf("-");
            const totalParts = parseInt(obj.etag.slice(dashIdx + 1).replace('"', ""));
            result.ObjectParts = { TotalPartsCount: totalParts };
          }
          break;
      }
    }
    return result;
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
