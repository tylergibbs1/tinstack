import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export type PipeState = "CREATING" | "RUNNING" | "STARTING" | "STOPPING" | "STOPPED" | "DELETING";

export interface Pipe {
  name: string;
  arn: string;
  source: string;
  target: string;
  roleArn: string;
  description?: string;
  desiredState: string;
  currentState: PipeState;
  sourceParameters?: Record<string, any>;
  enrichment?: string;
  enrichmentParameters?: Record<string, any>;
  targetParameters?: Record<string, any>;
  tags: Record<string, string>;
  creationTime: number;
  lastModifiedTime: number;
}

export class PipesService {
  private pipes: StorageBackend<string, Pipe>;

  constructor(
    private accountId: string,
    private region: string,
  ) {
    this.pipes = new InMemoryStorage();
  }

  createPipe(params: {
    name: string;
    source: string;
    target: string;
    roleArn: string;
    description?: string;
    desiredState?: string;
    sourceParameters?: Record<string, any>;
    enrichment?: string;
    enrichmentParameters?: Record<string, any>;
    targetParameters?: Record<string, any>;
    tags?: Record<string, string>;
  }): Pipe {
    if (this.pipes.has(params.name)) {
      throw new AwsError("ConflictException", `Pipe ${params.name} already exists.`, 409);
    }

    const now = Math.floor(Date.now() / 1000);
    const pipe: Pipe = {
      name: params.name,
      arn: `arn:aws:pipes:${this.region}:${this.accountId}:pipe/${params.name}`,
      source: params.source,
      target: params.target,
      roleArn: params.roleArn,
      description: params.description,
      desiredState: params.desiredState ?? "RUNNING",
      currentState: "RUNNING",
      sourceParameters: params.sourceParameters,
      enrichment: params.enrichment,
      enrichmentParameters: params.enrichmentParameters,
      targetParameters: params.targetParameters,
      tags: params.tags ?? {},
      creationTime: now,
      lastModifiedTime: now,
    };

    this.pipes.set(params.name, pipe);
    return pipe;
  }

  describePipe(name: string): Pipe {
    const pipe = this.pipes.get(name);
    if (!pipe) throw new AwsError("NotFoundException", `Pipe ${name} not found.`, 404);
    return pipe;
  }

  listPipes(namePrefix?: string): Pipe[] {
    let pipes = this.pipes.values();
    if (namePrefix) {
      pipes = pipes.filter((p) => p.name.startsWith(namePrefix));
    }
    return pipes.sort((a, b) => a.name.localeCompare(b.name));
  }

  updatePipe(name: string, updates: {
    target?: string;
    roleArn?: string;
    description?: string;
    desiredState?: string;
    sourceParameters?: Record<string, any>;
    enrichment?: string;
    enrichmentParameters?: Record<string, any>;
    targetParameters?: Record<string, any>;
  }): Pipe {
    const pipe = this.describePipe(name);
    if (updates.target !== undefined) pipe.target = updates.target;
    if (updates.roleArn !== undefined) pipe.roleArn = updates.roleArn;
    if (updates.description !== undefined) pipe.description = updates.description;
    if (updates.desiredState !== undefined) pipe.desiredState = updates.desiredState;
    if (updates.sourceParameters !== undefined) pipe.sourceParameters = updates.sourceParameters;
    if (updates.enrichment !== undefined) pipe.enrichment = updates.enrichment;
    if (updates.enrichmentParameters !== undefined) pipe.enrichmentParameters = updates.enrichmentParameters;
    if (updates.targetParameters !== undefined) pipe.targetParameters = updates.targetParameters;
    pipe.lastModifiedTime = Math.floor(Date.now() / 1000);
    this.pipes.set(name, pipe);
    return pipe;
  }

  deletePipe(name: string): Pipe {
    const pipe = this.describePipe(name);
    this.pipes.delete(name);
    pipe.currentState = "DELETING";
    return pipe;
  }

  startPipe(name: string): Pipe {
    const pipe = this.describePipe(name);
    pipe.desiredState = "RUNNING";
    if (pipe.currentState === "STOPPED") {
      pipe.currentState = "STARTING";
    }
    pipe.lastModifiedTime = Math.floor(Date.now() / 1000);
    this.pipes.set(name, pipe);
    return pipe;
  }

  stopPipe(name: string): Pipe {
    const pipe = this.describePipe(name);
    pipe.desiredState = "STOPPED";
    if (pipe.currentState === "RUNNING") {
      pipe.currentState = "STOPPING";
    }
    pipe.lastModifiedTime = Math.floor(Date.now() / 1000);
    this.pipes.set(name, pipe);
    return pipe;
  }

  // --- Tags ---

  tagResource(arn: string, tags: Record<string, string>): void {
    const pipe = this.findByArn(arn);
    Object.assign(pipe.tags, tags);
    this.pipes.set(pipe.name, pipe);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const pipe = this.findByArn(arn);
    for (const key of tagKeys) delete pipe.tags[key];
    this.pipes.set(pipe.name, pipe);
  }

  listTagsForResource(arn: string): Record<string, string> {
    return this.findByArn(arn).tags;
  }

  private findByArn(arn: string): Pipe {
    const pipe = this.pipes.values().find((p) => p.arn === arn);
    if (!pipe) throw new AwsError("NotFoundException", `Resource ${arn} not found.`, 404);
    return pipe;
  }
}
