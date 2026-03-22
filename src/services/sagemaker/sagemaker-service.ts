import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface NotebookInstance {
  notebookInstanceName: string;
  notebookInstanceArn: string;
  notebookInstanceStatus: string;
  instanceType: string;
  roleArn: string;
  url: string;
  creationTime: number;
  lastModifiedTime: number;
}

export interface TrainingJob {
  trainingJobName: string;
  trainingJobArn: string;
  trainingJobStatus: string;
  secondaryStatus: string;
  algorithmSpecification: Record<string, any>;
  roleArn: string;
  inputDataConfig?: any[];
  outputDataConfig?: Record<string, any>;
  resourceConfig: Record<string, any>;
  stoppingCondition: Record<string, any>;
  creationTime: number;
  lastModifiedTime: number;
  trainingStartTime?: number;
  trainingEndTime?: number;
}

export interface SageMakerModel {
  modelName: string;
  modelArn: string;
  primaryContainer?: Record<string, any>;
  executionRoleArn: string;
  creationTime: number;
}

export interface SageMakerEndpoint {
  endpointName: string;
  endpointArn: string;
  endpointConfigName: string;
  endpointStatus: string;
  creationTime: number;
  lastModifiedTime: number;
}

type TagList = { Key: string; Value: string }[];

export class SageMakerService {
  private notebooks: StorageBackend<string, NotebookInstance>;
  private trainingJobs: StorageBackend<string, TrainingJob>;
  private models: StorageBackend<string, SageMakerModel>;
  private endpoints: StorageBackend<string, SageMakerEndpoint>;
  private tags = new Map<string, TagList>();

  constructor(private accountId: string) {
    this.notebooks = new InMemoryStorage();
    this.trainingJobs = new InMemoryStorage();
    this.models = new InMemoryStorage();
    this.endpoints = new InMemoryStorage();
  }

  // --- Notebook Instances ---

  createNotebookInstance(name: string, instanceType: string, roleArn: string, region: string): NotebookInstance {
    if (this.notebooks.get(name)) {
      throw new AwsError("ValidationException", `Notebook instance ${name} already exists.`, 400);
    }
    const arn = buildArn("sagemaker", region, this.accountId, "notebook-instance/", name);
    const now = Date.now();
    const nb: NotebookInstance = {
      notebookInstanceName: name,
      notebookInstanceArn: arn,
      notebookInstanceStatus: "InService",
      instanceType: instanceType ?? "ml.t2.medium",
      roleArn: roleArn ?? buildArn("iam", "", this.accountId, "role/", "SageMakerRole"),
      url: `${name}.notebook.${region}.sagemaker.aws`,
      creationTime: now,
      lastModifiedTime: now,
    };
    this.notebooks.set(name, nb);
    return nb;
  }

  describeNotebookInstance(name: string): NotebookInstance {
    const nb = this.notebooks.get(name);
    if (!nb) throw new AwsError("ValidationException", `Notebook instance ${name} not found.`, 400);
    return nb;
  }

  listNotebookInstances(): NotebookInstance[] {
    return this.notebooks.values();
  }

  deleteNotebookInstance(name: string): void {
    const nb = this.notebooks.get(name);
    if (!nb) throw new AwsError("ValidationException", `Notebook instance ${name} not found.`, 400);
    if (nb.notebookInstanceStatus !== "Stopped") {
      throw new AwsError("ValidationException", `Notebook instance ${name} must be stopped before deletion.`, 400);
    }
    this.notebooks.delete(name);
  }

  startNotebookInstance(name: string): void {
    const nb = this.notebooks.get(name);
    if (!nb) throw new AwsError("ValidationException", `Notebook instance ${name} not found.`, 400);
    nb.notebookInstanceStatus = "InService";
    nb.lastModifiedTime = Date.now();
    this.notebooks.set(name, nb);
  }

  stopNotebookInstance(name: string): void {
    const nb = this.notebooks.get(name);
    if (!nb) throw new AwsError("ValidationException", `Notebook instance ${name} not found.`, 400);
    nb.notebookInstanceStatus = "Stopped";
    nb.lastModifiedTime = Date.now();
    this.notebooks.set(name, nb);
  }

  // --- Training Jobs ---

  createTrainingJob(
    name: string,
    algorithmSpecification: Record<string, any>,
    roleArn: string,
    inputDataConfig: any[] | undefined,
    outputDataConfig: Record<string, any> | undefined,
    resourceConfig: Record<string, any> | undefined,
    stoppingCondition: Record<string, any> | undefined,
    region: string,
  ): TrainingJob {
    if (this.trainingJobs.get(name)) {
      throw new AwsError("ValidationException", `Training job ${name} already exists.`, 400);
    }
    const arn = buildArn("sagemaker", region, this.accountId, "training-job/", name);
    const now = Date.now();
    const job: TrainingJob = {
      trainingJobName: name,
      trainingJobArn: arn,
      trainingJobStatus: "Completed",
      secondaryStatus: "Completed",
      algorithmSpecification: algorithmSpecification ?? {},
      roleArn: roleArn ?? buildArn("iam", "", this.accountId, "role/", "SageMakerRole"),
      inputDataConfig,
      outputDataConfig,
      resourceConfig: resourceConfig ?? { InstanceType: "ml.m4.xlarge", InstanceCount: 1, VolumeSizeInGB: 30 },
      stoppingCondition: stoppingCondition ?? { MaxRuntimeInSeconds: 86400 },
      creationTime: now,
      lastModifiedTime: now,
      trainingStartTime: now,
      trainingEndTime: now,
    };
    this.trainingJobs.set(name, job);
    return job;
  }

  describeTrainingJob(name: string): TrainingJob {
    const job = this.trainingJobs.get(name);
    if (!job) throw new AwsError("ValidationException", `Training job ${name} not found.`, 400);
    return job;
  }

  listTrainingJobs(): TrainingJob[] {
    return this.trainingJobs.values();
  }

  // --- Models ---

  createModel(name: string, primaryContainer: Record<string, any> | undefined, executionRoleArn: string, region: string): SageMakerModel {
    if (this.models.get(name)) {
      throw new AwsError("ValidationException", `Model ${name} already exists.`, 400);
    }
    const arn = buildArn("sagemaker", region, this.accountId, "model/", name);
    const model: SageMakerModel = {
      modelName: name,
      modelArn: arn,
      primaryContainer,
      executionRoleArn: executionRoleArn ?? buildArn("iam", "", this.accountId, "role/", "SageMakerRole"),
      creationTime: Date.now(),
    };
    this.models.set(name, model);
    return model;
  }

  describeModel(name: string): SageMakerModel {
    const model = this.models.get(name);
    if (!model) throw new AwsError("ValidationException", `Model ${name} not found.`, 400);
    return model;
  }

  listModels(): SageMakerModel[] {
    return this.models.values();
  }

  deleteModel(name: string): void {
    if (!this.models.get(name)) throw new AwsError("ValidationException", `Model ${name} not found.`, 400);
    this.models.delete(name);
  }

  // --- Endpoints ---

  createEndpoint(name: string, endpointConfigName: string, region: string): SageMakerEndpoint {
    if (this.endpoints.get(name)) {
      throw new AwsError("ValidationException", `Endpoint ${name} already exists.`, 400);
    }
    const arn = buildArn("sagemaker", region, this.accountId, "endpoint/", name);
    const now = Date.now();
    const ep: SageMakerEndpoint = {
      endpointName: name,
      endpointArn: arn,
      endpointConfigName: endpointConfigName ?? "default",
      endpointStatus: "InService",
      creationTime: now,
      lastModifiedTime: now,
    };
    this.endpoints.set(name, ep);
    return ep;
  }

  describeEndpoint(name: string): SageMakerEndpoint {
    const ep = this.endpoints.get(name);
    if (!ep) throw new AwsError("ValidationException", `Endpoint ${name} not found.`, 400);
    return ep;
  }

  listEndpoints(): SageMakerEndpoint[] {
    return this.endpoints.values();
  }

  deleteEndpoint(name: string): void {
    if (!this.endpoints.get(name)) throw new AwsError("ValidationException", `Endpoint ${name} not found.`, 400);
    this.endpoints.delete(name);
  }

  // --- Tags ---

  addTags(arn: string, tags: TagList): void {
    const existing = this.tags.get(arn) ?? [];
    const map = new Map(existing.map((t) => [t.Key, t.Value]));
    for (const t of tags) map.set(t.Key, t.Value);
    this.tags.set(arn, Array.from(map.entries()).map(([Key, Value]) => ({ Key, Value })));
  }

  listTags(arn: string): TagList {
    return this.tags.get(arn) ?? [];
  }

  deleteTags(arn: string, tagKeys: string[]): void {
    const existing = this.tags.get(arn) ?? [];
    this.tags.set(arn, existing.filter((t) => !tagKeys.includes(t.Key)));
  }
}
