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
  confirmationToken?: string;
  confirmed: boolean;
}

export interface PublishResult {
  messageId: string;
}

export interface PlatformApplication {
  platformApplicationArn: string;
  name: string;
  platform: string;
  attributes: Record<string, string>;
}

export interface PlatformEndpoint {
  endpointArn: string;
  platformApplicationArn: string;
  token: string;
  attributes: Record<string, string>;
  enabled: boolean;
}

export class SnsService {
  private topics: StorageBackend<string, SnsTopic>;
  private platformApps: StorageBackend<string, PlatformApplication>;
  private platformEndpoints: StorageBackend<string, PlatformEndpoint>;
  private subscriptionCounter = 0;
  private endpointCounter = 0;

  // For cross-service integration: callbacks for SQS delivery
  public onPublish?: (topicArn: string, message: string, subject?: string, messageAttributes?: Record<string, any>) => void;

  constructor(private accountId: string) {
    this.topics = new InMemoryStorage();
    this.platformApps = new InMemoryStorage();
    this.platformEndpoints = new InMemoryStorage();
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
      Owner: this.accountId,
      DisplayName: topic.attributes.DisplayName ?? topic.name,
      Policy: topic.attributes.Policy ?? JSON.stringify({ Version: "2012-10-17", Statement: [] }),
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

    const confirmationToken = crypto.randomUUID();
    const sub: SnsSubscription = {
      subscriptionArn: subArn,
      topicArn,
      protocol,
      endpoint,
      owner: this.accountId,
      filterPolicy: attributes?.FilterPolicy,
      rawMessageDelivery: attributes?.RawMessageDelivery === "true",
      confirmationToken,
      confirmed: true, // auto-confirm for local emulator
    };
    topic.subscriptions.push(sub);
    return sub;
  }

  getSubscription(subscriptionArn: string, region: string): SnsSubscription {
    for (const topic of this.topics.values()) {
      const sub = topic.subscriptions.find((s) => s.subscriptionArn === subscriptionArn);
      if (sub) return sub;
    }
    throw new AwsError("NotFoundException", `Subscription does not exist`, 404);
  }

  setSubscriptionAttribute(subscriptionArn: string, attributeName: string, attributeValue: string, region: string): void {
    const sub = this.getSubscription(subscriptionArn, region);
    if (attributeName === "RawMessageDelivery") sub.rawMessageDelivery = attributeValue === "true";
    if (attributeName === "FilterPolicy") sub.filterPolicy = attributeValue;
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
    const topic = this.getTopic(topicArn, region);
    const messageId = crypto.randomUUID();

    for (const sub of topic.subscriptions) {
      if (!sub.confirmed) continue;
      if (sub.filterPolicy && messageAttributes) {
        if (!this.matchesFilterPolicy(JSON.parse(sub.filterPolicy), messageAttributes)) {
          continue;
        }
      } else if (sub.filterPolicy && !messageAttributes) {
        // Filter policy exists but no message attributes — no match
        continue;
      }
      this.onPublish?.(topicArn, message, subject, messageAttributes);
    }

    // If no subscriptions, still fire onPublish for backward compatibility
    if (topic.subscriptions.length === 0) {
      this.onPublish?.(topicArn, message, subject, messageAttributes);
    }

    return { messageId };
  }

  private matchesFilterPolicy(policy: Record<string, any[]>, messageAttributes: Record<string, any>): boolean {
    for (const key of Object.keys(policy)) {
      const conditions = policy[key];
      const attr = messageAttributes[key];

      for (const condition of conditions) {
        if (typeof condition === "object" && condition !== null && !Array.isArray(condition)) {
          // Special condition object
          if ("exists" in condition) {
            const exists = attr !== undefined;
            if (condition.exists !== exists) return false;
            continue;
          }
          if ("anything-but" in condition) {
            if (attr === undefined) return false;
            const attrValue = attr.Value ?? attr.StringValue ?? attr;
            const blocked = Array.isArray(condition["anything-but"]) ? condition["anything-but"] : [condition["anything-but"]];
            if (blocked.includes(attrValue)) return false;
            continue;
          }
          if ("numeric" in condition) {
            if (attr === undefined) return false;
            const numVal = parseFloat(attr.Value ?? attr.StringValue ?? attr);
            const ops = condition.numeric as any[];
            if (!this.evaluateNumericCondition(numVal, ops)) return false;
            continue;
          }
        }
      }

      // String matching: attribute value must be in the conditions array (for primitive values)
      const primitiveConditions = conditions.filter(
        (c: any) => typeof c === "string" || typeof c === "number",
      );
      if (primitiveConditions.length > 0) {
        if (attr === undefined) return false;
        const attrValue = attr.Value ?? attr.StringValue ?? attr;
        if (!primitiveConditions.includes(attrValue)) return false;
      }
    }
    return true;
  }

  private evaluateNumericCondition(value: number, ops: any[]): boolean {
    for (let i = 0; i < ops.length; i += 2) {
      const op = ops[i] as string;
      const operand = ops[i + 1] as number;
      switch (op) {
        case "=": if (value !== operand) return false; break;
        case ">": if (value <= operand) return false; break;
        case ">=": if (value < operand) return false; break;
        case "<": if (value >= operand) return false; break;
        case "<=": if (value > operand) return false; break;
      }
    }
    return true;
  }

  publishBatch(
    topicArn: string,
    entries: { id: string; message: string; subject?: string; messageAttributes?: Record<string, any> }[],
    region: string,
  ): { successful: { id: string; messageId: string }[]; failed: { id: string; code: string; message: string; senderFault: boolean }[] } {
    this.getTopic(topicArn, region);
    const successful: { id: string; messageId: string }[] = [];
    const failed: { id: string; code: string; message: string; senderFault: boolean }[] = [];
    for (const entry of entries) {
      try {
        const result = this.publish(topicArn, entry.message, entry.subject, entry.messageAttributes, region);
        successful.push({ id: entry.id, messageId: result.messageId });
      } catch (e: any) {
        failed.push({ id: entry.id, code: e.code ?? "InternalError", message: e.message, senderFault: true });
      }
    }
    return { successful, failed };
  }

  confirmSubscription(topicArn: string, token: string, region: string): SnsSubscription {
    const topic = this.getTopic(topicArn, region);
    const sub = topic.subscriptions.find((s) => s.confirmationToken === token);
    if (!sub) throw new AwsError("InvalidParameterException", "Invalid token", 400);
    sub.confirmed = true;
    return sub;
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

  listTagsForResource(resourceArn: string, region: string): Record<string, string> {
    const name = resourceArn.split(":").pop()!;
    const topic = this.topics.get(this.regionKey(region, name));
    if (!topic) throw new AwsError("NotFoundException", "Topic does not exist", 404);
    return topic.tags;
  }

  untagResource(resourceArn: string, tagKeys: string[], region: string): void {
    const name = resourceArn.split(":").pop()!;
    const topic = this.topics.get(this.regionKey(region, name));
    if (topic) {
      for (const key of tagKeys) delete topic.tags[key];
    }
  }

  createPlatformApplication(name: string, platform: string, attributes: Record<string, string>, region: string): PlatformApplication {
    const arn = buildArn("sns", region, this.accountId, "app/", `${platform}/${name}`);
    const key = `${region}#${arn}`;
    const existing = this.platformApps.get(key);
    if (existing) return existing;

    const app: PlatformApplication = { platformApplicationArn: arn, name, platform, attributes };
    this.platformApps.set(key, app);
    return app;
  }

  getPlatformApplicationAttributes(platformApplicationArn: string, region: string): Record<string, string> {
    const app = this.getPlatformApp(platformApplicationArn, region);
    return { ...app.attributes, PlatformApplicationArn: app.platformApplicationArn };
  }

  setPlatformApplicationAttributes(platformApplicationArn: string, attributes: Record<string, string>, region: string): void {
    const app = this.getPlatformApp(platformApplicationArn, region);
    Object.assign(app.attributes, attributes);
  }

  listPlatformApplications(region: string): PlatformApplication[] {
    return this.platformApps.values().filter((a) => a.platformApplicationArn.includes(`:${region}:`));
  }

  deletePlatformApplication(platformApplicationArn: string, region: string): void {
    const key = `${region}#${platformApplicationArn}`;
    this.platformApps.delete(key);
    // Clean up endpoints for this application
    for (const k of this.platformEndpoints.keys()) {
      const ep = this.platformEndpoints.get(k)!;
      if (ep.platformApplicationArn === platformApplicationArn) {
        this.platformEndpoints.delete(k);
      }
    }
  }

  createPlatformEndpoint(platformApplicationArn: string, token: string, attributes: Record<string, string>, region: string): PlatformEndpoint {
    this.getPlatformApp(platformApplicationArn, region);
    const endpointId = crypto.randomUUID().replace(/-/g, "");
    const arn = `${platformApplicationArn}/${endpointId}`;
    const key = `${region}#${arn}`;
    const ep: PlatformEndpoint = {
      endpointArn: arn,
      platformApplicationArn,
      token,
      attributes: { ...attributes, Token: token, Enabled: attributes.Enabled ?? "true" },
      enabled: (attributes.Enabled ?? "true") === "true",
    };
    this.platformEndpoints.set(key, ep);
    return ep;
  }

  listEndpointsByPlatformApplication(platformApplicationArn: string, region: string): PlatformEndpoint[] {
    this.getPlatformApp(platformApplicationArn, region);
    return this.platformEndpoints.values().filter((ep) => ep.platformApplicationArn === platformApplicationArn);
  }

  deleteEndpoint(endpointArn: string, region: string): void {
    const key = `${region}#${endpointArn}`;
    this.platformEndpoints.delete(key);
  }

  getEndpointAttributes(endpointArn: string, region: string): Record<string, string> {
    const ep = this.getEndpoint(endpointArn, region);
    return { ...ep.attributes, Enabled: String(ep.enabled) };
  }

  setEndpointAttributes(endpointArn: string, attributes: Record<string, string>, region: string): void {
    const ep = this.getEndpoint(endpointArn, region);
    Object.assign(ep.attributes, attributes);
    if (attributes.Enabled !== undefined) ep.enabled = attributes.Enabled === "true";
    if (attributes.Token !== undefined) ep.token = attributes.Token;
  }

  private getPlatformApp(arn: string, region: string): PlatformApplication {
    const key = `${region}#${arn}`;
    const app = this.platformApps.get(key);
    if (!app) throw new AwsError("NotFoundException", `Platform application does not exist`, 404);
    return app;
  }

  private getEndpoint(arn: string, region: string): PlatformEndpoint {
    const key = `${region}#${arn}`;
    const ep = this.platformEndpoints.get(key);
    if (!ep) throw new AwsError("NotFoundException", `Endpoint does not exist`, 404);
    return ep;
  }

  private getTopic(topicArn: string, region: string): SnsTopic {
    const name = topicArn.split(":").pop()!;
    const key = this.regionKey(region, name);
    const topic = this.topics.get(key);
    if (!topic) throw new AwsError("NotFoundException", `Topic does not exist`, 404);
    return topic;
  }
}
