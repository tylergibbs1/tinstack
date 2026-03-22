import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SageMakerMetricsClient,
  BatchPutMetricsCommand,
} from "@aws-sdk/client-sagemaker-metrics";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const client = new SageMakerMetricsClient({
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SageMaker Metrics", () => {
  test("BatchPutMetrics", async () => {
    const res = await client.send(new BatchPutMetricsCommand({
      TrialComponentName: "test-trial",
      MetricData: [
        { MetricName: "loss", Timestamp: new Date(), Value: 0.5, Step: 1 },
        { MetricName: "accuracy", Timestamp: new Date(), Value: 0.95, Step: 1 },
      ],
    }));
    expect(res.Errors).toBeDefined();
    expect(res.Errors!.length).toBe(0);
  });

  test("BatchPutMetrics - empty", async () => {
    const res = await client.send(new BatchPutMetricsCommand({
      TrialComponentName: "test-trial",
      MetricData: [],
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });
});
