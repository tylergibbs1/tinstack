import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface ChannelGroup { channelGroupName: string; arn: string; description: string; createdAt: number; }
export interface MpChannel { channelName: string; arn: string; channelGroupName: string; description: string; }

export class MediaPackageV2Service {
  private channelGroups: StorageBackend<string, ChannelGroup>;
  private channels: StorageBackend<string, MpChannel>;

  constructor(private accountId: string) {
    this.channelGroups = new InMemoryStorage();
    this.channels = new InMemoryStorage();
  }

  createChannelGroup(name: string, description: string): ChannelGroup {
    const cg: ChannelGroup = { channelGroupName: name, arn: `arn:aws:mediapackagev2:us-east-1:${this.accountId}:channelGroup/${name}`, description: description ?? "", createdAt: Date.now() / 1000 };
    this.channelGroups.set(name, cg);
    return cg;
  }

  getChannelGroup(name: string): ChannelGroup {
    const cg = this.channelGroups.get(name);
    if (!cg) throw new AwsError("ResourceNotFoundException", `Channel group ${name} not found`, 404);
    return cg;
  }

  listChannelGroups(): ChannelGroup[] { return this.channelGroups.values(); }

  deleteChannelGroup(name: string): void {
    if (!this.channelGroups.has(name)) throw new AwsError("ResourceNotFoundException", `Channel group ${name} not found`, 404);
    this.channelGroups.delete(name);
  }

  createChannel(channelGroupName: string, channelName: string, description: string): MpChannel {
    const ch: MpChannel = { channelName, arn: `arn:aws:mediapackagev2:us-east-1:${this.accountId}:channelGroup/${channelGroupName}/channel/${channelName}`, channelGroupName, description: description ?? "" };
    this.channels.set(`${channelGroupName}:${channelName}`, ch);
    return ch;
  }

  getChannel(channelGroupName: string, channelName: string): MpChannel {
    const ch = this.channels.get(`${channelGroupName}:${channelName}`);
    if (!ch) throw new AwsError("ResourceNotFoundException", `Channel ${channelName} not found`, 404);
    return ch;
  }

  listChannels(channelGroupName: string): MpChannel[] {
    return this.channels.values().filter((c) => c.channelGroupName === channelGroupName);
  }
}
