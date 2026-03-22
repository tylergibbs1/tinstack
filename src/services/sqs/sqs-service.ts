import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface SqsQueue {
  queueName: string;
  queueUrl: string;
  arn: string;
  attributes: Record<string, string>;
  tags: Record<string, string>;
  createdTimestamp: number;
  lastModifiedTimestamp: number;
}

export interface SqsMessage {
  messageId: string;
  body: string;
  md5OfBody: string;
  messageAttributes: Record<string, MessageAttributeValue>;
  md5OfMessageAttributes: string;
  receiptHandle?: string;
  receiveCount: number;
  sentTimestamp: number;
  firstReceiveTimestamp?: number;
  visibleAt: number;
  // FIFO
  messageGroupId?: string;
  messageDeduplicationId?: string;
  sequenceNumber?: string;
}

export interface MessageAttributeValue {
  DataType: string;
  StringValue?: string;
  BinaryValue?: string;
}

export class SqsService {
  private queues: StorageBackend<string, SqsQueue>;
  private messages: StorageBackend<string, SqsMessage[]>;
  private dedupCache: Map<string, Map<string, number>> = new Map();
  private sequenceCounter = 0;

  constructor(
    private baseUrl: string,
    private accountId: string,
  ) {
    this.queues = new InMemoryStorage();
    this.messages = new InMemoryStorage();
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  private queueUrl(region: string, name: string): string {
    return `${this.baseUrl}/${this.accountId}/${name}`;
  }

  createQueue(queueName: string, attributes: Record<string, string>, tags: Record<string, string>, region: string): SqsQueue {
    const key = this.regionKey(region, queueName);
    const existing = this.queues.get(key);
    if (existing) return existing;

    const now = Date.now();
    const queue: SqsQueue = {
      queueName,
      queueUrl: this.queueUrl(region, queueName),
      arn: buildArn("sqs", region, this.accountId, "", queueName),
      attributes: {
        VisibilityTimeout: "30",
        MaximumMessageSize: "262144",
        MessageRetentionPeriod: "345600",
        DelaySeconds: "0",
        ReceiveMessageWaitTimeSeconds: "0",
        ...attributes,
      },
      tags,
      createdTimestamp: now,
      lastModifiedTimestamp: now,
    };
    this.queues.set(key, queue);
    this.messages.set(key, []);
    return queue;
  }

  getQueueUrl(queueName: string, region: string): string {
    const key = this.regionKey(region, queueName);
    const queue = this.queues.get(key);
    if (!queue) throw new AwsError("AWS.SimpleQueueService.NonExistentQueue", `The specified queue does not exist.`, 400);
    return queue.queueUrl;
  }

  deleteQueue(queueUrl: string, region: string): void {
    const queueName = this.queueNameFromUrl(queueUrl);
    const key = this.regionKey(region, queueName);
    if (!this.queues.has(key)) throw new AwsError("AWS.SimpleQueueService.NonExistentQueue", `The specified queue does not exist.`, 400);
    this.queues.delete(key);
    this.messages.delete(key);
  }

  listQueues(prefix: string | undefined, region: string): SqsQueue[] {
    return this.queues.values().filter((q) => {
      const k = this.regionKey(region, q.queueName);
      if (!this.queues.has(k)) return false;
      if (prefix && !q.queueName.startsWith(prefix)) return false;
      return true;
    });
  }

  getQueueAttributes(queueUrl: string, attributeNames: string[], region: string): Record<string, string> {
    const queue = this.getQueue(queueUrl, region);
    const msgs = this.messages.get(this.regionKey(region, queue.queueName)) ?? [];
    const now = Date.now();

    const all = attributeNames.includes("All");
    const result: Record<string, string> = {};

    const add = (name: string, value: string) => {
      if (all || attributeNames.includes(name)) result[name] = value;
    };

    add("QueueArn", queue.arn);
    add("CreatedTimestamp", String(Math.floor(queue.createdTimestamp / 1000)));
    add("LastModifiedTimestamp", String(Math.floor(queue.lastModifiedTimestamp / 1000)));

    for (const [k, v] of Object.entries(queue.attributes)) {
      add(k, v);
    }

    const visible = msgs.filter((m) => !m.receiptHandle && m.visibleAt <= now).length;
    const inFlight = msgs.filter((m) => m.receiptHandle && m.visibleAt > now).length;
    const delayed = msgs.filter((m) => m.visibleAt > now && !m.receiptHandle).length;

    add("ApproximateNumberOfMessages", String(visible));
    add("ApproximateNumberOfMessagesNotVisible", String(inFlight));
    add("ApproximateNumberOfMessagesDelayed", String(delayed));

    return result;
  }

  setQueueAttributes(queueUrl: string, attributes: Record<string, string>, region: string): void {
    const queue = this.getQueue(queueUrl, region);
    Object.assign(queue.attributes, attributes);
    queue.lastModifiedTimestamp = Date.now();
  }

  sendMessage(
    queueUrl: string,
    body: string,
    delaySeconds: number | undefined,
    messageAttributes: Record<string, MessageAttributeValue>,
    region: string,
    messageGroupId?: string,
    messageDeduplicationId?: string,
  ): SqsMessage {
    const queue = this.getQueue(queueUrl, region);
    const key = this.regionKey(region, queue.queueName);
    const isFifo = queue.queueName.endsWith(".fifo");

    if (isFifo && messageDeduplicationId) {
      const dedupKey = `${key}#${messageGroupId ?? ""}`;
      let dedupMap = this.dedupCache.get(dedupKey);
      if (!dedupMap) {
        dedupMap = new Map();
        this.dedupCache.set(dedupKey, dedupMap);
      }
      const existing = dedupMap.get(messageDeduplicationId);
      if (existing && Date.now() - existing < 300_000) {
        const msgs = this.messages.get(key) ?? [];
        const found = msgs.find((m) => m.messageDeduplicationId === messageDeduplicationId);
        if (found) return found;
      }
      dedupMap.set(messageDeduplicationId, Date.now());
    }

    const delay = (delaySeconds ?? parseInt(queue.attributes.DelaySeconds ?? "0", 10)) * 1000;
    const hasher = new Bun.CryptoHasher("md5");
    hasher.update(body);

    const msg: SqsMessage = {
      messageId: crypto.randomUUID(),
      body,
      md5OfBody: hasher.digest("hex") as string,
      messageAttributes,
      md5OfMessageAttributes: this.hashMessageAttributes(messageAttributes),
      receiveCount: 0,
      sentTimestamp: Date.now(),
      visibleAt: Date.now() + delay,
      messageGroupId,
      messageDeduplicationId,
      sequenceNumber: isFifo ? String(++this.sequenceCounter) : undefined,
    };

    const msgs = this.messages.get(key) ?? [];
    msgs.push(msg);
    this.messages.set(key, msgs);
    return msg;
  }

  receiveMessage(queueUrl: string, maxMessages: number, visibilityTimeout: number | undefined, waitTimeSeconds: number | undefined, region: string): SqsMessage[] {
    const queue = this.getQueue(queueUrl, region);
    const key = this.regionKey(region, queue.queueName);
    const msgs = this.messages.get(key) ?? [];
    const now = Date.now();
    const vt = (visibilityTimeout ?? parseInt(queue.attributes.VisibilityTimeout ?? "30", 10)) * 1000;

    const available = msgs.filter((m) => m.visibleAt <= now && !m.receiptHandle);
    const result: SqsMessage[] = [];

    for (const msg of available.slice(0, Math.min(maxMessages, 10))) {
      msg.receiptHandle = crypto.randomUUID();
      msg.receiveCount++;
      msg.visibleAt = now + vt;
      if (!msg.firstReceiveTimestamp) msg.firstReceiveTimestamp = now;
      result.push({ ...msg });
    }

    return result;
  }

  deleteMessage(queueUrl: string, receiptHandle: string, region: string): void {
    const queue = this.getQueue(queueUrl, region);
    const key = this.regionKey(region, queue.queueName);
    const msgs = this.messages.get(key) ?? [];
    const idx = msgs.findIndex((m) => m.receiptHandle === receiptHandle);
    if (idx >= 0) msgs.splice(idx, 1);
  }

  changeMessageVisibility(queueUrl: string, receiptHandle: string, visibilityTimeout: number, region: string): void {
    const queue = this.getQueue(queueUrl, region);
    const key = this.regionKey(region, queue.queueName);
    const msgs = this.messages.get(key) ?? [];
    const msg = msgs.find((m) => m.receiptHandle === receiptHandle);
    if (!msg) throw new AwsError("ReceiptHandleIsInvalid", "The input receipt handle is invalid.", 400);
    msg.visibleAt = Date.now() + visibilityTimeout * 1000;
  }

  purgeQueue(queueUrl: string, region: string): void {
    const queue = this.getQueue(queueUrl, region);
    const key = this.regionKey(region, queue.queueName);
    this.messages.set(key, []);
  }

  tagQueue(queueUrl: string, tags: Record<string, string>, region: string): void {
    const queue = this.getQueue(queueUrl, region);
    Object.assign(queue.tags, tags);
  }

  untagQueue(queueUrl: string, tagKeys: string[], region: string): void {
    const queue = this.getQueue(queueUrl, region);
    for (const key of tagKeys) delete queue.tags[key];
  }

  listQueueTags(queueUrl: string, region: string): Record<string, string> {
    return this.getQueue(queueUrl, region).tags;
  }

  private getQueue(queueUrl: string, region: string): SqsQueue {
    const queueName = this.queueNameFromUrl(queueUrl);
    const key = this.regionKey(region, queueName);
    const queue = this.queues.get(key);
    if (!queue) throw new AwsError("AWS.SimpleQueueService.NonExistentQueue", `The specified queue does not exist.`, 400);
    return queue;
  }

  private queueNameFromUrl(queueUrl: string): string {
    const parts = queueUrl.split("/");
    return parts[parts.length - 1];
  }

  private hashMessageAttributes(attrs: Record<string, MessageAttributeValue>): string {
    if (!attrs || Object.keys(attrs).length === 0) return "";
    const hasher = new Bun.CryptoHasher("md5");
    const sorted = Object.keys(attrs).sort();
    for (const key of sorted) {
      const attr = attrs[key];
      hasher.update(key);
      hasher.update(attr.DataType);
      if (attr.StringValue) hasher.update(attr.StringValue);
    }
    return hasher.digest("hex") as string;
  }
}
