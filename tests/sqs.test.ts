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
  SetQueueAttributesCommand,
  ListQueuesCommand,
  PurgeQueueCommand,
  SendMessageBatchCommand,
  ChangeMessageVisibilityBatchCommand,
  AddPermissionCommand,
  RemovePermissionCommand,
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

  test("ChangeMessageVisibilityBatch", async () => {
    // Send two messages
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "vis-batch-1" }));
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "vis-batch-2" }));

    const recv = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 2,
    }));
    expect(recv.Messages?.length).toBe(2);

    const res = await sqs.send(new ChangeMessageVisibilityBatchCommand({
      QueueUrl: queueUrl,
      Entries: recv.Messages!.map((m, i) => ({
        Id: String(i),
        ReceiptHandle: m.ReceiptHandle!,
        VisibilityTimeout: 0,
      })),
    }));
    expect(res.Successful?.length).toBe(2);
    expect(res.Failed?.length ?? 0).toBe(0);

    // Messages should be immediately visible again
    const recv2 = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
    }));
    expect(recv2.Messages?.length).toBe(2);

    // Clean up
    await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
  });

  test("AddPermission + RemovePermission", async () => {
    await sqs.send(new AddPermissionCommand({
      QueueUrl: queueUrl,
      Label: "test-permission",
      AWSAccountIds: ["123456789012"],
      Actions: ["SendMessage"],
    }));

    // Adding the same label again should fail
    try {
      await sqs.send(new AddPermissionCommand({
        QueueUrl: queueUrl,
        Label: "test-permission",
        AWSAccountIds: ["123456789012"],
        Actions: ["SendMessage"],
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }

    // Remove it
    await sqs.send(new RemovePermissionCommand({
      QueueUrl: queueUrl,
      Label: "test-permission",
    }));

    // Removing again should fail
    try {
      await sqs.send(new RemovePermissionCommand({
        QueueUrl: queueUrl,
        Label: "test-permission",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });

  test("Dead Letter Queue (RedrivePolicy)", async () => {
    // Create DLQ
    const dlqName = "test-dlq-" + Date.now();
    const dlqRes = await sqs.send(new CreateQueueCommand({ QueueName: dlqName }));
    const dlqUrl = dlqRes.QueueUrl!;

    // Get DLQ ARN
    const dlqAttrs = await sqs.send(new GetQueueAttributesCommand({
      QueueUrl: dlqUrl,
      AttributeNames: ["QueueArn"],
    }));
    const dlqArn = dlqAttrs.Attributes!.QueueArn!;

    // Create source queue with RedrivePolicy (maxReceiveCount=2) and short visibility
    const srcName = "test-src-dlq-" + Date.now();
    const srcRes = await sqs.send(new CreateQueueCommand({
      QueueName: srcName,
      Attributes: {
        RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlqArn, maxReceiveCount: 2 }),
        VisibilityTimeout: "1",
      },
    }));
    const srcUrl = srcRes.QueueUrl!;

    // Send a message to source queue
    await sqs.send(new SendMessageCommand({ QueueUrl: srcUrl, MessageBody: "DLQ test message" }));

    // Receive #1 — increments receiveCount to 1
    const recv1 = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: srcUrl,
      MaxNumberOfMessages: 1,
    }));
    expect(recv1.Messages?.length).toBe(1);
    expect(recv1.Messages![0].Body).toBe("DLQ test message");

    // Make message visible again by deleting + re-sending would change the message.
    // Instead, use ChangeMessageVisibility to make it immediately visible.
    await sqs.send(new ChangeMessageVisibilityBatchCommand({
      QueueUrl: srcUrl,
      Entries: [{ Id: "0", ReceiptHandle: recv1.Messages![0].ReceiptHandle!, VisibilityTimeout: 0 }],
    }));

    // Receive #2 — increments receiveCount to 2
    const recv2 = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: srcUrl,
      MaxNumberOfMessages: 1,
    }));
    expect(recv2.Messages?.length).toBe(1);
    expect(recv2.Messages![0].Body).toBe("DLQ test message");

    // Make message visible again
    await sqs.send(new ChangeMessageVisibilityBatchCommand({
      QueueUrl: srcUrl,
      Entries: [{ Id: "0", ReceiptHandle: recv2.Messages![0].ReceiptHandle!, VisibilityTimeout: 0 }],
    }));

    // Receive #3 — receiveCount becomes 3 > maxReceiveCount(2), message moves to DLQ
    const recv3 = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: srcUrl,
      MaxNumberOfMessages: 1,
    }));
    expect(recv3.Messages?.length ?? 0).toBe(0);

    // Message should now be in the DLQ
    const dlqRecv = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: dlqUrl,
      MaxNumberOfMessages: 1,
    }));
    expect(dlqRecv.Messages?.length).toBe(1);
    expect(dlqRecv.Messages![0].Body).toBe("DLQ test message");

    // Cleanup
    await sqs.send(new DeleteQueueCommand({ QueueUrl: srcUrl }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl: dlqUrl }));
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
