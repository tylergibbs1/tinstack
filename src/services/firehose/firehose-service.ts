import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface DeliveryStreamRecord {
  data: string;
  recordId: string;
  timestamp: number;
}

export interface EncryptionConfiguration {
  KeyType?: string;
  KeyARN?: string;
  Status: string;
}

export interface DeliveryStream {
  deliveryStreamName: string;
  deliveryStreamARN: string;
  deliveryStreamStatus: string;
  deliveryStreamType: string;
  createTimestamp: number;
  versionId: string;
  destinations: any[];
  records: DeliveryStreamRecord[];
  tags: { Key: string; Value: string }[];
  encryptionConfiguration?: EncryptionConfiguration;
}

export class FirehoseService {
  private streams: StorageBackend<string, DeliveryStream>;
  private recordCounter = 0;

  constructor(private accountId: string) {
    this.streams = new InMemoryStorage();
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createDeliveryStream(
    deliveryStreamName: string,
    deliveryStreamType: string | undefined,
    destinations: any[],
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): string {
    const key = this.regionKey(region, deliveryStreamName);
    if (this.streams.has(key)) {
      throw new AwsError("ResourceInUseException", `Delivery stream ${deliveryStreamName} already exists under account ${this.accountId}.`, 400);
    }

    const arn = buildArn("firehose", region, this.accountId, "deliverystream/", deliveryStreamName);

    this.streams.set(key, {
      deliveryStreamName,
      deliveryStreamARN: arn,
      deliveryStreamStatus: "ACTIVE",
      deliveryStreamType: deliveryStreamType ?? "DirectPut",
      createTimestamp: Date.now() / 1000,
      versionId: "1",
      destinations: destinations.length > 0 ? destinations : [{ destinationId: "destinationId-000000000001" }],
      records: [],
      tags: tags ?? [],
    });

    return arn;
  }

  describeDeliveryStream(deliveryStreamName: string, region: string): DeliveryStream {
    const key = this.regionKey(region, deliveryStreamName);
    const stream = this.streams.get(key);
    if (!stream) {
      throw new AwsError("ResourceNotFoundException", `Delivery stream ${deliveryStreamName} not found under account ${this.accountId}.`, 400);
    }
    return stream;
  }

  listDeliveryStreams(region: string, deliveryStreamType?: string, exclusiveStartName?: string, limit?: number): { deliveryStreamNames: string[]; hasMoreDeliveryStreams: boolean } {
    let streams = this.streams.values().filter((s) => this.streams.has(this.regionKey(region, s.deliveryStreamName)));

    if (deliveryStreamType) {
      streams = streams.filter((s) => s.deliveryStreamType === deliveryStreamType);
    }

    let names = streams.map((s) => s.deliveryStreamName).sort();

    if (exclusiveStartName) {
      const idx = names.indexOf(exclusiveStartName);
      if (idx >= 0) names = names.slice(idx + 1);
    }

    const max = limit ?? 10000;
    const hasMore = names.length > max;
    return { deliveryStreamNames: names.slice(0, max), hasMoreDeliveryStreams: hasMore };
  }

  deleteDeliveryStream(deliveryStreamName: string, region: string): void {
    const key = this.regionKey(region, deliveryStreamName);
    if (!this.streams.has(key)) {
      throw new AwsError("ResourceNotFoundException", `Delivery stream ${deliveryStreamName} not found under account ${this.accountId}.`, 400);
    }
    this.streams.delete(key);
  }

  putRecord(deliveryStreamName: string, data: string, region: string): string {
    const stream = this.describeDeliveryStream(deliveryStreamName, region);
    const recordId = crypto.randomUUID().replace(/-/g, "") + String(++this.recordCounter).padStart(8, "0");
    stream.records.push({ data, recordId, timestamp: Date.now() / 1000 });
    return recordId;
  }

  putRecordBatch(deliveryStreamName: string, records: { Data: string }[], region: string): { failedPutCount: number; requestResponses: { RecordId: string }[] } {
    const responses = records.map((r) => {
      const recordId = this.putRecord(deliveryStreamName, r.Data, region);
      return { RecordId: recordId };
    });
    return { failedPutCount: 0, requestResponses: responses };
  }

  updateDestination(deliveryStreamName: string, destinationId: string, currentDeliveryStreamVersionId: string, destinationUpdate: any, region: string): void {
    const stream = this.describeDeliveryStream(deliveryStreamName, region);
    if (stream.versionId !== currentDeliveryStreamVersionId) {
      throw new AwsError("InvalidArgumentException", `Version ID mismatch. Current version: ${stream.versionId}, provided: ${currentDeliveryStreamVersionId}`, 400);
    }

    const dest = stream.destinations.find((d) => d.destinationId === destinationId);
    if (!dest) {
      throw new AwsError("InvalidArgumentException", `Destination ${destinationId} not found.`, 400);
    }

    Object.assign(dest, destinationUpdate);
    stream.versionId = String(parseInt(stream.versionId) + 1);
  }

  listTagsForDeliveryStream(deliveryStreamName: string, region: string, exclusiveStartTagKey?: string, limit?: number): { tags: { Key: string; Value: string }[]; hasMoreTags: boolean } {
    const stream = this.describeDeliveryStream(deliveryStreamName, region);
    let tags = [...stream.tags];

    if (exclusiveStartTagKey) {
      const idx = tags.findIndex((t) => t.Key === exclusiveStartTagKey);
      if (idx >= 0) tags = tags.slice(idx + 1);
    }

    const max = limit ?? 50;
    const hasMore = tags.length > max;
    return { tags: tags.slice(0, max), hasMoreTags: hasMore };
  }

  tagDeliveryStream(deliveryStreamName: string, tags: { Key: string; Value: string }[], region: string): void {
    const stream = this.describeDeliveryStream(deliveryStreamName, region);
    for (const tag of tags) {
      const existing = stream.tags.findIndex((t) => t.Key === tag.Key);
      if (existing >= 0) {
        stream.tags[existing] = tag;
      } else {
        stream.tags.push(tag);
      }
    }
  }

  untagDeliveryStream(deliveryStreamName: string, tagKeys: string[], region: string): void {
    const stream = this.describeDeliveryStream(deliveryStreamName, region);
    stream.tags = stream.tags.filter((t) => !tagKeys.includes(t.Key));
  }

  startDeliveryStreamEncryption(deliveryStreamName: string, keyType: string, keyArn: string | undefined, region: string): void {
    const stream = this.describeDeliveryStream(deliveryStreamName, region);
    stream.encryptionConfiguration = {
      KeyType: keyType ?? "AWS_OWNED_CMK",
      KeyARN: keyArn,
      Status: "ENABLED",
    };
  }

  stopDeliveryStreamEncryption(deliveryStreamName: string, region: string): void {
    const stream = this.describeDeliveryStream(deliveryStreamName, region);
    stream.encryptionConfiguration = {
      Status: "DISABLED",
    };
  }
}
