import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  PinpointClient,
  CreateAppCommand,
  GetAppCommand,
  GetAppsCommand,
  DeleteAppCommand,
  CreateSegmentCommand,
  GetSegmentCommand,
  GetSegmentsCommand,
  DeleteSegmentCommand,
  CreateCampaignCommand,
  GetCampaignCommand,
  GetCampaignsCommand,
  DeleteCampaignCommand,
  SendMessagesCommand,
  UpdateEndpointCommand,
  GetEndpointCommand,
  DeleteEndpointCommand,
  PutEventsCommand,
} from "@aws-sdk/client-pinpoint";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new PinpointClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Pinpoint", () => {
  let appId: string;

  test("CreateApp", async () => {
    const res = await client.send(new CreateAppCommand({
      CreateApplicationRequest: { Name: "test-app" },
    }));
    expect(res.ApplicationResponse).toBeDefined();
    expect(res.ApplicationResponse!.Name).toBe("test-app");
    expect(res.ApplicationResponse!.Id).toBeDefined();
    appId = res.ApplicationResponse!.Id!;
  });

  test("GetApp", async () => {
    const res = await client.send(new GetAppCommand({ ApplicationId: appId }));
    expect(res.ApplicationResponse!.Name).toBe("test-app");
    expect(res.ApplicationResponse!.Id).toBe(appId);
  });

  test("GetApps", async () => {
    const res = await client.send(new GetAppsCommand({}));
    expect(res.ApplicationsResponse).toBeDefined();
    expect(res.ApplicationsResponse!.Item!.length).toBeGreaterThan(0);
  });

  let segmentId: string;

  test("CreateSegment", async () => {
    const res = await client.send(new CreateSegmentCommand({
      ApplicationId: appId,
      WriteSegmentRequest: { Name: "test-segment" },
    }));
    expect(res.SegmentResponse).toBeDefined();
    expect(res.SegmentResponse!.Name).toBe("test-segment");
    segmentId = res.SegmentResponse!.Id!;
  });

  test("GetSegment", async () => {
    const res = await client.send(new GetSegmentCommand({
      ApplicationId: appId,
      SegmentId: segmentId,
    }));
    expect(res.SegmentResponse!.Name).toBe("test-segment");
  });

  test("GetSegments", async () => {
    const res = await client.send(new GetSegmentsCommand({ ApplicationId: appId }));
    expect(res.SegmentsResponse!.Item!.length).toBeGreaterThan(0);
  });

  let campaignId: string;

  test("CreateCampaign", async () => {
    const res = await client.send(new CreateCampaignCommand({
      ApplicationId: appId,
      WriteCampaignRequest: { Name: "test-campaign", SegmentId: segmentId },
    }));
    expect(res.CampaignResponse).toBeDefined();
    expect(res.CampaignResponse!.Name).toBe("test-campaign");
    campaignId = res.CampaignResponse!.Id!;
  });

  test("GetCampaign", async () => {
    const res = await client.send(new GetCampaignCommand({
      ApplicationId: appId,
      CampaignId: campaignId,
    }));
    expect(res.CampaignResponse!.Name).toBe("test-campaign");
  });

  test("GetCampaigns", async () => {
    const res = await client.send(new GetCampaignsCommand({ ApplicationId: appId }));
    expect(res.CampaignsResponse!.Item!.length).toBeGreaterThan(0);
  });

  test("SendMessages", async () => {
    const res = await client.send(new SendMessagesCommand({
      ApplicationId: appId,
      MessageRequest: {
        Addresses: {
          "+1234567890": { ChannelType: "SMS" },
        },
        MessageConfiguration: {
          SMSMessage: { Body: "Hello from Pinpoint!" },
        },
      },
    }));
    expect(res.MessageResponse).toBeDefined();
    expect(res.MessageResponse!.Result).toBeDefined();
  });

  test("UpdateEndpoint + GetEndpoint", async () => {
    await client.send(new UpdateEndpointCommand({
      ApplicationId: appId,
      EndpointId: "test-endpoint-1",
      EndpointRequest: {
        ChannelType: "EMAIL",
        Address: "user@example.com",
      },
    }));

    const res = await client.send(new GetEndpointCommand({
      ApplicationId: appId,
      EndpointId: "test-endpoint-1",
    }));
    expect(res.EndpointResponse).toBeDefined();
    expect(res.EndpointResponse!.Address).toBe("user@example.com");
  });

  test("PutEvents", async () => {
    const res = await client.send(new PutEventsCommand({
      ApplicationId: appId,
      EventsRequest: {
        BatchItem: {
          endpoint1: {
            Endpoint: {},
            Events: {
              event1: {
                EventType: "test_event",
                Timestamp: new Date().toISOString(),
              },
            },
          },
        },
      },
    }));
    expect(res.EventsResponse).toBeDefined();
  });

  test("DeleteEndpoint", async () => {
    const res = await client.send(new DeleteEndpointCommand({
      ApplicationId: appId,
      EndpointId: "test-endpoint-1",
    }));
    expect(res.EndpointResponse).toBeDefined();
  });

  test("DeleteCampaign", async () => {
    const res = await client.send(new DeleteCampaignCommand({
      ApplicationId: appId,
      CampaignId: campaignId,
    }));
    expect(res.CampaignResponse).toBeDefined();
  });

  test("DeleteSegment", async () => {
    const res = await client.send(new DeleteSegmentCommand({
      ApplicationId: appId,
      SegmentId: segmentId,
    }));
    expect(res.SegmentResponse).toBeDefined();
  });

  test("DeleteApp", async () => {
    const res = await client.send(new DeleteAppCommand({ ApplicationId: appId }));
    expect(res.ApplicationResponse!.Name).toBe("test-app");
  });
});
