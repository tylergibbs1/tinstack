import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SageMakerClient,
  CreateNotebookInstanceCommand,
  DescribeNotebookInstanceCommand,
  ListNotebookInstancesCommand,
  StopNotebookInstanceCommand,
  StartNotebookInstanceCommand,
  DeleteNotebookInstanceCommand,
  CreateTrainingJobCommand,
  DescribeTrainingJobCommand,
  ListTrainingJobsCommand,
  CreateModelCommand,
  DescribeModelCommand,
  ListModelsCommand,
  DeleteModelCommand,
  CreateEndpointCommand,
  DescribeEndpointCommand,
  ListEndpointsCommand,
  DeleteEndpointCommand,
  AddTagsCommand,
  ListTagsCommand,
  DeleteTagsCommand,
} from "@aws-sdk/client-sagemaker";
import { startServer, stopServer, clientConfig } from "./helpers";

const sm = new SageMakerClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SageMaker", () => {
  let notebookArn: string;
  let trainingJobArn: string;
  let modelArn: string;
  let endpointArn: string;

  // --- Notebook Instances ---

  test("CreateNotebookInstance", async () => {
    const res = await sm.send(new CreateNotebookInstanceCommand({
      NotebookInstanceName: "test-notebook",
      InstanceType: "ml.t2.medium",
      RoleArn: "arn:aws:iam::123456789012:role/SageMakerRole",
    }));
    expect(res.NotebookInstanceArn).toBeDefined();
    expect(res.NotebookInstanceArn).toContain("notebook-instance/test-notebook");
    notebookArn = res.NotebookInstanceArn!;
  });

  test("DescribeNotebookInstance", async () => {
    const res = await sm.send(new DescribeNotebookInstanceCommand({
      NotebookInstanceName: "test-notebook",
    }));
    expect(res.NotebookInstanceName).toBe("test-notebook");
    expect(res.NotebookInstanceStatus).toBe("InService");
    expect(res.InstanceType).toBe("ml.t2.medium");
  });

  test("ListNotebookInstances", async () => {
    const res = await sm.send(new ListNotebookInstancesCommand({}));
    expect(res.NotebookInstances!.length).toBeGreaterThanOrEqual(1);
  });

  test("StopNotebookInstance", async () => {
    await sm.send(new StopNotebookInstanceCommand({
      NotebookInstanceName: "test-notebook",
    }));
    const res = await sm.send(new DescribeNotebookInstanceCommand({
      NotebookInstanceName: "test-notebook",
    }));
    expect(res.NotebookInstanceStatus).toBe("Stopped");
  });

  test("StartNotebookInstance", async () => {
    await sm.send(new StartNotebookInstanceCommand({
      NotebookInstanceName: "test-notebook",
    }));
    const res = await sm.send(new DescribeNotebookInstanceCommand({
      NotebookInstanceName: "test-notebook",
    }));
    expect(res.NotebookInstanceStatus).toBe("InService");
  });

  test("DeleteNotebookInstance - must stop first", async () => {
    await sm.send(new StopNotebookInstanceCommand({
      NotebookInstanceName: "test-notebook",
    }));
    await sm.send(new DeleteNotebookInstanceCommand({
      NotebookInstanceName: "test-notebook",
    }));
    const res = await sm.send(new ListNotebookInstancesCommand({}));
    const found = res.NotebookInstances!.find((n) => n.NotebookInstanceName === "test-notebook");
    expect(found).toBeUndefined();
  });

  // --- Training Jobs ---

  test("CreateTrainingJob", async () => {
    const res = await sm.send(new CreateTrainingJobCommand({
      TrainingJobName: "test-training",
      AlgorithmSpecification: {
        TrainingImage: "123456789012.dkr.ecr.us-east-1.amazonaws.com/my-algo:latest",
        TrainingInputMode: "File",
      },
      RoleArn: "arn:aws:iam::123456789012:role/SageMakerRole",
      OutputDataConfig: {
        S3OutputPath: "s3://my-bucket/output",
      },
      ResourceConfig: {
        InstanceType: "ml.m4.xlarge",
        InstanceCount: 1,
        VolumeSizeInGB: 50,
      },
      StoppingCondition: {
        MaxRuntimeInSeconds: 3600,
      },
    }));
    expect(res.TrainingJobArn).toBeDefined();
    expect(res.TrainingJobArn).toContain("training-job/test-training");
    trainingJobArn = res.TrainingJobArn!;
  });

  test("DescribeTrainingJob", async () => {
    const res = await sm.send(new DescribeTrainingJobCommand({
      TrainingJobName: "test-training",
    }));
    expect(res.TrainingJobName).toBe("test-training");
    expect(res.TrainingJobStatus).toBe("Completed");
  });

  test("ListTrainingJobs", async () => {
    const res = await sm.send(new ListTrainingJobsCommand({}));
    expect(res.TrainingJobSummaries!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Models ---

  test("CreateModel", async () => {
    const res = await sm.send(new CreateModelCommand({
      ModelName: "test-model",
      PrimaryContainer: {
        Image: "123456789012.dkr.ecr.us-east-1.amazonaws.com/my-model:latest",
        ModelDataUrl: "s3://my-bucket/model.tar.gz",
      },
      ExecutionRoleArn: "arn:aws:iam::123456789012:role/SageMakerRole",
    }));
    expect(res.ModelArn).toBeDefined();
    expect(res.ModelArn).toContain("model/test-model");
    modelArn = res.ModelArn!;
  });

  test("DescribeModel", async () => {
    const res = await sm.send(new DescribeModelCommand({
      ModelName: "test-model",
    }));
    expect(res.ModelName).toBe("test-model");
    expect(res.PrimaryContainer).toBeDefined();
  });

  test("ListModels", async () => {
    const res = await sm.send(new ListModelsCommand({}));
    expect(res.Models!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteModel", async () => {
    await sm.send(new DeleteModelCommand({ ModelName: "test-model" }));
    const res = await sm.send(new ListModelsCommand({}));
    const found = res.Models!.find((m) => m.ModelName === "test-model");
    expect(found).toBeUndefined();
  });

  // --- Endpoints ---

  test("CreateEndpoint", async () => {
    const res = await sm.send(new CreateEndpointCommand({
      EndpointName: "test-endpoint",
      EndpointConfigName: "test-config",
    }));
    expect(res.EndpointArn).toBeDefined();
    expect(res.EndpointArn).toContain("endpoint/test-endpoint");
    endpointArn = res.EndpointArn!;
  });

  test("DescribeEndpoint", async () => {
    const res = await sm.send(new DescribeEndpointCommand({
      EndpointName: "test-endpoint",
    }));
    expect(res.EndpointName).toBe("test-endpoint");
    expect(res.EndpointStatus).toBe("InService");
  });

  test("ListEndpoints", async () => {
    const res = await sm.send(new ListEndpointsCommand({}));
    expect(res.Endpoints!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteEndpoint", async () => {
    await sm.send(new DeleteEndpointCommand({ EndpointName: "test-endpoint" }));
    const res = await sm.send(new ListEndpointsCommand({}));
    const found = res.Endpoints!.find((e) => e.EndpointName === "test-endpoint");
    expect(found).toBeUndefined();
  });

  // --- Tags ---

  test("AddTags", async () => {
    // Create a new model for tagging
    const model = await sm.send(new CreateModelCommand({
      ModelName: "tag-test-model",
      ExecutionRoleArn: "arn:aws:iam::123456789012:role/SageMakerRole",
    }));
    const arn = model.ModelArn!;

    await sm.send(new AddTagsCommand({
      ResourceArn: arn,
      Tags: [{ Key: "env", Value: "test" }, { Key: "team", Value: "ml" }],
    }));

    const tags = await sm.send(new ListTagsCommand({ ResourceArn: arn }));
    expect(tags.Tags!.length).toBe(2);
    expect(tags.Tags!.find((t) => t.Key === "env")!.Value).toBe("test");
  });

  test("DeleteTags", async () => {
    const models = await sm.send(new ListModelsCommand({}));
    const model = models.Models!.find((m) => m.ModelName === "tag-test-model");
    const arn = model!.ModelArn!;

    await sm.send(new DeleteTagsCommand({
      ResourceArn: arn,
      TagKeys: ["team"],
    }));

    const tags = await sm.send(new ListTagsCommand({ ResourceArn: arn }));
    expect(tags.Tags!.length).toBe(1);
    expect(tags.Tags![0].Key).toBe("env");

    // Cleanup
    await sm.send(new DeleteModelCommand({ ModelName: "tag-test-model" }));
  });
});
