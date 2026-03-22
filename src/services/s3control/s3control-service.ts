import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface S3AccessPoint {
  name: string;
  bucket: string;
  alias: string;
  accessPointArn: string;
  networkOrigin: string;
  vpcId: string | null;
  creationDate: string;
  publicAccessBlock: PublicAccessBlockConfig;
}

export interface PublicAccessBlockConfig {
  BlockPublicAcls: boolean;
  IgnorePublicAcls: boolean;
  BlockPublicPolicy: boolean;
  RestrictPublicBuckets: boolean;
}

export interface StorageLensConfig {
  id: string;
  storageLensArn: string;
  homeRegion: string;
  isEnabled: boolean;
  accountLevel: any;
  tags: { Key: string; Value: string }[];
}

export interface OutpostsBucket {
  bucket: string;
  bucketArn: string;
  outpostId: string;
  creationDate: string;
}

export class S3ControlService {
  private accessPoints: StorageBackend<string, S3AccessPoint>;
  private publicAccessBlock: StorageBackend<string, PublicAccessBlockConfig>;
  private storageLensConfigs: StorageBackend<string, StorageLensConfig>;
  private outpostsBuckets: StorageBackend<string, OutpostsBucket>;

  constructor(private accountId: string) {
    this.accessPoints = new InMemoryStorage();
    this.publicAccessBlock = new InMemoryStorage();
    this.storageLensConfigs = new InMemoryStorage();
    this.outpostsBuckets = new InMemoryStorage();
  }

  createAccessPoint(
    name: string,
    bucket: string,
    vpcConfiguration: { VpcId: string } | undefined,
    publicAccessBlockConfiguration: Partial<PublicAccessBlockConfig> | undefined,
    region: string,
  ): S3AccessPoint {
    if (this.accessPoints.has(name)) {
      throw new AwsError("AccessPointAlreadyOwnedByYou", `Access point ${name} already exists.`, 409);
    }

    const alias = `${name}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}-s3alias`;
    const arn = `arn:aws:s3:${region}:${this.accountId}:accesspoint/${name}`;
    const pubc = publicAccessBlockConfiguration ?? {};

    const ap: S3AccessPoint = {
      name,
      bucket,
      alias,
      accessPointArn: arn,
      networkOrigin: vpcConfiguration ? "VPC" : "Internet",
      vpcId: vpcConfiguration?.VpcId ?? null,
      creationDate: new Date().toISOString(),
      publicAccessBlock: {
        BlockPublicAcls: pubc.BlockPublicAcls ?? true,
        IgnorePublicAcls: pubc.IgnorePublicAcls ?? true,
        BlockPublicPolicy: pubc.BlockPublicPolicy ?? true,
        RestrictPublicBuckets: pubc.RestrictPublicBuckets ?? true,
      },
    };
    this.accessPoints.set(name, ap);
    return ap;
  }

  getAccessPoint(name: string): S3AccessPoint {
    const ap = this.accessPoints.get(name);
    if (!ap) throw new AwsError("NoSuchAccessPoint", `Access point ${name} not found.`, 404);
    return ap;
  }

  listAccessPoints(bucket?: string): S3AccessPoint[] {
    let result = this.accessPoints.values();
    if (bucket) result = result.filter((ap) => ap.bucket === bucket);
    return result;
  }

  deleteAccessPoint(name: string): void {
    if (!this.accessPoints.has(name)) throw new AwsError("NoSuchAccessPoint", `Access point ${name} not found.`, 404);
    this.accessPoints.delete(name);
  }

  getPublicAccessBlock(accountId: string): PublicAccessBlockConfig {
    const config = this.publicAccessBlock.get(accountId);
    if (!config) throw new AwsError("NoSuchPublicAccessBlockConfiguration", `Public access block configuration not found.`, 404);
    return config;
  }

  putPublicAccessBlock(accountId: string, config: Partial<PublicAccessBlockConfig>): void {
    this.publicAccessBlock.set(accountId, {
      BlockPublicAcls: config.BlockPublicAcls ?? false,
      IgnorePublicAcls: config.IgnorePublicAcls ?? false,
      BlockPublicPolicy: config.BlockPublicPolicy ?? false,
      RestrictPublicBuckets: config.RestrictPublicBuckets ?? false,
    });
  }

  deletePublicAccessBlock(accountId: string): void {
    this.publicAccessBlock.delete(accountId);
  }

  createBucket(bucket: string, outpostId: string, region: string): OutpostsBucket {
    if (this.outpostsBuckets.has(bucket)) {
      throw new AwsError("BucketAlreadyExists", `Bucket ${bucket} already exists.`, 409);
    }
    const ob: OutpostsBucket = {
      bucket,
      bucketArn: `arn:aws:s3-outposts:${region}:${this.accountId}:outpost/${outpostId}/bucket/${bucket}`,
      outpostId,
      creationDate: new Date().toISOString(),
    };
    this.outpostsBuckets.set(bucket, ob);
    return ob;
  }

  getBucket(bucket: string): OutpostsBucket {
    const ob = this.outpostsBuckets.get(bucket);
    if (!ob) throw new AwsError("NoSuchBucket", `Bucket ${bucket} not found.`, 404);
    return ob;
  }

  listRegionalBuckets(outpostId?: string): OutpostsBucket[] {
    let result = this.outpostsBuckets.values();
    if (outpostId) result = result.filter((b) => b.outpostId === outpostId);
    return result;
  }

  putStorageLensConfiguration(
    configId: string,
    storageLensConfiguration: any,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): void {
    const arn = `arn:aws:s3:${region}:${this.accountId}:storage-lens/${configId}`;
    this.storageLensConfigs.set(configId, {
      id: configId,
      storageLensArn: arn,
      homeRegion: region,
      isEnabled: storageLensConfiguration?.IsEnabled ?? true,
      accountLevel: storageLensConfiguration?.AccountLevel ?? {},
      tags: tags ?? [],
    });
  }

  getStorageLensConfiguration(configId: string): StorageLensConfig {
    const config = this.storageLensConfigs.get(configId);
    if (!config) throw new AwsError("NoSuchConfiguration", `Storage Lens configuration ${configId} not found.`, 404);
    return config;
  }

  listStorageLensConfigurations(): StorageLensConfig[] {
    return this.storageLensConfigs.values();
  }

  deleteStorageLensConfiguration(configId: string): void {
    if (!this.storageLensConfigs.has(configId)) {
      throw new AwsError("NoSuchConfiguration", `Storage Lens configuration ${configId} not found.`, 404);
    }
    this.storageLensConfigs.delete(configId);
  }
}
