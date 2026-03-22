import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ForecastClient,
  CreateDatasetCommand,
  DescribeDatasetCommand,
  ListDatasetsCommand,
  DeleteDatasetCommand,
  CreateDatasetGroupCommand,
  DescribeDatasetGroupCommand,
  ListDatasetGroupsCommand,
  DeleteDatasetGroupCommand,
  CreatePredictorCommand,
  DescribePredictorCommand,
  ListPredictorsCommand,
  DeletePredictorCommand,
  CreateForecastCommand,
  DescribeForecastCommand,
  ListForecastsCommand,
  DeleteForecastCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-forecast";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ForecastClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Forecast", () => {
  const datasetName = "test_dataset_" + Date.now();
  const groupName = "test_group_" + Date.now();
  const predictorName = "test_predictor_" + Date.now();
  const forecastName = "test_forecast_" + Date.now();
  let datasetArn: string;
  let groupArn: string;
  let predictorArn: string;
  let forecastArn: string;

  test("CreateDataset", async () => {
    const res = await client.send(new CreateDatasetCommand({
      DatasetName: datasetName,
      DatasetType: "TARGET_TIME_SERIES",
      Domain: "CUSTOM",
      Schema: { Attributes: [{ AttributeName: "target_value", AttributeType: "float" }] },
    }));
    expect(res.DatasetArn).toBeDefined();
    expect(res.DatasetArn).toContain(datasetName);
    datasetArn = res.DatasetArn!;
  });

  test("DescribeDataset", async () => {
    const res = await client.send(new DescribeDatasetCommand({ DatasetArn: datasetArn }));
    expect(res.DatasetName).toBe(datasetName);
    expect(res.Status).toBe("ACTIVE");
    expect(res.Domain).toBe("CUSTOM");
  });

  test("ListDatasets", async () => {
    const res = await client.send(new ListDatasetsCommand({}));
    expect(res.Datasets).toBeDefined();
    const found = res.Datasets!.find((d) => d.DatasetArn === datasetArn);
    expect(found).toBeDefined();
  });

  test("CreateDatasetGroup", async () => {
    const res = await client.send(new CreateDatasetGroupCommand({
      DatasetGroupName: groupName,
      Domain: "CUSTOM",
      DatasetArns: [],
    }));
    expect(res.DatasetGroupArn).toBeDefined();
    groupArn = res.DatasetGroupArn!;
  });

  test("DescribeDatasetGroup", async () => {
    const res = await client.send(new DescribeDatasetGroupCommand({ DatasetGroupArn: groupArn }));
    expect(res.DatasetGroupName).toBe(groupName);
    expect(res.Status).toBe("ACTIVE");
  });

  test("ListDatasetGroups", async () => {
    const res = await client.send(new ListDatasetGroupsCommand({}));
    expect(res.DatasetGroups).toBeDefined();
    const found = res.DatasetGroups!.find((g) => g.DatasetGroupArn === groupArn);
    expect(found).toBeDefined();
  });

  test("CreatePredictor", async () => {
    const res = await client.send(new CreatePredictorCommand({
      PredictorName: predictorName,
      ForecastHorizon: 24,
      InputDataConfig: { DatasetGroupArn: groupArn },
      FeaturizationConfig: { ForecastFrequency: "H" },
    }));
    expect(res.PredictorArn).toBeDefined();
    predictorArn = res.PredictorArn!;
  });

  test("DescribePredictor", async () => {
    const res = await client.send(new DescribePredictorCommand({ PredictorArn: predictorArn }));
    expect(res.PredictorName).toBe(predictorName);
    expect(res.Status).toBe("ACTIVE");
    expect(res.ForecastHorizon).toBe(24);
  });

  test("ListPredictors", async () => {
    const res = await client.send(new ListPredictorsCommand({}));
    expect(res.Predictors).toBeDefined();
    const found = res.Predictors!.find((p) => p.PredictorArn === predictorArn);
    expect(found).toBeDefined();
  });

  test("CreateForecast", async () => {
    const res = await client.send(new CreateForecastCommand({
      ForecastName: forecastName,
      PredictorArn: predictorArn,
    }));
    expect(res.ForecastArn).toBeDefined();
    forecastArn = res.ForecastArn!;
  });

  test("DescribeForecast", async () => {
    const res = await client.send(new DescribeForecastCommand({ ForecastArn: forecastArn }));
    expect(res.ForecastName).toBe(forecastName);
    expect(res.Status).toBe("ACTIVE");
    expect(res.PredictorArn).toBe(predictorArn);
  });

  test("ListForecasts", async () => {
    const res = await client.send(new ListForecastsCommand({}));
    expect(res.Forecasts).toBeDefined();
    const found = res.Forecasts!.find((f) => f.ForecastArn === forecastArn);
    expect(found).toBeDefined();
  });

  test("TagResource + ListTagsForResource", async () => {
    await client.send(new TagResourceCommand({
      ResourceArn: datasetArn,
      Tags: [{ Key: "env", Value: "test" }, { Key: "team", Value: "ml" }],
    }));
    const res = await client.send(new ListTagsForResourceCommand({ ResourceArn: datasetArn }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.length).toBe(2);
    const envTag = res.Tags!.find((t) => t.Key === "env");
    expect(envTag?.Value).toBe("test");
  });

  test("UntagResource", async () => {
    await client.send(new UntagResourceCommand({
      ResourceArn: datasetArn,
      TagKeys: ["team"],
    }));
    const res = await client.send(new ListTagsForResourceCommand({ ResourceArn: datasetArn }));
    expect(res.Tags!.length).toBe(1);
    expect(res.Tags![0].Key).toBe("env");
  });

  test("DeleteForecast", async () => {
    await client.send(new DeleteForecastCommand({ ForecastArn: forecastArn }));
    const res = await client.send(new ListForecastsCommand({}));
    const found = res.Forecasts?.find((f) => f.ForecastArn === forecastArn);
    expect(found).toBeUndefined();
  });

  test("DeletePredictor", async () => {
    await client.send(new DeletePredictorCommand({ PredictorArn: predictorArn }));
    const res = await client.send(new ListPredictorsCommand({}));
    const found = res.Predictors?.find((p) => p.PredictorArn === predictorArn);
    expect(found).toBeUndefined();
  });

  test("DeleteDatasetGroup", async () => {
    await client.send(new DeleteDatasetGroupCommand({ DatasetGroupArn: groupArn }));
    const res = await client.send(new ListDatasetGroupsCommand({}));
    const found = res.DatasetGroups?.find((g) => g.DatasetGroupArn === groupArn);
    expect(found).toBeUndefined();
  });

  test("DeleteDataset", async () => {
    await client.send(new DeleteDatasetCommand({ DatasetArn: datasetArn }));
    const res = await client.send(new ListDatasetsCommand({}));
    const found = res.Datasets?.find((d) => d.DatasetArn === datasetArn);
    expect(found).toBeUndefined();
  });
});
