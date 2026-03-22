import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface IvsChannel {
  arn: string;
  name: string;
  latencyMode: string;
  type: string;
  authorized: boolean;
  recordingConfigurationArn?: string;
  tags: Record<string, string>;
  playbackUrl: string;
  ingestEndpoint: string;
}

export interface IvsStreamKey {
  arn: string;
  channelArn: string;
  value: string;
  tags: Record<string, string>;
}

export interface IvsStream {
  channelArn: string;
  streamId: string;
  state: string;
  health: string;
  viewerCount: number;
  startTime: string;
}

export class IvsService {
  private channels: StorageBackend<string, IvsChannel>;
  private streamKeys: StorageBackend<string, IvsStreamKey>;
  private streams: StorageBackend<string, IvsStream>;

  constructor(private accountId: string) {
    this.channels = new InMemoryStorage();
    this.streamKeys = new InMemoryStorage();
    this.streams = new InMemoryStorage();
  }

  createChannel(name: string, latencyMode: string | undefined, type: string | undefined, tags: Record<string, string> | undefined, region: string): { channel: IvsChannel; streamKey: IvsStreamKey } {
    const channelId = crypto.randomUUID().substring(0, 12);
    const arn = buildArn("ivs", region, this.accountId, "channel/", channelId);
    const channel: IvsChannel = {
      arn, name: name ?? "", latencyMode: latencyMode ?? "LOW",
      type: type ?? "STANDARD", authorized: false,
      tags: tags ?? {},
      playbackUrl: `https://${channelId}.${region}.playback.live-video.net/api/video/v1/${this.accountId}.${channelId}.html`,
      ingestEndpoint: `${channelId}.global-contribute.live-video.net`,
    };
    this.channels.set(arn, channel);

    const streamKey = this.createStreamKey(arn, tags, region);
    return { channel, streamKey };
  }

  getChannel(arn: string): IvsChannel {
    const ch = this.channels.get(arn);
    if (!ch) throw new AwsError("ResourceNotFoundException", `Channel ${arn} not found.`, 404);
    return ch;
  }

  listChannels(): IvsChannel[] { return this.channels.values(); }

  deleteChannel(arn: string): void {
    if (!this.channels.get(arn)) throw new AwsError("ResourceNotFoundException", `Channel ${arn} not found.`, 404);
    this.channels.delete(arn);
    // Delete associated stream keys
    for (const sk of this.streamKeys.values()) {
      if (sk.channelArn === arn) this.streamKeys.delete(sk.arn);
    }
  }

  createStreamKey(channelArn: string, tags: Record<string, string> | undefined, region: string): IvsStreamKey {
    this.getChannel(channelArn);
    const keyId = crypto.randomUUID().substring(0, 12);
    const arn = buildArn("ivs", region, this.accountId, "stream-key/", keyId);
    const sk: IvsStreamKey = {
      arn, channelArn,
      value: `sk_${region}_${crypto.randomUUID().replace(/-/g, "")}`,
      tags: tags ?? {},
    };
    this.streamKeys.set(arn, sk);
    return sk;
  }

  getStreamKey(arn: string): IvsStreamKey {
    const sk = this.streamKeys.get(arn);
    if (!sk) throw new AwsError("ResourceNotFoundException", `Stream key ${arn} not found.`, 404);
    return sk;
  }

  listStreamKeys(channelArn: string): IvsStreamKey[] {
    return this.streamKeys.values().filter((sk) => sk.channelArn === channelArn);
  }

  deleteStreamKey(arn: string): void {
    if (!this.streamKeys.get(arn)) throw new AwsError("ResourceNotFoundException", `Stream key ${arn} not found.`, 404);
    this.streamKeys.delete(arn);
  }

  getStream(channelArn: string): IvsStream {
    const stream = this.streams.get(channelArn);
    if (!stream) throw new AwsError("ChannelNotBroadcasting", `Channel ${channelArn} is not broadcasting.`, 404);
    return stream;
  }

  listStreams(): IvsStream[] { return this.streams.values(); }
}
