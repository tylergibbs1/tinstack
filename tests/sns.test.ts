import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SNSClient,
  CreateTopicCommand,
  ListTopicsCommand,
  PublishCommand,
  SubscribeCommand,
  UnsubscribeCommand,
  DeleteTopicCommand,
  GetTopicAttributesCommand,
} from "@aws-sdk/client-sns";
import { startServer, stopServer, clientConfig } from "./helpers";

const sns = new SNSClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SNS", () => {
  let topicArn: string;

  test("CreateTopic", async () => {
    const res = await sns.send(new CreateTopicCommand({ Name: "test-topic" }));
    topicArn = res.TopicArn!;
    expect(topicArn).toContain("test-topic");
  });

  test("ListTopics", async () => {
    const res = await sns.send(new ListTopicsCommand({}));
    expect(res.Topics?.some((t) => t.TopicArn === topicArn)).toBe(true);
  });

  test("GetTopicAttributes", async () => {
    const res = await sns.send(new GetTopicAttributesCommand({ TopicArn: topicArn }));
    expect(res.Attributes?.TopicArn).toBe(topicArn);
  });

  test("Subscribe + Publish", async () => {
    const sub = await sns.send(new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: "email",
      Endpoint: "test@example.com",
    }));
    expect(sub.SubscriptionArn).toBeDefined();

    const pub = await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Message: "Hello SNS!",
      Subject: "Test",
    }));
    expect(pub.MessageId).toBeDefined();

    await sns.send(new UnsubscribeCommand({ SubscriptionArn: sub.SubscriptionArn! }));
  });

  test("DeleteTopic", async () => {
    await sns.send(new DeleteTopicCommand({ TopicArn: topicArn }));
    const res = await sns.send(new ListTopicsCommand({}));
    expect(res.Topics?.some((t) => t.TopicArn === topicArn)).toBeFalsy();
  });
});
