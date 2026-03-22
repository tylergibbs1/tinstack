import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SageMakerService } from "./sagemaker-service";

export class SageMakerHandler {
  constructor(private service: SageMakerService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        // Notebook Instances
        case "CreateNotebookInstance": return this.createNotebookInstance(body, ctx);
        case "DescribeNotebookInstance": return this.describeNotebookInstance(body, ctx);
        case "ListNotebookInstances": return this.listNotebookInstances(body, ctx);
        case "DeleteNotebookInstance": return this.deleteNotebookInstance(body, ctx);
        case "StartNotebookInstance": return this.startNotebookInstance(body, ctx);
        case "StopNotebookInstance": return this.stopNotebookInstance(body, ctx);
        // Training Jobs
        case "CreateTrainingJob": return this.createTrainingJob(body, ctx);
        case "DescribeTrainingJob": return this.describeTrainingJob(body, ctx);
        case "ListTrainingJobs": return this.listTrainingJobs(body, ctx);
        // Models
        case "CreateModel": return this.createModel(body, ctx);
        case "DescribeModel": return this.describeModel(body, ctx);
        case "ListModels": return this.listModels(body, ctx);
        case "DeleteModel": return this.deleteModel(body, ctx);
        // Endpoints
        case "CreateEndpoint": return this.createEndpoint(body, ctx);
        case "DescribeEndpoint": return this.describeEndpoint(body, ctx);
        case "ListEndpoints": return this.listEndpoints(body, ctx);
        case "DeleteEndpoint": return this.deleteEndpoint(body, ctx);
        // Tags
        case "AddTags": return this.addTags(body, ctx);
        case "ListTags": return this.listTags(body, ctx);
        case "DeleteTags": return this.deleteTags(body, ctx);
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }

  // --- Notebook Instances ---

  private createNotebookInstance(body: any, ctx: RequestContext): Response {
    const nb = this.service.createNotebookInstance(
      body.NotebookInstanceName, body.InstanceType, body.RoleArn, ctx.region,
    );
    return this.json({ NotebookInstanceArn: nb.notebookInstanceArn }, ctx);
  }

  private describeNotebookInstance(body: any, ctx: RequestContext): Response {
    const nb = this.service.describeNotebookInstance(body.NotebookInstanceName);
    return this.json({
      NotebookInstanceName: nb.notebookInstanceName,
      NotebookInstanceArn: nb.notebookInstanceArn,
      NotebookInstanceStatus: nb.notebookInstanceStatus,
      InstanceType: nb.instanceType,
      RoleArn: nb.roleArn,
      Url: nb.url,
      CreationTime: nb.creationTime / 1000,
      LastModifiedTime: nb.lastModifiedTime / 1000,
    }, ctx);
  }

  private listNotebookInstances(_body: any, ctx: RequestContext): Response {
    const nbs = this.service.listNotebookInstances();
    return this.json({
      NotebookInstances: nbs.map((nb) => ({
        NotebookInstanceName: nb.notebookInstanceName,
        NotebookInstanceArn: nb.notebookInstanceArn,
        NotebookInstanceStatus: nb.notebookInstanceStatus,
        InstanceType: nb.instanceType,
        CreationTime: nb.creationTime / 1000,
        LastModifiedTime: nb.lastModifiedTime / 1000,
      })),
    }, ctx);
  }

  private deleteNotebookInstance(body: any, ctx: RequestContext): Response {
    this.service.deleteNotebookInstance(body.NotebookInstanceName);
    return this.json({}, ctx);
  }

  private startNotebookInstance(body: any, ctx: RequestContext): Response {
    this.service.startNotebookInstance(body.NotebookInstanceName);
    return this.json({}, ctx);
  }

  private stopNotebookInstance(body: any, ctx: RequestContext): Response {
    this.service.stopNotebookInstance(body.NotebookInstanceName);
    return this.json({}, ctx);
  }

  // --- Training Jobs ---

  private createTrainingJob(body: any, ctx: RequestContext): Response {
    const job = this.service.createTrainingJob(
      body.TrainingJobName, body.AlgorithmSpecification, body.RoleArn,
      body.InputDataConfig, body.OutputDataConfig,
      body.ResourceConfig, body.StoppingCondition, ctx.region,
    );
    return this.json({ TrainingJobArn: job.trainingJobArn }, ctx);
  }

  private describeTrainingJob(body: any, ctx: RequestContext): Response {
    const job = this.service.describeTrainingJob(body.TrainingJobName);
    return this.json({
      TrainingJobName: job.trainingJobName,
      TrainingJobArn: job.trainingJobArn,
      TrainingJobStatus: job.trainingJobStatus,
      SecondaryStatus: job.secondaryStatus,
      AlgorithmSpecification: job.algorithmSpecification,
      RoleArn: job.roleArn,
      InputDataConfig: job.inputDataConfig,
      OutputDataConfig: job.outputDataConfig,
      ResourceConfig: job.resourceConfig,
      StoppingCondition: job.stoppingCondition,
      CreationTime: job.creationTime / 1000,
      LastModifiedTime: job.lastModifiedTime / 1000,
      TrainingStartTime: job.trainingStartTime ? job.trainingStartTime / 1000 : undefined,
      TrainingEndTime: job.trainingEndTime ? job.trainingEndTime / 1000 : undefined,
    }, ctx);
  }

  private listTrainingJobs(_body: any, ctx: RequestContext): Response {
    const jobs = this.service.listTrainingJobs();
    return this.json({
      TrainingJobSummaries: jobs.map((j) => ({
        TrainingJobName: j.trainingJobName,
        TrainingJobArn: j.trainingJobArn,
        TrainingJobStatus: j.trainingJobStatus,
        CreationTime: j.creationTime / 1000,
        LastModifiedTime: j.lastModifiedTime / 1000,
      })),
    }, ctx);
  }

  // --- Models ---

  private createModel(body: any, ctx: RequestContext): Response {
    const model = this.service.createModel(
      body.ModelName, body.PrimaryContainer, body.ExecutionRoleArn, ctx.region,
    );
    return this.json({ ModelArn: model.modelArn }, ctx);
  }

  private describeModel(body: any, ctx: RequestContext): Response {
    const model = this.service.describeModel(body.ModelName);
    return this.json({
      ModelName: model.modelName,
      ModelArn: model.modelArn,
      PrimaryContainer: model.primaryContainer,
      ExecutionRoleArn: model.executionRoleArn,
      CreationTime: model.creationTime / 1000,
    }, ctx);
  }

  private listModels(_body: any, ctx: RequestContext): Response {
    const models = this.service.listModels();
    return this.json({
      Models: models.map((m) => ({
        ModelName: m.modelName,
        ModelArn: m.modelArn,
        CreationTime: m.creationTime / 1000,
      })),
    }, ctx);
  }

  private deleteModel(body: any, ctx: RequestContext): Response {
    this.service.deleteModel(body.ModelName);
    return this.json({}, ctx);
  }

  // --- Endpoints ---

  private createEndpoint(body: any, ctx: RequestContext): Response {
    const ep = this.service.createEndpoint(body.EndpointName, body.EndpointConfigName, ctx.region);
    return this.json({ EndpointArn: ep.endpointArn }, ctx);
  }

  private describeEndpoint(body: any, ctx: RequestContext): Response {
    const ep = this.service.describeEndpoint(body.EndpointName);
    return this.json({
      EndpointName: ep.endpointName,
      EndpointArn: ep.endpointArn,
      EndpointConfigName: ep.endpointConfigName,
      EndpointStatus: ep.endpointStatus,
      CreationTime: ep.creationTime / 1000,
      LastModifiedTime: ep.lastModifiedTime / 1000,
    }, ctx);
  }

  private listEndpoints(_body: any, ctx: RequestContext): Response {
    const eps = this.service.listEndpoints();
    return this.json({
      Endpoints: eps.map((ep) => ({
        EndpointName: ep.endpointName,
        EndpointArn: ep.endpointArn,
        EndpointStatus: ep.endpointStatus,
        CreationTime: ep.creationTime / 1000,
        LastModifiedTime: ep.lastModifiedTime / 1000,
      })),
    }, ctx);
  }

  private deleteEndpoint(body: any, ctx: RequestContext): Response {
    this.service.deleteEndpoint(body.EndpointName);
    return this.json({}, ctx);
  }

  // --- Tags ---

  private addTags(body: any, ctx: RequestContext): Response {
    this.service.addTags(body.ResourceArn, body.Tags ?? []);
    return this.json({ Tags: body.Tags ?? [] }, ctx);
  }

  private listTags(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTags(body.ResourceArn);
    return this.json({ Tags: tags }, ctx);
  }

  private deleteTags(body: any, ctx: RequestContext): Response {
    this.service.deleteTags(body.ResourceArn, body.TagKeys ?? []);
    return this.json({}, ctx);
  }
}
