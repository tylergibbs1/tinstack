import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Channel {
  id: string;
  arn: string;
  description: string;
  tags: Record<string, string>;
  hlsIngest: { ingestEndpoints: any[] };
}

export interface OriginEndpoint {
  id: string;
  arn: string;
  channelId: string;
  description: string;
  url: string;
  tags: Record<string, string>;
  startoverWindowSeconds: number;
  timeDelaySeconds: number;
}

export class MediaPackageService {
  private channels: StorageBackend<string, Channel>;
  private originEndpoints: StorageBackend<string, OriginEndpoint>;

  constructor(private accountId: string) {
    this.channels = new InMemoryStorage();
    this.originEndpoints = new InMemoryStorage();
  }

  createChannel(id: string, description: string, region: string, tags?: Record<string, string>): Channel {
    if (this.channels.has(id)) throw new AwsError("ConflictException", `Channel ${id} already exists.`, 409);
    const ch: Channel = {
      id,
      arn: buildArn("mediapackage", region, this.accountId, "channels/", id),
      description: description ?? "",
      tags: tags ?? {},
      hlsIngest: { ingestEndpoints: [] },
    };
    this.channels.set(id, ch);
    return ch;
  }

  describeChannel(id: string): Channel {
    const ch = this.channels.get(id);
    if (!ch) throw new AwsError("NotFoundException", `Channel ${id} not found.`, 404);
    return ch;
  }

  listChannels(): Channel[] {
    return this.channels.values();
  }

  deleteChannel(id: string): void {
    if (!this.channels.has(id)) throw new AwsError("NotFoundException", `Channel ${id} not found.`, 404);
    this.channels.delete(id);
  }

  createOriginEndpoint(id: string, channelId: string, description: string, region: string): OriginEndpoint {
    if (this.originEndpoints.has(id)) throw new AwsError("ConflictException", `OriginEndpoint ${id} already exists.`, 409);
    if (!this.channels.has(channelId)) throw new AwsError("NotFoundException", `Channel ${channelId} not found.`, 404);
    const ep: OriginEndpoint = {
      id,
      arn: buildArn("mediapackage", region, this.accountId, "origin_endpoints/", id),
      channelId,
      description: description ?? "",
      url: `https://mediapackage.${region}.amazonaws.com/out/v1/${id}`,
      tags: {},
      startoverWindowSeconds: 0,
      timeDelaySeconds: 0,
    };
    this.originEndpoints.set(id, ep);
    return ep;
  }

  describeOriginEndpoint(id: string): OriginEndpoint {
    const ep = this.originEndpoints.get(id);
    if (!ep) throw new AwsError("NotFoundException", `OriginEndpoint ${id} not found.`, 404);
    return ep;
  }

  listOriginEndpoints(): OriginEndpoint[] {
    return this.originEndpoints.values();
  }

  deleteOriginEndpoint(id: string): void {
    if (!this.originEndpoints.has(id)) throw new AwsError("NotFoundException", `OriginEndpoint ${id} not found.`, 404);
    this.originEndpoints.delete(id);
  }
}
