import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface ConnectCampaign {
  id: string; arn: string; name: string; connectInstanceId: string; status: string;
}

export class ConnectCampaignsService {
  private campaigns: StorageBackend<string, ConnectCampaign>;

  constructor(private accountId: string) {
    this.campaigns = new InMemoryStorage();
  }

  createCampaign(name: string, connectInstanceId: string): ConnectCampaign {
    const id = crypto.randomUUID();
    const c: ConnectCampaign = { id, arn: `arn:aws:connect-campaigns:us-east-1:${this.accountId}:campaign/${id}`, name, connectInstanceId, status: "STOPPED" };
    this.campaigns.set(id, c);
    return c;
  }

  getCampaign(id: string): ConnectCampaign {
    const c = this.campaigns.get(id);
    if (!c) throw new AwsError("ResourceNotFoundException", `Campaign ${id} not found`, 404);
    return c;
  }

  listCampaigns(): ConnectCampaign[] { return this.campaigns.values(); }

  deleteCampaign(id: string): void {
    if (!this.campaigns.has(id)) throw new AwsError("ResourceNotFoundException", `Campaign ${id} not found`, 404);
    this.campaigns.delete(id);
  }

  startCampaign(id: string): void {
    const c = this.getCampaign(id);
    c.status = "RUNNING";
  }

  stopCampaign(id: string): void {
    const c = this.getCampaign(id);
    c.status = "STOPPED";
  }
}
