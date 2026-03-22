import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface SnsTopic {
  topicArn: string;
  name: string;
  attributes: Record<string, string>;
  tags: Record<string, string>;
  subscriptions: SnsSubscription[];
}

export interface SnsSubscription {
  subscriptionArn: string;
  topicArn: string;
  protocol: string;
  endpoint: string;
  owner: string;
  filterPolicy?: string;
  rawMessageDelivery: boolean;
}

export interface PublishResult {
  messageId: string;
}

export class SnsService {
  private topics: StorageBackend<string, SnsTopic>;
  private subscriptionCounter = 0;

  // For cross-service integration: callbacks for SQS delivery
  public onPublish?: (topicArn: string, message: string, subject?: string, messageAttributes?: Record<string, any>) => void;

  constructor(private accountId: string) {
    this.topics = new InMemoryStorage();
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createTopic(name: string, attributes: Record<string, string>, tags: Record<string, string>, region: string): SnsTopic {
    const arn = buildArn("sns", region, this.accountId, "", name);
    const key = this.regionKey(region, name);
    const existing = this.topics.get(key);
    if (existing) return existing;

    const topic: SnsTopic = { topicArn: arn, name, attributes, tags, subscriptions: [] };
    this.topics.set(key, topic);
    return topic;
  }

  deleteTopic(topicArn: string, region: string): void {
    const name = topicArn.split(":").pop()!;
    const key = this.regionKey(region, name);
    this.topics.delete(key);
  }

  listTopics(region: string): SnsTopic[] {
    return this.topics.values().filter((t) => this.topics.has(this.regionKey(region, t.name)));
  }

  getTopicAttributes(topicArn: string, region: string): Record<string, string> {
    const topic = this.getTopic(topicArn, region);
    return {
      TopicArn: topic.topicArn,
      ...topic.attributes,
      SubscriptionsConfirmed: String(topic.subscriptions.length),
      SubscriptionsPending: "0",
      SubscriptionsDeleted: "0",
    };
  }

  setTopicAttributes(topicArn: string, attributeName: string, attributeValue: string, region: string): void {
    const topic = this.getTopic(topicArn, region);
    topic.attributes[attributeName] = attributeValue;
  }

  subscribe(topicArn: string, protocol: string, endpoint: string, region: string, attributes?: Record<string, string>): SnsSubscription {
    const topic = this.getTopic(topicArn, region);
    const subArn = `${topicArn}:${++this.subscriptionCounter}`;

    const sub: SnsSubscription = {
      subscriptionArn: subArn,
      topicArn,
      protocol,
      endpoint,
      owner: this.accountId,
      filterPolicy: attributes?.FilterPolicy,
      rawMessageDelivery: attributes?.RawMessageDelivery === "true",
    };
    topic.subscriptions.push(sub);
    return sub;
  }

  unsubscribe(subscriptionArn: string, region: string): void {
    for (const topic of this.topics.values()) {
      const idx = topic.subscriptions.findIndex((s) => s.subscriptionArn === subscriptionArn);
      if (idx >= 0) {
        topic.subscriptions.splice(idx, 1);
        return;
      }
    }
  }

  publish(topicArn: string, message: string, subject: string | undefined, messageAttributes: Record<string, any> | undefined, region: string): PublishResult {
    this.getTopic(topicArn, region);
    const messageId = crypto.randomUUID();
    this.onPublish?.(topicArn, message, subject, messageAttributes);
    return { messageId };
  }

  listSubscriptions(region: string): SnsSubscription[] {
    return this.topics.values().flatMap((t) => t.subscriptions);
  }

  listSubscriptionsByTopic(topicArn: string, region: string): SnsSubscription[] {
    const topic = this.getTopic(topicArn, region);
    return topic.subscriptions;
  }

  tagResource(resourceArn: string, tags: Record<string, string>, region: string): void {
    const name = resourceArn.split(":").pop()!;
    const topic = this.topics.get(this.regionKey(region, name));
    if (topic) Object.assign(topic.tags, tags);
  }

  private getTopic(topicArn: string, region: string): SnsTopic {
    const name = topicArn.split(":").pop()!;
    const key = this.regionKey(region, name);
    const topic = this.topics.get(key);
    if (!topic) throw new AwsError("NotFound", `Topic does not exist`, 404);
    return topic;
  }
}
