import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface DatasetGroup { datasetGroupArn: string; name: string; status: string; creationDateTime: number; }
export interface Solution { solutionArn: string; name: string; datasetGroupArn: string; status: string; }
export interface Campaign { campaignArn: string; name: string; solutionVersionArn: string; status: string; }

export class PersonalizeService {
  private datasetGroups: StorageBackend<string, DatasetGroup>;
  private solutions: StorageBackend<string, Solution>;
  private campaigns: StorageBackend<string, Campaign>;

  constructor(private accountId: string) {
    this.datasetGroups = new InMemoryStorage();
    this.solutions = new InMemoryStorage();
    this.campaigns = new InMemoryStorage();
  }

  createDatasetGroup(name: string): DatasetGroup {
    const arn = `arn:aws:personalize:us-east-1:${this.accountId}:dataset-group/${name}`;
    const dg: DatasetGroup = { datasetGroupArn: arn, name, status: "ACTIVE", creationDateTime: Date.now() / 1000 };
    this.datasetGroups.set(arn, dg);
    return dg;
  }

  describeDatasetGroup(arn: string): DatasetGroup {
    const dg = this.datasetGroups.get(arn);
    if (!dg) throw new AwsError("ResourceNotFoundException", `Dataset group ${arn} not found`, 404);
    return dg;
  }

  listDatasetGroups(): DatasetGroup[] { return this.datasetGroups.values(); }

  deleteDatasetGroup(arn: string): void {
    if (!this.datasetGroups.has(arn)) throw new AwsError("ResourceNotFoundException", `Dataset group ${arn} not found`, 404);
    this.datasetGroups.delete(arn);
  }

  createSolution(name: string, datasetGroupArn: string): Solution {
    const arn = `arn:aws:personalize:us-east-1:${this.accountId}:solution/${name}`;
    const sol: Solution = { solutionArn: arn, name, datasetGroupArn, status: "ACTIVE" };
    this.solutions.set(arn, sol);
    return sol;
  }

  describeSolution(arn: string): Solution {
    const sol = this.solutions.get(arn);
    if (!sol) throw new AwsError("ResourceNotFoundException", `Solution ${arn} not found`, 404);
    return sol;
  }

  listSolutions(): Solution[] { return this.solutions.values(); }

  createCampaign(name: string, solutionVersionArn: string): Campaign {
    const arn = `arn:aws:personalize:us-east-1:${this.accountId}:campaign/${name}`;
    const c: Campaign = { campaignArn: arn, name, solutionVersionArn, status: "ACTIVE" };
    this.campaigns.set(arn, c);
    return c;
  }
}
