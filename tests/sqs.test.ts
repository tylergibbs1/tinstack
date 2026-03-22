import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SQSClient,
  CreateQueueCommand,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
  ListQueuesCommand,
  PurgeQueueCommand,
  SendMessageBatchCommand,
} from "@aws-sdk/client-sqs";
import { startServer, stopServer, clientConfig } from "./helpers";

const sqs = new SQSClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SQS", () => {
  let queueUrl: string;
  const queueName = "test-queue-" + Date.now();

  test("CreateQueue", async () => {
    const res = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    queueUrl = res.QueueUrl!;
    expect(queueUrl).toContain(queueName);
  });

  test("GetQueueUrl", async () => {
    const res = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    expect(res.QueueUrl).toBe(queueUrl);
  });

  test("ListQueues", async () => {
    const res = await sqs.send(new ListQueuesCommand({}));
    expect(res.QueueUrls?.some((u) => u.includes(queueName))).toBe(true);
  });

  test("GetQueueAttributes", async () => {
    const res = await sqs.send(new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ["All"],
    }));
    expect(res.Attributes?.VisibilityTimeout).toBe("30");
    expect(res.Attributes?.QueueArn).toContain(queueName);
  });

  test("SendMessage + ReceiveMessage", async () => {
    const send = await sqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: "Hello SQS!",
    }));
    expect(send.MessageId).toBeDefined();
    expect(send.MD5OfMessageBody).toBeDefined();

    const recv = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
    }));
    expect(recv.Messages?.length).toBeGreaterThan(0);
    expect(recv.Messages![0].Body).toBe("Hello SQS!");
  });

  test("DeleteMessage", async () => {
    const recv = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
    }));
    if (recv.Messages && recv.Messages.length > 0) {
      await sqs.send(new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: recv.Messages[0].ReceiptHandle!,
      }));
    }
  });

  test("SendMessageBatch", async () => {
    const res = await sqs.send(new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: [
        { Id: "1", MessageBody: "Batch message 1" },
        { Id: "2", MessageBody: "Batch message 2" },
        { Id: "3", MessageBody: "Batch message 3" },
      ],
    }));
    expect(res.Successful?.length).toBe(3);
  });

  test("PurgeQueue", async () => {
    await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
    const recv = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
    }));
    expect(recv.Messages?.length ?? 0).toBe(0);
  });

  test("FIFO Queue", async () => {
    const fifoRes = await sqs.send(new CreateQueueCommand({
      QueueName: `test-${Date.now()}.fifo`,
      Attributes: { FifoQueue: "true", ContentBasedDeduplication: "true" },
    }));
    const fifoUrl = fifoRes.QueueUrl!;

    await sqs.send(new SendMessageCommand({
      QueueUrl: fifoUrl,
      MessageBody: "FIFO message",
      MessageGroupId: "group1",
      MessageDeduplicationId: "dedup1",
    }));

    const recv = await sqs.send(new ReceiveMessageCommand({ QueueUrl: fifoUrl }));
    expect(recv.Messages?.[0].Body).toBe("FIFO message");
  });

  test("DeleteQueue", async () => {
    await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
    try {
      await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });
});
