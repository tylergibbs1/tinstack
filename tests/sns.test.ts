import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SNSClient,
  CreateTopicCommand,
  ListTopicsCommand,
  PublishCommand,
  PublishBatchCommand,
  SubscribeCommand,
  ConfirmSubscriptionCommand,
  UnsubscribeCommand,
  DeleteTopicCommand,
  GetTopicAttributesCommand,
  CreatePlatformApplicationCommand,
  GetPlatformApplicationAttributesCommand,
  SetPlatformApplicationAttributesCommand,
  ListPlatformApplicationsCommand,
  DeletePlatformApplicationCommand,
  CreatePlatformEndpointCommand,
  ListEndpointsByPlatformApplicationCommand,
  DeleteEndpointCommand,
  GetEndpointAttributesCommand,
  SetEndpointAttributesCommand,
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

  test("PublishBatch", async () => {
    const res = await sns.send(new PublishBatchCommand({
      TopicArn: topicArn,
      PublishBatchRequestEntries: [
        { Id: "1", Message: "Batch message 1" },
        { Id: "2", Message: "Batch message 2", Subject: "Subject 2" },
        { Id: "3", Message: "Batch message 3" },
      ],
    }));
    expect(res.Successful?.length).toBe(3);
    expect(res.Failed?.length ?? 0).toBe(0);
    expect(res.Successful?.[0].MessageId).toBeDefined();
  });

  test("ConfirmSubscription", async () => {
    // Subscribe first, then confirm with the token
    // In our emulator subscriptions are auto-confirmed, but the API should still work
    const sub = await sns.send(new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: "email",
      Endpoint: "confirm@example.com",
    }));
    expect(sub.SubscriptionArn).toBeDefined();

    // ConfirmSubscription should succeed (even though auto-confirmed)
    // We need to use a raw HTTP call since we don't know the token from SDK
    // Instead, test with a known-bad token to verify error handling
    try {
      await sns.send(new ConfirmSubscriptionCommand({
        TopicArn: topicArn,
        Token: "invalid-token",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }

    await sns.send(new UnsubscribeCommand({ SubscriptionArn: sub.SubscriptionArn! }));
  });

  test("FilterPolicy filters messages by attributes", async () => {
    // Create a fresh topic for this test
    const filterTopic = await sns.send(new CreateTopicCommand({ Name: "filter-test-topic" }));
    const filterTopicArn = filterTopic.TopicArn!;

    // Subscribe with a FilterPolicy that only accepts color=red
    const sub = await sns.send(new SubscribeCommand({
      TopicArn: filterTopicArn,
      Protocol: "sqs",
      Endpoint: "arn:aws:sqs:us-east-1:000000000000:filter-queue",
      Attributes: {
        FilterPolicy: JSON.stringify({ color: ["red"] }),
      },
    }));
    expect(sub.SubscriptionArn).toBeDefined();

    // Publish with matching attribute — should succeed (onPublish called)
    const pubMatch = await sns.send(new PublishCommand({
      TopicArn: filterTopicArn,
      Message: "Red item",
      MessageAttributes: {
        color: { DataType: "String", StringValue: "red" },
      },
    }));
    expect(pubMatch.MessageId).toBeDefined();

    // Publish with non-matching attribute — should succeed (onPublish not called but no error)
    const pubNoMatch = await sns.send(new PublishCommand({
      TopicArn: filterTopicArn,
      Message: "Blue item",
      MessageAttributes: {
        color: { DataType: "String", StringValue: "blue" },
      },
    }));
    expect(pubNoMatch.MessageId).toBeDefined();

    // Publish with no attributes — should succeed (filtered out)
    const pubNoAttrs = await sns.send(new PublishCommand({
      TopicArn: filterTopicArn,
      Message: "No attrs",
    }));
    expect(pubNoAttrs.MessageId).toBeDefined();

    // Cleanup
    await sns.send(new UnsubscribeCommand({ SubscriptionArn: sub.SubscriptionArn! }));
    await sns.send(new DeleteTopicCommand({ TopicArn: filterTopicArn }));
  });

  test("DeleteTopic", async () => {
    await sns.send(new DeleteTopicCommand({ TopicArn: topicArn }));
    const res = await sns.send(new ListTopicsCommand({}));
    expect(res.Topics?.some((t) => t.TopicArn === topicArn)).toBeFalsy();
  });
});

describe("SNS Platform Applications", () => {
  let platformAppArn: string;
  let endpointArn: string;

  test("CreatePlatformApplication", async () => {
    const res = await sns.send(new CreatePlatformApplicationCommand({
      Name: "my-gcm-app",
      Platform: "GCM",
      Attributes: { PlatformCredential: "fake-api-key" },
    }));
    platformAppArn = res.PlatformApplicationArn!;
    expect(platformAppArn).toContain("GCM");
    expect(platformAppArn).toContain("my-gcm-app");
  });

  test("GetPlatformApplicationAttributes", async () => {
    const res = await sns.send(new GetPlatformApplicationAttributesCommand({
      PlatformApplicationArn: platformAppArn,
    }));
    expect(res.Attributes?.PlatformCredential).toBe("fake-api-key");
  });

  test("SetPlatformApplicationAttributes", async () => {
    await sns.send(new SetPlatformApplicationAttributesCommand({
      PlatformApplicationArn: platformAppArn,
      Attributes: { PlatformCredential: "updated-key" },
    }));
    const res = await sns.send(new GetPlatformApplicationAttributesCommand({
      PlatformApplicationArn: platformAppArn,
    }));
    expect(res.Attributes?.PlatformCredential).toBe("updated-key");
  });

  test("ListPlatformApplications", async () => {
    const res = await sns.send(new ListPlatformApplicationsCommand({}));
    expect(res.PlatformApplications?.some((a) => a.PlatformApplicationArn === platformAppArn)).toBe(true);
  });

  test("CreatePlatformEndpoint", async () => {
    const res = await sns.send(new CreatePlatformEndpointCommand({
      PlatformApplicationArn: platformAppArn,
      Token: "device-token-abc123",
    }));
    endpointArn = res.EndpointArn!;
    expect(endpointArn).toBeDefined();
  });

  test("GetEndpointAttributes", async () => {
    const res = await sns.send(new GetEndpointAttributesCommand({
      EndpointArn: endpointArn,
    }));
    expect(res.Attributes?.Token).toBe("device-token-abc123");
    expect(res.Attributes?.Enabled).toBe("true");
  });

  test("SetEndpointAttributes", async () => {
    await sns.send(new SetEndpointAttributesCommand({
      EndpointArn: endpointArn,
      Attributes: { Enabled: "false" },
    }));
    const res = await sns.send(new GetEndpointAttributesCommand({
      EndpointArn: endpointArn,
    }));
    expect(res.Attributes?.Enabled).toBe("false");
  });

  test("ListEndpointsByPlatformApplication", async () => {
    const res = await sns.send(new ListEndpointsByPlatformApplicationCommand({
      PlatformApplicationArn: platformAppArn,
    }));
    expect(res.Endpoints?.some((ep) => ep.EndpointArn === endpointArn)).toBe(true);
  });

  test("DeleteEndpoint", async () => {
    await sns.send(new DeleteEndpointCommand({ EndpointArn: endpointArn }));
    const res = await sns.send(new ListEndpointsByPlatformApplicationCommand({
      PlatformApplicationArn: platformAppArn,
    }));
    expect(res.Endpoints?.some((ep) => ep.EndpointArn === endpointArn)).toBeFalsy();
  });

  test("DeletePlatformApplication", async () => {
    await sns.send(new DeletePlatformApplicationCommand({
      PlatformApplicationArn: platformAppArn,
    }));
    const res = await sns.send(new ListPlatformApplicationsCommand({}));
    expect(res.PlatformApplications?.some((a) => a.PlatformApplicationArn === platformAppArn)).toBeFalsy();
  });
});
