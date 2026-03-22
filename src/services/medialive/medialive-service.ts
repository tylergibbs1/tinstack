import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface MediaLiveChannel {
  id: string;
  arn: string;
  name: string;
  state: string;
  channelClass: string;
  inputAttachments: { inputId: string; inputAttachmentName?: string }[];
  roleArn?: string;
  tags: Record<string, string>;
  pipelinesRunningCount: number;
}

export interface MediaLiveInput {
  id: string;
  arn: string;
  name: string;
  type: string;
  state: string;
  attachedChannels: string[];
  sources: { url: string }[];
  destinations: { url: string }[];
  tags: Record<string, string>;
}

export class MediaLiveService {
  private channels: StorageBackend<string, MediaLiveChannel>;
  private inputs: StorageBackend<string, MediaLiveInput>;

  constructor(private accountId: string) {
    this.channels = new InMemoryStorage();
    this.inputs = new InMemoryStorage();
  }

  createChannel(name: string, channelClass: string, inputAttachments: any[], roleArn: string | undefined, tags: Record<string, string> | undefined, region: string): MediaLiveChannel {
    const id = Math.random().toString().substring(2, 9);
    const channel: MediaLiveChannel = {
      id, arn: buildArn("medialive", region, this.accountId, "channel:", id),
      name, state: "IDLE", channelClass: channelClass ?? "SINGLE_PIPELINE",
      inputAttachments: inputAttachments ?? [], roleArn,
      tags: tags ?? {}, pipelinesRunningCount: 0,
    };
    this.channels.set(id, channel);
    return channel;
  }

  describeChannel(id: string): MediaLiveChannel {
    const ch = this.channels.get(id);
    if (!ch) throw new AwsError("NotFoundException", `Channel ${id} not found.`, 404);
    return ch;
  }

  listChannels(): MediaLiveChannel[] { return this.channels.values(); }

  deleteChannel(id: string): MediaLiveChannel {
    const ch = this.describeChannel(id);
    if (ch.state === "RUNNING") throw new AwsError("ConflictException", `Channel ${id} is running.`, 409);
    this.channels.delete(id);
    ch.state = "DELETING";
    return ch;
  }

  startChannel(id: string): void {
    const ch = this.describeChannel(id);
    ch.state = "RUNNING";
    ch.pipelinesRunningCount = 1;
  }

  stopChannel(id: string): void {
    const ch = this.describeChannel(id);
    ch.state = "IDLE";
    ch.pipelinesRunningCount = 0;
  }

  createInput(name: string, type: string, sources: any[], destinations: any[], tags: Record<string, string> | undefined, region: string): MediaLiveInput {
    const id = Math.random().toString().substring(2, 9);
    const input: MediaLiveInput = {
      id, arn: buildArn("medialive", region, this.accountId, "input:", id),
      name, type: type ?? "URL_PULL", state: "DETACHED",
      attachedChannels: [], sources: sources ?? [], destinations: destinations ?? [],
      tags: tags ?? {},
    };
    this.inputs.set(id, input);
    return input;
  }

  describeInput(id: string): MediaLiveInput {
    const input = this.inputs.get(id);
    if (!input) throw new AwsError("NotFoundException", `Input ${id} not found.`, 404);
    return input;
  }

  listInputs(): MediaLiveInput[] { return this.inputs.values(); }

  deleteInput(id: string): void {
    if (!this.inputs.get(id)) throw new AwsError("NotFoundException", `Input ${id} not found.`, 404);
    this.inputs.delete(id);
  }
}
