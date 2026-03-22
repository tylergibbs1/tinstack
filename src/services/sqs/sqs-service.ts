import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface SqsPermission {
  label: string;
  awsAccountIds: string[];
  actions: string[];
}

export interface SqsQueue {
  queueName: string;
  queueUrl: string;
  arn: string;
  attributes: Record<string, string>;
  tags: Record<string, string>;
  permissions: SqsPermission[];
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
    if (existing) {
      // Validate that requested attributes match existing queue's attributes
      if (attributes && Object.keys(attributes).length > 0) {
        for (const [attrName, attrValue] of Object.entries(attributes)) {
          if (existing.attributes[attrName] !== undefined && existing.attributes[attrName] !== attrValue) {
            throw new AwsError("QueueNameExists", "A queue with this name already exists with different attributes.", 400);
          }
        }
      }
      return existing;
    }

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
      permissions: [],
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
      // Prune expired entries (older than 5 minutes)
      const now = Date.now();
      for (const [id, ts] of dedupMap) {
        if (now - ts >= 300_000) dedupMap.delete(id);
      }
      const existing = dedupMap.get(messageDeduplicationId);
      if (existing && now - existing < 300_000) {
        const msgs = this.messages.get(key) ?? [];
        const found = msgs.find((m) => m.messageDeduplicationId === messageDeduplicationId);
        if (found) return found;
      }
      dedupMap.set(messageDeduplicationId, now);
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

      // Check RedrivePolicy — if receiveCount exceeds maxReceiveCount, move to DLQ
      const redrivePolicy = queue.attributes.RedrivePolicy;
      if (redrivePolicy) {
        const policy = JSON.parse(redrivePolicy) as { deadLetterTargetArn: string; maxReceiveCount: number };
        if (msg.receiveCount > policy.maxReceiveCount) {
          const dlqQueue = this.findQueueByArn(policy.deadLetterTargetArn);
          if (dlqQueue) {
            const dlqKey = this.findKeyByArn(policy.deadLetterTargetArn)!;
            // Remove from source queue
            const idx = msgs.indexOf(msg);
            if (idx >= 0) msgs.splice(idx, 1);
            // Reset message state and add to DLQ
            msg.receiptHandle = undefined;
            msg.visibleAt = Date.now();
            const dlqMsgs = this.messages.get(dlqKey) ?? [];
            dlqMsgs.push(msg);
            this.messages.set(dlqKey, dlqMsgs);
            continue;
          }
        }
      }

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
    if (visibilityTimeout === 0) {
      msg.receiptHandle = undefined;
    }
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

  changeMessageVisibilityBatch(
    queueUrl: string,
    entries: { id: string; receiptHandle: string; visibilityTimeout: number }[],
    region: string,
  ): { successful: { id: string }[]; failed: { id: string; code: string; message: string; senderFault: boolean }[] } {
    const successful: { id: string }[] = [];
    const failed: { id: string; code: string; message: string; senderFault: boolean }[] = [];
    for (const entry of entries) {
      try {
        this.changeMessageVisibility(queueUrl, entry.receiptHandle, entry.visibilityTimeout, region);
        successful.push({ id: entry.id });
      } catch (e: any) {
        failed.push({ id: entry.id, code: e.code ?? "InternalError", message: e.message, senderFault: true });
      }
    }
    return { successful, failed };
  }

  addPermission(queueUrl: string, label: string, awsAccountIds: string[], actions: string[], region: string): void {
    const queue = this.getQueue(queueUrl, region);
    if (queue.permissions.some((p) => p.label === label)) {
      throw new AwsError("InvalidParameterValue", `Value ${label} for parameter Label is invalid. Reason: Already exists.`, 400);
    }
    queue.permissions.push({ label, awsAccountIds, actions });
  }

  removePermission(queueUrl: string, label: string, region: string): void {
    const queue = this.getQueue(queueUrl, region);
    const idx = queue.permissions.findIndex((p) => p.label === label);
    if (idx < 0) {
      throw new AwsError("InvalidParameterValue", `Value ${label} for parameter Label is invalid. Reason: Does not exist.`, 400);
    }
    queue.permissions.splice(idx, 1);
  }

  private findQueueByArn(arn: string): SqsQueue | undefined {
    return this.queues.values().find((q) => q.arn === arn);
  }

  private findKeyByArn(arn: string): string | undefined {
    for (const key of this.queues.keys()) {
      const queue = this.queues.get(key);
      if (queue && queue.arn === arn) return key;
    }
    return undefined;
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
    const sorted = Object.keys(attrs).sort();
    const buffers: Buffer[] = [];
    for (const name of sorted) {
      const attr = attrs[name];
      const nameBytes = Buffer.from(name, "utf-8");
      const dataTypeBytes = Buffer.from(attr.DataType, "utf-8");

      // 4-byte big-endian length of name + name bytes
      const nameLenBuf = Buffer.alloc(4);
      nameLenBuf.writeUInt32BE(nameBytes.length, 0);
      buffers.push(nameLenBuf, nameBytes);

      // 4-byte big-endian length of data type + data type bytes
      const dtLenBuf = Buffer.alloc(4);
      dtLenBuf.writeUInt32BE(dataTypeBytes.length, 0);
      buffers.push(dtLenBuf, dataTypeBytes);

      // 1 byte transport type: 1 for String/Number, 2 for Binary
      const transportType = attr.DataType.startsWith("Binary") ? 2 : 1;
      buffers.push(Buffer.from([transportType]));

      // 4-byte big-endian length of value + value bytes
      const valueBytes = transportType === 2
        ? Buffer.from(attr.BinaryValue ?? "", "base64")
        : Buffer.from(attr.StringValue ?? "", "utf-8");
      const valLenBuf = Buffer.alloc(4);
      valLenBuf.writeUInt32BE(valueBytes.length, 0);
      buffers.push(valLenBuf, valueBytes);
    }
    const hasher = new Bun.CryptoHasher("md5");
    hasher.update(Buffer.concat(buffers));
    return hasher.digest("hex") as string;
  }
}
