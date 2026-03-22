import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface Pipeline {
  pipelineId: string;
  name: string;
  description: string;
  uniqueId: string;
  tags: Record<string, string>;
  fields: any[];
  status: string;
  definition: any;
}

export class DataPipelineService {
  private pipelines: StorageBackend<string, Pipeline>;

  constructor(private accountId: string) {
    this.pipelines = new InMemoryStorage();
  }

  createPipeline(name: string, uniqueId: string, description?: string, tags?: Record<string, string>): string {
    const id = `df-${crypto.randomUUID().slice(0, 17).replace(/-/g, "").toUpperCase()}`;
    const pipeline: Pipeline = {
      pipelineId: id, name, description: description ?? "", uniqueId: uniqueId ?? id,
      tags: tags ?? {}, fields: [
        { key: "@pipelineState", stringValue: "PENDING" },
        { key: "name", stringValue: name },
        { key: "uniqueId", stringValue: uniqueId ?? id },
      ],
      status: "PENDING", definition: null,
    };
    this.pipelines.set(id, pipeline);
    return id;
  }

  listPipelines(): { id: string; name: string }[] {
    return this.pipelines.values().map(p => ({ id: p.pipelineId, name: p.name }));
  }

  describePipelines(pipelineIds: string[]): Pipeline[] {
    return pipelineIds.map(id => {
      const p = this.pipelines.get(id);
      if (!p) throw new AwsError("PipelineNotFoundException", `Pipeline ${id} not found.`, 400);
      return p;
    });
  }

  deletePipeline(pipelineId: string): void {
    if (!this.pipelines.has(pipelineId)) throw new AwsError("PipelineNotFoundException", `Pipeline ${pipelineId} not found.`, 400);
    this.pipelines.delete(pipelineId);
  }

  putPipelineDefinition(pipelineId: string, objects: any[]): { errored: boolean } {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) throw new AwsError("PipelineNotFoundException", `Pipeline ${pipelineId} not found.`, 400);
    pipeline.definition = objects;
    this.pipelines.set(pipelineId, pipeline);
    return { errored: false };
  }

  getPipelineDefinition(pipelineId: string): any[] {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) throw new AwsError("PipelineNotFoundException", `Pipeline ${pipelineId} not found.`, 400);
    return pipeline.definition ?? [];
  }

  activatePipeline(pipelineId: string): void {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) throw new AwsError("PipelineNotFoundException", `Pipeline ${pipelineId} not found.`, 400);
    pipeline.status = "SCHEDULED";
    this.pipelines.set(pipelineId, pipeline);
  }

  deactivatePipeline(pipelineId: string): void {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) throw new AwsError("PipelineNotFoundException", `Pipeline ${pipelineId} not found.`, 400);
    pipeline.status = "DEACTIVATING";
    this.pipelines.set(pipelineId, pipeline);
  }

  setStatus(pipelineId: string, objectIds: string[], status: string): void {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) throw new AwsError("PipelineNotFoundException", `Pipeline ${pipelineId} not found.`, 400);
    pipeline.status = status;
    this.pipelines.set(pipelineId, pipeline);
  }

  addTags(pipelineId: string, tags: { key: string; value: string }[]): void {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) throw new AwsError("PipelineNotFoundException", `Pipeline ${pipelineId} not found.`, 400);
    for (const t of tags) pipeline.tags[t.key] = t.value;
    this.pipelines.set(pipelineId, pipeline);
  }

  removeTags(pipelineId: string, tagKeys: string[]): void {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) throw new AwsError("PipelineNotFoundException", `Pipeline ${pipelineId} not found.`, 400);
    for (const k of tagKeys) delete pipeline.tags[k];
    this.pipelines.set(pipelineId, pipeline);
  }

  listTags(pipelineId: string): { key: string; value: string }[] {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) throw new AwsError("PipelineNotFoundException", `Pipeline ${pipelineId} not found.`, 400);
    return Object.entries(pipeline.tags).map(([key, value]) => ({ key, value }));
  }
}
