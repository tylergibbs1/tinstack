import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ComprehendClient,
  DetectSentimentCommand,
  DetectEntitiesCommand,
  DetectKeyPhrasesCommand,
  DetectDominantLanguageCommand,
  BatchDetectSentimentCommand,
  BatchDetectEntitiesCommand,
  StartEntitiesDetectionJobCommand,
  DescribeEntitiesDetectionJobCommand,
  ListEntitiesDetectionJobsCommand,
  StopEntitiesDetectionJobCommand,
  CreateDocumentClassifierCommand,
  DescribeDocumentClassifierCommand,
  ListDocumentClassifiersCommand,
  DeleteDocumentClassifierCommand,
} from "@aws-sdk/client-comprehend";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ComprehendClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Comprehend", () => {
  test("DetectSentiment", async () => {
    const res = await client.send(new DetectSentimentCommand({
      Text: "I love this product!",
      LanguageCode: "en",
    }));
    expect(res.Sentiment).toBe("NEUTRAL");
    expect(res.SentimentScore).toBeDefined();
    expect(res.SentimentScore!.Positive).toBeGreaterThan(0);
  });

  test("DetectEntities", async () => {
    const res = await client.send(new DetectEntitiesCommand({
      Text: "John works at Amazon",
      LanguageCode: "en",
    }));
    expect(res.Entities).toBeDefined();
    expect(res.Entities!.length).toBeGreaterThan(0);
    expect(res.Entities![0].Type).toBeDefined();
  });

  test("DetectKeyPhrases", async () => {
    const res = await client.send(new DetectKeyPhrasesCommand({
      Text: "The quick brown fox jumps over the lazy dog",
      LanguageCode: "en",
    }));
    expect(res.KeyPhrases).toBeDefined();
    expect(res.KeyPhrases!.length).toBeGreaterThan(0);
  });

  test("DetectDominantLanguage", async () => {
    const res = await client.send(new DetectDominantLanguageCommand({
      Text: "This is an English sentence.",
    }));
    expect(res.Languages).toBeDefined();
    expect(res.Languages!.length).toBeGreaterThan(0);
    expect(res.Languages![0].LanguageCode).toBe("en");
  });

  test("BatchDetectSentiment", async () => {
    const res = await client.send(new BatchDetectSentimentCommand({
      TextList: ["I love this!", "This is terrible."],
      LanguageCode: "en",
    }));
    expect(res.ResultList).toBeDefined();
    expect(res.ResultList!.length).toBe(2);
    expect(res.ErrorList).toBeDefined();
  });

  test("BatchDetectEntities", async () => {
    const res = await client.send(new BatchDetectEntitiesCommand({
      TextList: ["John works at Amazon", "Jane is in Seattle"],
      LanguageCode: "en",
    }));
    expect(res.ResultList).toBeDefined();
    expect(res.ResultList!.length).toBe(2);
  });

  let jobId: string;

  test("StartEntitiesDetectionJob", async () => {
    const res = await client.send(new StartEntitiesDetectionJobCommand({
      InputDataConfig: { S3Uri: "s3://my-bucket/input/", InputFormat: "ONE_DOC_PER_LINE" },
      OutputDataConfig: { S3Uri: "s3://my-bucket/output/" },
      DataAccessRoleArn: "arn:aws:iam::123456789012:role/test-role",
      LanguageCode: "en",
      JobName: "test-entities-job",
    }));
    expect(res.JobId).toBeDefined();
    expect(res.JobStatus).toBe("SUBMITTED");
    jobId = res.JobId!;
  });

  test("DescribeEntitiesDetectionJob", async () => {
    const res = await client.send(new DescribeEntitiesDetectionJobCommand({ JobId: jobId }));
    expect(res.EntitiesDetectionJobProperties).toBeDefined();
    expect(res.EntitiesDetectionJobProperties!.JobStatus).toBe("COMPLETED");
  });

  test("ListEntitiesDetectionJobs", async () => {
    const res = await client.send(new ListEntitiesDetectionJobsCommand({}));
    expect(res.EntitiesDetectionJobPropertiesList).toBeDefined();
    expect(res.EntitiesDetectionJobPropertiesList!.length).toBeGreaterThan(0);
  });

  test("StopEntitiesDetectionJob", async () => {
    // Start a new job to stop
    const startRes = await client.send(new StartEntitiesDetectionJobCommand({
      InputDataConfig: { S3Uri: "s3://my-bucket/input/", InputFormat: "ONE_DOC_PER_LINE" },
      OutputDataConfig: { S3Uri: "s3://my-bucket/output/" },
      DataAccessRoleArn: "arn:aws:iam::123456789012:role/test-role",
      LanguageCode: "en",
    }));
    const res = await client.send(new StopEntitiesDetectionJobCommand({ JobId: startRes.JobId! }));
    expect(res.JobId).toBeDefined();
    expect(res.JobStatus).toBe("STOP_REQUESTED");
  });

  let classifierArn: string;

  test("CreateDocumentClassifier", async () => {
    const res = await client.send(new CreateDocumentClassifierCommand({
      DocumentClassifierName: "test-classifier",
      LanguageCode: "en",
      InputDataConfig: { S3Uri: "s3://my-bucket/training/" },
      DataAccessRoleArn: "arn:aws:iam::123456789012:role/test-role",
    }));
    expect(res.DocumentClassifierArn).toBeDefined();
    expect(res.DocumentClassifierArn).toContain("test-classifier");
    classifierArn = res.DocumentClassifierArn!;
  });

  test("DescribeDocumentClassifier", async () => {
    const res = await client.send(new DescribeDocumentClassifierCommand({
      DocumentClassifierArn: classifierArn,
    }));
    expect(res.DocumentClassifierProperties).toBeDefined();
    expect(res.DocumentClassifierProperties!.Status).toBe("TRAINING");
  });

  test("ListDocumentClassifiers", async () => {
    const res = await client.send(new ListDocumentClassifiersCommand({}));
    expect(res.DocumentClassifierPropertiesList).toBeDefined();
    expect(res.DocumentClassifierPropertiesList!.length).toBeGreaterThan(0);
  });

  test("DeleteDocumentClassifier", async () => {
    await client.send(new DeleteDocumentClassifierCommand({
      DocumentClassifierArn: classifierArn,
    }));
    const res = await client.send(new ListDocumentClassifiersCommand({}));
    const found = res.DocumentClassifierPropertiesList!.find(
      (c) => c.DocumentClassifierArn === classifierArn,
    );
    expect(found).toBeUndefined();
  });
});
