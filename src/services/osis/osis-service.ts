import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface OsisPipeline {
  pipelineName: string;
  pipelineArn: string;
  status: string;
  minUnits: number;
  maxUnits: number;
  pipelineConfigurationBody: string;
  createdAt: string;
  lastUpdatedAt: string;
  ingestEndpointUrls: string[];
  tags: Record<string, string>;
}

export class OsisService {
  private pipelines: StorageBackend<string, OsisPipeline>;

  constructor(private accountId: string) {
    this.pipelines = new InMemoryStorage();
  }

  createPipeline(name: string, minUnits: number, maxUnits: number, config: string, region: string, tags?: Record<string, string>): OsisPipeline {
    if (this.pipelines.has(name)) throw new AwsError("ConflictException", `Pipeline ${name} already exists.`, 409);
    const pipeline: OsisPipeline = {
      pipelineName: name,
      pipelineArn: buildArn("osis", region, this.accountId, "pipeline/", name),
      status: "ACTIVE", minUnits: minUnits ?? 1, maxUnits: maxUnits ?? 4,
      pipelineConfigurationBody: config ?? "",
      createdAt: Math.floor(Date.now() / 1000), lastUpdatedAt: Math.floor(Date.now() / 1000),
      ingestEndpointUrls: [`${name}-${this.accountId}.${region}.osis.amazonaws.com`],
      tags: tags ?? {},
    };
    this.pipelines.set(name, pipeline);
    return pipeline;
  }

  getPipeline(name: string): OsisPipeline {
    const p = this.pipelines.get(name);
    if (!p) throw new AwsError("ResourceNotFoundException", `Pipeline ${name} not found.`, 404);
    return p;
  }

  listPipelines(): OsisPipeline[] { return this.pipelines.values(); }

  deletePipeline(name: string): void {
    if (!this.pipelines.has(name)) throw new AwsError("ResourceNotFoundException", `Pipeline ${name} not found.`, 404);
    this.pipelines.delete(name);
  }

  updatePipeline(name: string, minUnits?: number, maxUnits?: number, config?: string): OsisPipeline {
    const p = this.pipelines.get(name);
    if (!p) throw new AwsError("ResourceNotFoundException", `Pipeline ${name} not found.`, 404);
    if (minUnits !== undefined) p.minUnits = minUnits;
    if (maxUnits !== undefined) p.maxUnits = maxUnits;
    if (config !== undefined) p.pipelineConfigurationBody = config;
    p.lastUpdatedAt = Math.floor(Date.now() / 1000);
    this.pipelines.set(name, p);
    return p;
  }

  startPipeline(name: string): OsisPipeline {
    const p = this.pipelines.get(name);
    if (!p) throw new AwsError("ResourceNotFoundException", `Pipeline ${name} not found.`, 404);
    p.status = "ACTIVE";
    this.pipelines.set(name, p);
    return p;
  }

  stopPipeline(name: string): OsisPipeline {
    const p = this.pipelines.get(name);
    if (!p) throw new AwsError("ResourceNotFoundException", `Pipeline ${name} not found.`, 404);
    p.status = "STOPPED";
    this.pipelines.set(name, p);
    return p;
  }

  tagResource(arn: string, tags: Record<string, string>): void {
    const p = this.pipelines.values().find(p => p.pipelineArn === arn);
    if (!p) throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
    Object.assign(p.tags, tags);
    this.pipelines.set(p.pipelineName, p);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const p = this.pipelines.values().find(p => p.pipelineArn === arn);
    if (!p) throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
    for (const k of tagKeys) delete p.tags[k];
    this.pipelines.set(p.pipelineName, p);
  }

  listTagsForResource(arn: string): Record<string, string> {
    const p = this.pipelines.values().find(p => p.pipelineArn === arn);
    if (!p) throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
    return p.tags;
  }
}
