import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlEnvelopeNoResult, xmlResponse, AWS_NAMESPACES } from "../../core/xml";
import type { SqsService, MessageAttributeValue } from "./sqs-service";

const NS = AWS_NAMESPACES.SQS;

export class SqsQueryHandler {
  constructor(private service: SqsService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateQueue":
          return this.createQueue(params, ctx);
        case "GetQueueUrl":
          return this.getQueueUrl(params, ctx);
        case "DeleteQueue":
          return this.deleteQueue(params, ctx);
        case "ListQueues":
          return this.listQueues(params, ctx);
        case "SendMessage":
          return this.sendMessage(params, ctx);
        case "ReceiveMessage":
          return this.receiveMessage(params, ctx);
        case "DeleteMessage":
          return this.deleteMessage(params, ctx);
        case "PurgeQueue":
          return this.purgeQueue(params, ctx);
        case "GetQueueAttributes":
          return this.getQueueAttributes(params, ctx);
        case "SetQueueAttributes":
          return this.setQueueAttributes(params, ctx);
        case "ChangeMessageVisibility":
          return this.changeVisibility(params, ctx);
        case "SendMessageBatch":
          return this.sendMessageBatch(params, ctx);
        case "DeleteMessageBatch":
          return this.deleteMessageBatch(params, ctx);
        case "TagQueue":
          return this.tagQueue(params, ctx);
        case "UntagQueue":
          return this.untagQueue(params, ctx);
        case "ListQueueTags":
          return this.listQueueTags(params, ctx);
        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private createQueue(params: URLSearchParams, ctx: RequestContext): Response {
    const name = params.get("QueueName")!;
    const attrs = extractIndexedParams(params, "Attribute");
    const tags = extractIndexedParams(params, "Tag");
    const queue = this.service.createQueue(name, attrs, tags, ctx.region);
    const result = new XmlBuilder().elem("QueueUrl", queue.queueUrl).build();
    return xmlResponse(xmlEnvelope("CreateQueue", ctx.requestId, result, NS), ctx.requestId);
  }

  private getQueueUrl(params: URLSearchParams, ctx: RequestContext): Response {
    const url = this.service.getQueueUrl(params.get("QueueName")!, ctx.region);
    const result = new XmlBuilder().elem("QueueUrl", url).build();
    return xmlResponse(xmlEnvelope("GetQueueUrl", ctx.requestId, result, NS), ctx.requestId);
  }

  private deleteQueue(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteQueue(params.get("QueueUrl")!, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("DeleteQueue", ctx.requestId, NS), ctx.requestId);
  }

  private listQueues(params: URLSearchParams, ctx: RequestContext): Response {
    const prefix = params.get("QueueNamePrefix") ?? undefined;
    const queues = this.service.listQueues(prefix, ctx.region);
    const xml = new XmlBuilder();
    for (const q of queues) xml.elem("QueueUrl", q.queueUrl);
    return xmlResponse(xmlEnvelope("ListQueues", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private sendMessage(params: URLSearchParams, ctx: RequestContext): Response {
    const attrs = extractMessageAttributes(params);
    const msg = this.service.sendMessage(
      params.get("QueueUrl")!,
      params.get("MessageBody")!,
      params.has("DelaySeconds") ? parseInt(params.get("DelaySeconds")!) : undefined,
      attrs,
      ctx.region,
      params.get("MessageGroupId") ?? undefined,
      params.get("MessageDeduplicationId") ?? undefined,
    );
    const xml = new XmlBuilder()
      .elem("MessageId", msg.messageId)
      .elem("MD5OfMessageBody", msg.md5OfBody);
    if (msg.md5OfMessageAttributes) xml.elem("MD5OfMessageAttributes", msg.md5OfMessageAttributes);
    if (msg.sequenceNumber) xml.elem("SequenceNumber", msg.sequenceNumber);
    return xmlResponse(xmlEnvelope("SendMessage", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private receiveMessage(params: URLSearchParams, ctx: RequestContext): Response {
    const msgs = this.service.receiveMessage(
      params.get("QueueUrl")!,
      params.has("MaxNumberOfMessages") ? parseInt(params.get("MaxNumberOfMessages")!) : 1,
      params.has("VisibilityTimeout") ? parseInt(params.get("VisibilityTimeout")!) : undefined,
      params.has("WaitTimeSeconds") ? parseInt(params.get("WaitTimeSeconds")!) : undefined,
      ctx.region,
    );
    const xml = new XmlBuilder();
    for (const m of msgs) {
      xml.start("Message")
        .elem("MessageId", m.messageId)
        .elem("ReceiptHandle", m.receiptHandle!)
        .elem("MD5OfBody", m.md5OfBody)
        .elem("Body", m.body)
        .start("Attribute").elem("Name", "SentTimestamp").elem("Value", String(m.sentTimestamp)).end("Attribute")
        .start("Attribute").elem("Name", "ApproximateReceiveCount").elem("Value", String(m.receiveCount)).end("Attribute")
        .end("Message");
    }
    return xmlResponse(xmlEnvelope("ReceiveMessage", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteMessage(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteMessage(params.get("QueueUrl")!, params.get("ReceiptHandle")!, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("DeleteMessage", ctx.requestId, NS), ctx.requestId);
  }

  private purgeQueue(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.purgeQueue(params.get("QueueUrl")!, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("PurgeQueue", ctx.requestId, NS), ctx.requestId);
  }

  private getQueueAttributes(params: URLSearchParams, ctx: RequestContext): Response {
    const names: string[] = [];
    for (const [k, v] of params) {
      if (k.startsWith("AttributeName")) names.push(v);
    }
    if (names.length === 0) names.push("All");
    const attrs = this.service.getQueueAttributes(params.get("QueueUrl")!, names, ctx.region);
    const xml = new XmlBuilder();
    for (const [k, v] of Object.entries(attrs)) {
      xml.start("Attribute").elem("Name", k).elem("Value", v).end("Attribute");
    }
    return xmlResponse(xmlEnvelope("GetQueueAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private setQueueAttributes(params: URLSearchParams, ctx: RequestContext): Response {
    const attrs = extractIndexedParams(params, "Attribute");
    this.service.setQueueAttributes(params.get("QueueUrl")!, attrs, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("SetQueueAttributes", ctx.requestId, NS), ctx.requestId);
  }

  private changeVisibility(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.changeMessageVisibility(
      params.get("QueueUrl")!,
      params.get("ReceiptHandle")!,
      parseInt(params.get("VisibilityTimeout")!),
      ctx.region,
    );
    return xmlResponse(xmlEnvelopeNoResult("ChangeMessageVisibility", ctx.requestId, NS), ctx.requestId);
  }

  private sendMessageBatch(params: URLSearchParams, ctx: RequestContext): Response {
    const entries = extractBatchEntries(params, "SendMessageBatchRequestEntry");
    const xml = new XmlBuilder();
    for (const entry of entries) {
      try {
        const msg = this.service.sendMessage(
          params.get("QueueUrl")!,
          entry.MessageBody!,
          entry.DelaySeconds ? parseInt(entry.DelaySeconds) : undefined,
          {},
          ctx.region,
          entry.MessageGroupId,
          entry.MessageDeduplicationId,
        );
        xml.start("SendMessageBatchResultEntry")
          .elem("Id", entry.Id!)
          .elem("MessageId", msg.messageId)
          .elem("MD5OfMessageBody", msg.md5OfBody)
          .end("SendMessageBatchResultEntry");
      } catch (e: any) {
        xml.start("BatchResultErrorEntry")
          .elem("Id", entry.Id!)
          .elem("Code", e.code ?? "InternalError")
          .elem("Message", e.message)
          .elem("SenderFault", "true")
          .end("BatchResultErrorEntry");
      }
    }
    return xmlResponse(xmlEnvelope("SendMessageBatch", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteMessageBatch(params: URLSearchParams, ctx: RequestContext): Response {
    const entries = extractBatchEntries(params, "DeleteMessageBatchRequestEntry");
    const xml = new XmlBuilder();
    for (const entry of entries) {
      try {
        this.service.deleteMessage(params.get("QueueUrl")!, entry.ReceiptHandle!, ctx.region);
        xml.start("DeleteMessageBatchResultEntry").elem("Id", entry.Id!).end("DeleteMessageBatchResultEntry");
      } catch (e: any) {
        xml.start("BatchResultErrorEntry")
          .elem("Id", entry.Id!)
          .elem("Code", e.code ?? "InternalError")
          .elem("Message", e.message)
          .elem("SenderFault", "true")
          .end("BatchResultErrorEntry");
      }
    }
    return xmlResponse(xmlEnvelope("DeleteMessageBatch", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private tagQueue(params: URLSearchParams, ctx: RequestContext): Response {
    const tags = extractIndexedParams(params, "Tag");
    this.service.tagQueue(params.get("QueueUrl")!, tags, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("TagQueue", ctx.requestId, NS), ctx.requestId);
  }

  private untagQueue(params: URLSearchParams, ctx: RequestContext): Response {
    const keys: string[] = [];
    for (const [k, v] of params) {
      if (k.startsWith("TagKey")) keys.push(v);
    }
    this.service.untagQueue(params.get("QueueUrl")!, keys, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("UntagQueue", ctx.requestId, NS), ctx.requestId);
  }

  private listQueueTags(params: URLSearchParams, ctx: RequestContext): Response {
    const tags = this.service.listQueueTags(params.get("QueueUrl")!, ctx.region);
    const xml = new XmlBuilder();
    for (const [k, v] of Object.entries(tags)) {
      xml.start("Tag").elem("Key", k).elem("Value", v).end("Tag");
    }
    return xmlResponse(xmlEnvelope("ListQueueTags", ctx.requestId, xml.build(), NS), ctx.requestId);
  }
}

function extractIndexedParams(params: URLSearchParams, prefix: string): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 1;
  while (params.has(`${prefix}.${i}.Name`) || params.has(`${prefix}.${i}.Key`)) {
    const name = params.get(`${prefix}.${i}.Name`) ?? params.get(`${prefix}.${i}.Key`)!;
    const value = params.get(`${prefix}.${i}.Value`)!;
    result[name] = value;
    i++;
  }
  return result;
}

function extractMessageAttributes(params: URLSearchParams): Record<string, MessageAttributeValue> {
  const result: Record<string, MessageAttributeValue> = {};
  let i = 1;
  while (params.has(`MessageAttribute.${i}.Name`)) {
    const name = params.get(`MessageAttribute.${i}.Name`)!;
    result[name] = {
      DataType: params.get(`MessageAttribute.${i}.Value.DataType`) ?? "String",
      StringValue: params.get(`MessageAttribute.${i}.Value.StringValue`) ?? undefined,
      BinaryValue: params.get(`MessageAttribute.${i}.Value.BinaryValue`) ?? undefined,
    };
    i++;
  }
  return result;
}

function extractBatchEntries(params: URLSearchParams, prefix: string): Record<string, string>[] {
  const entries: Record<string, string>[] = [];
  let i = 1;
  while (params.has(`${prefix}.${i}.Id`)) {
    const entry: Record<string, string> = {};
    for (const [k, v] of params) {
      const p = `${prefix}.${i}.`;
      if (k.startsWith(p)) {
        entry[k.slice(p.length)] = v;
      }
    }
    entries.push(entry);
    i++;
  }
  return entries;
}
