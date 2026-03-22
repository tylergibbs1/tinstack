import { AwsError } from "../../core/errors";

export interface PinpointApp {
  id: string;
  arn: string;
  name: string;
  creationDate: string;
}

export interface Segment {
  id: string;
  applicationId: string;
  arn: string;
  name: string;
  segmentType: string;
  creationDate: string;
  version: number;
  dimensions?: any;
}

export interface Campaign {
  id: string;
  applicationId: string;
  arn: string;
  name: string;
  state: { CampaignStatus: string };
  creationDate: string;
  segmentId?: string;
  segmentVersion?: number;
  schedule?: any;
  messageConfiguration?: any;
}

export interface Endpoint {
  id: string;
  applicationId: string;
  channelType?: string;
  address?: string;
  attributes?: Record<string, string[]>;
  demographic?: any;
  effectiveDate?: string;
  endpointStatus?: string;
  location?: any;
  user?: any;
}

export class PinpointService {
  private apps = new Map<string, PinpointApp>();
  private segments = new Map<string, Map<string, Segment>>();
  private campaigns = new Map<string, Map<string, Campaign>>();
  private endpoints = new Map<string, Map<string, Endpoint>>();

  constructor(private accountId: string) {}

  createApp(name: string, region: string): PinpointApp {
    const id = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
    const app: PinpointApp = {
      id,
      arn: `arn:aws:mobiletargeting:${region}:${this.accountId}:apps/${id}`,
      name,
      creationDate: new Date().toISOString(),
    };
    this.apps.set(id, app);
    this.segments.set(id, new Map());
    this.campaigns.set(id, new Map());
    this.endpoints.set(id, new Map());
    return app;
  }

  getApp(applicationId: string): PinpointApp {
    const app = this.apps.get(applicationId);
    if (!app) {
      throw new AwsError("NotFoundException", `Application ${applicationId} not found.`, 404);
    }
    return app;
  }

  getApps(): PinpointApp[] {
    return Array.from(this.apps.values());
  }

  deleteApp(applicationId: string): PinpointApp {
    const app = this.getApp(applicationId);
    this.apps.delete(applicationId);
    this.segments.delete(applicationId);
    this.campaigns.delete(applicationId);
    this.endpoints.delete(applicationId);
    return app;
  }

  createSegment(applicationId: string, body: any, region: string): Segment {
    this.getApp(applicationId);
    const id = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
    const segment: Segment = {
      id,
      applicationId,
      arn: `arn:aws:mobiletargeting:${region}:${this.accountId}:apps/${applicationId}/segments/${id}`,
      name: body.Name ?? "Unnamed",
      segmentType: "DIMENSIONAL",
      creationDate: new Date().toISOString(),
      version: 1,
      dimensions: body.Dimensions,
    };
    this.segments.get(applicationId)!.set(id, segment);
    return segment;
  }

  getSegment(applicationId: string, segmentId: string): Segment {
    this.getApp(applicationId);
    const segment = this.segments.get(applicationId)?.get(segmentId);
    if (!segment) {
      throw new AwsError("NotFoundException", `Segment ${segmentId} not found.`, 404);
    }
    return segment;
  }

  getSegments(applicationId: string): Segment[] {
    this.getApp(applicationId);
    return Array.from(this.segments.get(applicationId)?.values() ?? []);
  }

  deleteSegment(applicationId: string, segmentId: string): Segment {
    const segment = this.getSegment(applicationId, segmentId);
    this.segments.get(applicationId)!.delete(segmentId);
    return segment;
  }

  createCampaign(applicationId: string, body: any, region: string): Campaign {
    this.getApp(applicationId);
    const id = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
    const campaign: Campaign = {
      id,
      applicationId,
      arn: `arn:aws:mobiletargeting:${region}:${this.accountId}:apps/${applicationId}/campaigns/${id}`,
      name: body.Name ?? "Unnamed",
      state: { CampaignStatus: "SCHEDULED" },
      creationDate: new Date().toISOString(),
      segmentId: body.SegmentId,
      segmentVersion: body.SegmentVersion,
      schedule: body.Schedule,
      messageConfiguration: body.MessageConfiguration,
    };
    this.campaigns.get(applicationId)!.set(id, campaign);
    return campaign;
  }

  getCampaign(applicationId: string, campaignId: string): Campaign {
    this.getApp(applicationId);
    const campaign = this.campaigns.get(applicationId)?.get(campaignId);
    if (!campaign) {
      throw new AwsError("NotFoundException", `Campaign ${campaignId} not found.`, 404);
    }
    return campaign;
  }

  getCampaigns(applicationId: string): Campaign[] {
    this.getApp(applicationId);
    return Array.from(this.campaigns.get(applicationId)?.values() ?? []);
  }

  deleteCampaign(applicationId: string, campaignId: string): Campaign {
    const campaign = this.getCampaign(applicationId, campaignId);
    this.campaigns.get(applicationId)!.delete(campaignId);
    return campaign;
  }

  sendMessages(applicationId: string, body: any): any {
    this.getApp(applicationId);
    const addresses = body.Addresses ?? {};
    const result: Record<string, any> = {};
    for (const address of Object.keys(addresses)) {
      result[address] = {
        DeliveryStatus: "SUCCESSFUL",
        MessageId: crypto.randomUUID(),
        StatusCode: 200,
        StatusMessage: "Message sent",
      };
    }
    return { ApplicationId: applicationId, RequestId: crypto.randomUUID(), Result: result };
  }

  updateEndpoint(applicationId: string, endpointId: string, body: any): void {
    this.getApp(applicationId);
    const endpoint: Endpoint = {
      id: endpointId,
      applicationId,
      channelType: body.ChannelType,
      address: body.Address,
      attributes: body.Attributes,
      demographic: body.Demographic,
      effectiveDate: body.EffectiveDate ?? new Date().toISOString(),
      endpointStatus: body.EndpointStatus ?? "ACTIVE",
      location: body.Location,
      user: body.User,
    };
    if (!this.endpoints.has(applicationId)) {
      this.endpoints.set(applicationId, new Map());
    }
    this.endpoints.get(applicationId)!.set(endpointId, endpoint);
  }

  getEndpoint(applicationId: string, endpointId: string): Endpoint {
    this.getApp(applicationId);
    const endpoint = this.endpoints.get(applicationId)?.get(endpointId);
    if (!endpoint) {
      throw new AwsError("NotFoundException", `Endpoint ${endpointId} not found.`, 404);
    }
    return endpoint;
  }

  deleteEndpoint(applicationId: string, endpointId: string): Endpoint {
    const endpoint = this.getEndpoint(applicationId, endpointId);
    this.endpoints.get(applicationId)!.delete(endpointId);
    return endpoint;
  }

  putEvents(applicationId: string, _body: any): any {
    this.getApp(applicationId);
    return { Results: {} };
  }
}
