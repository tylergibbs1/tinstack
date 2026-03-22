import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

interface VirtualCluster {
  id: string;
  name: string;
  arn: string;
  state: string;
  containerProvider: any;
  createdAt: number;
  tags: Record<string, string>;
}

interface ContainerJobRun {
  id: string;
  virtualClusterId: string;
  arn: string;
  name?: string;
  state: string;
  executionRoleArn: string;
  releaseLabel: string;
  jobDriver: any;
  createdAt: number;
  finishedAt?: number;
}

export class EmrContainersService {
  private clusters: StorageBackend<string, VirtualCluster>;
  private jobRuns: StorageBackend<string, ContainerJobRun>;

  constructor(private accountId: string) {
    this.clusters = new InMemoryStorage();
    this.jobRuns = new InMemoryStorage();
  }

  createVirtualCluster(name: string, containerProvider: any, tags: Record<string, string> | undefined, region: string): VirtualCluster {
    const id = crypto.randomUUID().slice(0, 16);
    const arn = buildArn("emr-containers", region, this.accountId, "/virtualclusters/", id);
    const vc: VirtualCluster = { id, name, arn, state: "RUNNING", containerProvider: containerProvider ?? { type: "EKS", id: "mock-eks-cluster" }, createdAt: Date.now() / 1000, tags: tags ?? {} };
    this.clusters.set(id, vc);
    return vc;
  }

  describeVirtualCluster(id: string): VirtualCluster {
    const vc = this.clusters.get(id);
    if (!vc) throw new AwsError("ResourceNotFoundException", `Virtual cluster ${id} not found.`, 404);
    return vc;
  }

  listVirtualClusters(): VirtualCluster[] { return this.clusters.values(); }

  deleteVirtualCluster(id: string): VirtualCluster {
    const vc = this.describeVirtualCluster(id);
    this.clusters.delete(id);
    vc.state = "TERMINATED";
    return vc;
  }

  startJobRun(virtualClusterId: string, name: string | undefined, executionRoleArn: string, releaseLabel: string, jobDriver: any, tags: Record<string, string> | undefined, region: string): ContainerJobRun {
    this.describeVirtualCluster(virtualClusterId);
    const id = crypto.randomUUID().slice(0, 16);
    const arn = buildArn("emr-containers", region, this.accountId, `/virtualclusters/${virtualClusterId}/jobruns/`, id);
    const now = Date.now() / 1000;
    const run: ContainerJobRun = { id, virtualClusterId, arn, name, state: "COMPLETED", executionRoleArn: executionRoleArn ?? "mock-role", releaseLabel: releaseLabel ?? "emr-6.9.0-latest", jobDriver: jobDriver ?? {}, createdAt: now, finishedAt: now };
    this.jobRuns.set(id, run);
    return run;
  }

  describeJobRun(virtualClusterId: string, jobRunId: string): ContainerJobRun {
    const run = this.jobRuns.get(jobRunId);
    if (!run || run.virtualClusterId !== virtualClusterId) throw new AwsError("ResourceNotFoundException", `Job run ${jobRunId} not found.`, 404);
    return run;
  }

  listJobRuns(virtualClusterId: string): ContainerJobRun[] {
    return this.jobRuns.values().filter((r) => r.virtualClusterId === virtualClusterId);
  }

  cancelJobRun(virtualClusterId: string, jobRunId: string): ContainerJobRun {
    const run = this.describeJobRun(virtualClusterId, jobRunId);
    run.state = "CANCELLED";
    return run;
  }

  tagResource(arn: string, tags: Record<string, string>): void {
    const vc = this.clusters.values().find((c) => c.arn === arn);
    if (vc) { Object.assign(vc.tags, tags); return; }
    throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const vc = this.clusters.values().find((c) => c.arn === arn);
    if (vc) { for (const k of tagKeys) delete vc.tags[k]; return; }
    throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
  }
}
