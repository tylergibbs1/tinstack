import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SqsService, MessageAttributeValue } from "./sqs-service";

export class SqsJsonHandler {
  constructor(private service: SqsService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateQueue":
          return this.createQueue(body, ctx);
        case "GetQueueUrl":
          return this.getQueueUrl(body, ctx);
        case "DeleteQueue":
          return this.deleteQueue(body, ctx);
        case "ListQueues":
          return this.listQueues(body, ctx);
        case "SendMessage":
          return this.sendMessage(body, ctx);
        case "ReceiveMessage":
          return this.receiveMessage(body, ctx);
        case "DeleteMessage":
          return this.deleteMessage(body, ctx);
        case "PurgeQueue":
          return this.purgeQueue(body, ctx);
        case "GetQueueAttributes":
          return this.getQueueAttributes(body, ctx);
        case "SetQueueAttributes":
          return this.setQueueAttributes(body, ctx);
        case "ChangeMessageVisibility":
          return this.changeMessageVisibility(body, ctx);
        case "SendMessageBatch":
          return this.sendMessageBatch(body, ctx);
        case "DeleteMessageBatch":
          return this.deleteMessageBatch(body, ctx);
        case "TagQueue":
          return this.tagQueue(body, ctx);
        case "UntagQueue":
          return this.untagQueue(body, ctx);
        case "ListQueueTags":
          return this.listQueueTags(body, ctx);
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.0", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private createQueue(body: any, ctx: RequestContext): Response {
    const queue = this.service.createQueue(body.QueueName, body.Attributes ?? {}, body.tags ?? {}, ctx.region);
    return this.json({ QueueUrl: queue.queueUrl }, ctx);
  }

  private getQueueUrl(body: any, ctx: RequestContext): Response {
    const url = this.service.getQueueUrl(body.QueueName, ctx.region);
    return this.json({ QueueUrl: url }, ctx);
  }

  private deleteQueue(body: any, ctx: RequestContext): Response {
    this.service.deleteQueue(body.QueueUrl, ctx.region);
    return this.json({}, ctx);
  }

  private listQueues(body: any, ctx: RequestContext): Response {
    const queues = this.service.listQueues(body.QueueNamePrefix, ctx.region);
    return this.json({ QueueUrls: queues.map((q) => q.queueUrl) }, ctx);
  }

  private sendMessage(body: any, ctx: RequestContext): Response {
    const msg = this.service.sendMessage(
      body.QueueUrl,
      body.MessageBody,
      body.DelaySeconds,
      body.MessageAttributes ?? {},
      ctx.region,
      body.MessageGroupId,
      body.MessageDeduplicationId,
    );
    return this.json({
      MessageId: msg.messageId,
      MD5OfMessageBody: msg.md5OfBody,
      MD5OfMessageAttributes: msg.md5OfMessageAttributes || undefined,
      SequenceNumber: msg.sequenceNumber,
    }, ctx);
  }

  private receiveMessage(body: any, ctx: RequestContext): Response {
    const msgs = this.service.receiveMessage(
      body.QueueUrl,
      body.MaxNumberOfMessages ?? 1,
      body.VisibilityTimeout,
      body.WaitTimeSeconds,
      ctx.region,
    );
    return this.json({
      Messages: msgs.map((m) => ({
        MessageId: m.messageId,
        ReceiptHandle: m.receiptHandle,
        MD5OfBody: m.md5OfBody,
        Body: m.body,
        Attributes: {
          SentTimestamp: String(m.sentTimestamp),
          ApproximateReceiveCount: String(m.receiveCount),
          ApproximateFirstReceiveTimestamp: String(m.firstReceiveTimestamp ?? ""),
        },
        MessageAttributes: Object.keys(m.messageAttributes).length > 0 ? m.messageAttributes : undefined,
      })),
    }, ctx);
  }

  private deleteMessage(body: any, ctx: RequestContext): Response {
    this.service.deleteMessage(body.QueueUrl, body.ReceiptHandle, ctx.region);
    return this.json({}, ctx);
  }

  private purgeQueue(body: any, ctx: RequestContext): Response {
    this.service.purgeQueue(body.QueueUrl, ctx.region);
    return this.json({}, ctx);
  }

  private getQueueAttributes(body: any, ctx: RequestContext): Response {
    const attrs = this.service.getQueueAttributes(body.QueueUrl, body.AttributeNames ?? ["All"], ctx.region);
    return this.json({ Attributes: attrs }, ctx);
  }

  private setQueueAttributes(body: any, ctx: RequestContext): Response {
    this.service.setQueueAttributes(body.QueueUrl, body.Attributes ?? {}, ctx.region);
    return this.json({}, ctx);
  }

  private changeMessageVisibility(body: any, ctx: RequestContext): Response {
    this.service.changeMessageVisibility(body.QueueUrl, body.ReceiptHandle, body.VisibilityTimeout, ctx.region);
    return this.json({}, ctx);
  }

  private sendMessageBatch(body: any, ctx: RequestContext): Response {
    const successful: any[] = [];
    const failed: any[] = [];
    for (const entry of body.Entries ?? []) {
      try {
        const msg = this.service.sendMessage(
          body.QueueUrl,
          entry.MessageBody,
          entry.DelaySeconds,
          entry.MessageAttributes ?? {},
          ctx.region,
          entry.MessageGroupId,
          entry.MessageDeduplicationId,
        );
        successful.push({
          Id: entry.Id,
          MessageId: msg.messageId,
          MD5OfMessageBody: msg.md5OfBody,
          SequenceNumber: msg.sequenceNumber,
        });
      } catch (e: any) {
        failed.push({ Id: entry.Id, Code: e.code ?? "InternalError", Message: e.message, SenderFault: true });
      }
    }
    return this.json({ Successful: successful, Failed: failed }, ctx);
  }

  private deleteMessageBatch(body: any, ctx: RequestContext): Response {
    const successful: any[] = [];
    const failed: any[] = [];
    for (const entry of body.Entries ?? []) {
      try {
        this.service.deleteMessage(body.QueueUrl, entry.ReceiptHandle, ctx.region);
        successful.push({ Id: entry.Id });
      } catch (e: any) {
        failed.push({ Id: entry.Id, Code: e.code ?? "InternalError", Message: e.message, SenderFault: true });
      }
    }
    return this.json({ Successful: successful, Failed: failed }, ctx);
  }

  private tagQueue(body: any, ctx: RequestContext): Response {
    this.service.tagQueue(body.QueueUrl, body.Tags ?? {}, ctx.region);
    return this.json({}, ctx);
  }

  private untagQueue(body: any, ctx: RequestContext): Response {
    this.service.untagQueue(body.QueueUrl, body.TagKeys ?? [], ctx.region);
    return this.json({}, ctx);
  }

  private listQueueTags(body: any, ctx: RequestContext): Response {
    const tags = this.service.listQueueTags(body.QueueUrl, ctx.region);
    return this.json({ Tags: tags }, ctx);
  }
}
