import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

interface VideoStream {
  streamName: string;
  streamARN: string;
  status: string;
  mediaType: string;
  dataRetentionInHours: number;
  deviceName?: string;
  kmsKeyId: string;
  version: string;
  creationTime: number;
  tags: Record<string, string>;
}

export class KinesisVideoService {
  private streams: StorageBackend<string, VideoStream>;

  constructor(private accountId: string) {
    this.streams = new InMemoryStorage();
  }

  private rk(region: string, name: string): string { return `${region}#${name}`; }

  createStream(streamName: string, mediaType: string | undefined, dataRetentionInHours: number | undefined, deviceName: string | undefined, tags: Record<string, string> | undefined, region: string): string {
    const key = this.rk(region, streamName);
    if (this.streams.has(key)) throw new AwsError("ResourceInUseException", `Stream ${streamName} already exists.`, 400);
    const arn = buildArn("kinesisvideo", region, this.accountId, "stream/", `${streamName}/${Date.now()}`);
    this.streams.set(key, {
      streamName, streamARN: arn, status: "ACTIVE",
      mediaType: mediaType ?? "video/h264", dataRetentionInHours: dataRetentionInHours ?? 0,
      deviceName, kmsKeyId: `arn:aws:kms:${region}:${this.accountId}:alias/aws/kinesisvideo`,
      version: "1", creationTime: Date.now() / 1000, tags: tags ?? {},
    });
    return arn;
  }

  describeStream(streamName: string | undefined, streamARN: string | undefined, region: string): VideoStream {
    if (streamName) {
      const s = this.streams.get(this.rk(region, streamName));
      if (!s) throw new AwsError("ResourceNotFoundException", `Stream ${streamName} not found.`, 404);
      return s;
    }
    if (streamARN) {
      const s = this.streams.values().find((v) => v.streamARN === streamARN);
      if (!s) throw new AwsError("ResourceNotFoundException", `Stream not found.`, 404);
      return s;
    }
    throw new AwsError("InvalidArgumentException", `Either StreamName or StreamARN is required.`, 400);
  }

  listStreams(region: string): VideoStream[] {
    return this.streams.values().filter((s) => s.streamARN.includes(`:${region}:`));
  }

  deleteStream(streamARN: string, region: string): void {
    const s = this.streams.values().find((v) => v.streamARN === streamARN);
    if (!s) throw new AwsError("ResourceNotFoundException", `Stream not found.`, 404);
    this.streams.delete(this.rk(region, s.streamName));
  }

  updateStream(streamName: string | undefined, streamARN: string | undefined, mediaType: string | undefined, deviceName: string | undefined, currentVersion: string, region: string): void {
    const s = this.describeStream(streamName, streamARN, region);
    if (s.version !== currentVersion) throw new AwsError("VersionMismatchException", `Version mismatch.`, 400);
    if (mediaType) s.mediaType = mediaType;
    if (deviceName !== undefined) s.deviceName = deviceName;
    s.version = String(parseInt(s.version) + 1);
  }

  getDataEndpoint(streamName: string | undefined, streamARN: string | undefined, apiName: string, region: string): string {
    this.describeStream(streamName, streamARN, region);
    return `https://localhost:4566`;
  }

  tagStream(streamARN: string | undefined, streamName: string | undefined, tags: Record<string, string>, region: string): void {
    const s = this.describeStream(streamName, streamARN, region);
    Object.assign(s.tags, tags);
  }

  untagStream(streamARN: string | undefined, streamName: string | undefined, tagKeyList: string[], region: string): void {
    const s = this.describeStream(streamName, streamARN, region);
    for (const k of tagKeyList) delete s.tags[k];
  }

  listTagsForStream(streamARN: string | undefined, streamName: string | undefined, region: string): Record<string, string> {
    const s = this.describeStream(streamName, streamARN, region);
    return s.tags;
  }
}
