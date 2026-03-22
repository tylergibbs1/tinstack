import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface VectorBucket {
  vectorBucketArn: string;
  name: string;
  creationTime: string;
}

export interface VectorIndex {
  indexArn: string;
  indexName: string;
  vectorBucketArn: string;
  dimension: number;
  distanceMetric: string;
  creationTime: string;
}

export interface VectorRecord {
  key: string;
  data: number[];
  metadata: Record<string, any>;
}

export class S3VectorsService {
  private buckets: StorageBackend<string, VectorBucket>;
  private indexes: StorageBackend<string, VectorIndex>;
  private vectors: StorageBackend<string, StorageBackend<string, VectorRecord>>;

  constructor(private accountId: string) {
    this.buckets = new InMemoryStorage();
    this.indexes = new InMemoryStorage();
    this.vectors = new InMemoryStorage();
  }

  createVectorBucket(name: string, region: string): VectorBucket {
    if (this.buckets.has(name)) throw new AwsError("ConflictException", `VectorBucket ${name} already exists.`, 409);
    const arn = buildArn("s3vectors", region, this.accountId, "vector-bucket/", name);
    const b: VectorBucket = { vectorBucketArn: arn, name, creationTime: Math.floor(Date.now() / 1000) };
    this.buckets.set(name, b);
    return b;
  }

  getVectorBucket(name: string): VectorBucket {
    const b = this.buckets.get(name);
    if (!b) throw new AwsError("NotFoundException", `VectorBucket ${name} not found.`, 404);
    return b;
  }

  listVectorBuckets(): VectorBucket[] { return this.buckets.values(); }

  deleteVectorBucket(name: string): void {
    if (!this.buckets.has(name)) throw new AwsError("NotFoundException", `VectorBucket ${name} not found.`, 404);
    this.buckets.delete(name);
  }

  createIndex(vectorBucketName: string, indexName: string, dimension: number, distanceMetric: string, region: string): VectorIndex {
    if (!this.buckets.has(vectorBucketName)) throw new AwsError("NotFoundException", `VectorBucket ${vectorBucketName} not found.`, 404);
    const key = `${vectorBucketName}/${indexName}`;
    if (this.indexes.has(key)) throw new AwsError("ConflictException", `Index ${indexName} already exists.`, 409);
    const bucket = this.buckets.get(vectorBucketName)!;
    const arn = `${bucket.vectorBucketArn}/index/${indexName}`;
    const idx: VectorIndex = {
      indexArn: arn, indexName, vectorBucketArn: bucket.vectorBucketArn,
      dimension: dimension ?? 128, distanceMetric: distanceMetric ?? "cosine",
      creationTime: Math.floor(Date.now() / 1000),
    };
    this.indexes.set(key, idx);
    this.vectors.set(key, new InMemoryStorage());
    return idx;
  }

  getIndex(vectorBucketName: string, indexName: string): VectorIndex {
    const key = `${vectorBucketName}/${indexName}`;
    const idx = this.indexes.get(key);
    if (!idx) throw new AwsError("NotFoundException", `Index ${indexName} not found.`, 404);
    return idx;
  }

  listIndexes(vectorBucketName: string): VectorIndex[] {
    return this.indexes.values().filter(i => {
      const bucket = this.buckets.get(vectorBucketName);
      return bucket && i.vectorBucketArn === bucket.vectorBucketArn;
    });
  }

  putVectors(vectorBucketName: string, indexName: string, vectors: { key: string; data: number[]; metadata?: Record<string, any> }[]): void {
    const key = `${vectorBucketName}/${indexName}`;
    const store = this.vectors.get(key);
    if (!store) throw new AwsError("NotFoundException", `Index ${indexName} not found.`, 404);
    for (const v of vectors) {
      store.set(v.key, { key: v.key, data: v.data, metadata: v.metadata ?? {} });
    }
  }

  getVectors(vectorBucketName: string, indexName: string, keys: string[]): VectorRecord[] {
    const key = `${vectorBucketName}/${indexName}`;
    const store = this.vectors.get(key);
    if (!store) throw new AwsError("NotFoundException", `Index ${indexName} not found.`, 404);
    return keys.map(k => {
      const v = store.get(k);
      if (!v) throw new AwsError("NotFoundException", `Vector ${k} not found.`, 404);
      return v;
    });
  }

  queryVectors(vectorBucketName: string, indexName: string, queryVector: number[], topK: number): { key: string; distance: number }[] {
    const key = `${vectorBucketName}/${indexName}`;
    const store = this.vectors.get(key);
    if (!store) throw new AwsError("NotFoundException", `Index ${indexName} not found.`, 404);
    const all = store.values();
    // Simple cosine distance approximation
    const scored = all.map(v => ({
      key: v.key,
      distance: this.cosineDistance(queryVector, v.data),
    }));
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, topK ?? 10);
  }

  private cosineDistance(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 1 : 1 - dot / denom;
  }
}
