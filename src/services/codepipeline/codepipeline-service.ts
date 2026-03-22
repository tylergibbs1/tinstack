import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Pipeline {
  name: string;
  arn: string;
  roleArn: string;
  stages: any[];
  version: number;
  artifactStore?: any;
  artifactStores?: any;
  pipelineType?: string;
  created: number;
  updated: number;
}

export interface PipelineExecution {
  pipelineExecutionId: string;
  pipelineName: string;
  pipelineVersion: number;
  status: string;
  startTime: number;
  lastUpdateTime: number;
  artifactRevisions: any[];
}

export interface PipelineStageState {
  stageName: string;
  actionStates: {
    actionName: string;
    currentRevision?: any;
    latestExecution?: any;
  }[];
  latestExecution?: {
    pipelineExecutionId: string;
    status: string;
  };
}

export class CodePipelineService {
  private pipelines = new Map<string, Pipeline>();
  private executions = new Map<string, PipelineExecution[]>(); // pipelineKey -> executions
  private tags = new Map<string, Record<string, string>>();

  constructor(private accountId: string) {}

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createPipeline(params: any, region: string): Pipeline {
    const pipelineDef = params.pipeline;
    const name = pipelineDef.name;
    const key = this.regionKey(region, name);

    if (this.pipelines.has(key)) {
      throw new AwsError("PipelineNameInUseException", `Pipeline ${name} already exists.`, 400);
    }

    const pipeline: Pipeline = {
      name,
      arn: buildArn("codepipeline", region, this.accountId, "", name),
      roleArn: pipelineDef.roleArn,
      stages: pipelineDef.stages ?? [],
      version: 1,
      artifactStore: pipelineDef.artifactStore,
      artifactStores: pipelineDef.artifactStores,
      pipelineType: pipelineDef.pipelineType,
      created: Date.now() / 1000,
      updated: Date.now() / 1000,
    };

    this.pipelines.set(key, pipeline);
    this.executions.set(key, []);

    // Handle tags
    if (params.tags) {
      const tagMap: Record<string, string> = {};
      for (const t of params.tags) tagMap[t.key] = t.value;
      this.tags.set(pipeline.arn, tagMap);
    }

    return pipeline;
  }

  getPipeline(name: string, region: string): Pipeline {
    const key = this.regionKey(region, name);
    const pipeline = this.pipelines.get(key);
    if (!pipeline) throw new AwsError("PipelineNotFoundException", `Pipeline ${name} not found.`, 400);
    return pipeline;
  }

  listPipelines(region: string): { name: string; version: number; created: number; updated: number }[] {
    return Array.from(this.pipelines.entries())
      .filter(([k]) => k.startsWith(`${region}#`))
      .map(([, p]) => ({ name: p.name, version: p.version, created: p.created, updated: p.updated }));
  }

  updatePipeline(params: any, region: string): Pipeline {
    const pipelineDef = params.pipeline;
    const name = pipelineDef.name;
    const key = this.regionKey(region, name);
    const pipeline = this.pipelines.get(key);
    if (!pipeline) throw new AwsError("PipelineNotFoundException", `Pipeline ${name} not found.`, 400);

    if (pipelineDef.roleArn !== undefined) pipeline.roleArn = pipelineDef.roleArn;
    if (pipelineDef.stages !== undefined) pipeline.stages = pipelineDef.stages;
    if (pipelineDef.artifactStore !== undefined) pipeline.artifactStore = pipelineDef.artifactStore;
    pipeline.version++;
    pipeline.updated = Date.now() / 1000;

    return pipeline;
  }

  deletePipeline(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.pipelines.has(key)) {
      throw new AwsError("PipelineNotFoundException", `Pipeline ${name} not found.`, 400);
    }
    const pipeline = this.pipelines.get(key)!;
    this.pipelines.delete(key);
    this.executions.delete(key);
    this.tags.delete(pipeline.arn);
  }

  getPipelineState(name: string, region: string): { pipelineName: string; pipelineVersion: number; stageStates: PipelineStageState[] } {
    const pipeline = this.getPipeline(name, region);
    const stageStates: PipelineStageState[] = pipeline.stages.map((s: any) => ({
      stageName: s.name,
      actionStates: (s.actions ?? []).map((a: any) => ({ actionName: a.name })),
    }));
    return {
      pipelineName: pipeline.name,
      pipelineVersion: pipeline.version,
      stageStates,
    };
  }

  startPipelineExecution(name: string, region: string): PipelineExecution {
    const pipeline = this.getPipeline(name, region);
    const key = this.regionKey(region, name);
    const execId = crypto.randomUUID();
    const execution: PipelineExecution = {
      pipelineExecutionId: execId,
      pipelineName: name,
      pipelineVersion: pipeline.version,
      status: "InProgress",
      startTime: Date.now() / 1000,
      lastUpdateTime: Date.now() / 1000,
      artifactRevisions: [],
    };
    const execs = this.executions.get(key) ?? [];
    execs.push(execution);
    this.executions.set(key, execs);
    return execution;
  }

  listPipelineExecutions(name: string, region: string): PipelineExecution[] {
    this.getPipeline(name, region); // validate exists
    const key = this.regionKey(region, name);
    return this.executions.get(key) ?? [];
  }

  getPipelineExecution(name: string, executionId: string, region: string): PipelineExecution {
    this.getPipeline(name, region);
    const key = this.regionKey(region, name);
    const execs = this.executions.get(key) ?? [];
    const exec = execs.find((e) => e.pipelineExecutionId === executionId);
    if (!exec) throw new AwsError("PipelineExecutionNotFoundException", `Execution ${executionId} not found.`, 400);
    return exec;
  }

  putActionRevision(name: string, stageName: string, actionName: string, actionRevision: any, region: string): void {
    this.getPipeline(name, region); // validate exists
  }

  tagResource(arn: string, tags: { key: string; value: string }[]): void {
    const existing = this.tags.get(arn) ?? {};
    for (const t of tags) existing[t.key] = t.value;
    this.tags.set(arn, existing);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.tags.get(arn);
    if (existing) {
      for (const k of tagKeys) delete existing[k];
    }
  }

  listTagsForResource(arn: string): { key: string; value: string }[] {
    const existing = this.tags.get(arn) ?? {};
    return Object.entries(existing).map(([key, value]) => ({ key, value }));
  }
}
