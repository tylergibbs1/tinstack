import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  ListTranscriptionJobsCommand,
  DeleteTranscriptionJobCommand,
  CreateVocabularyCommand,
  GetVocabularyCommand,
  ListVocabulariesCommand,
  DeleteVocabularyCommand,
  StartMedicalTranscriptionJobCommand,
  GetMedicalTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new TranscribeClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Transcribe", () => {
  const jobName = "test-job-" + Date.now();
  const vocabName = "test-vocab-" + Date.now();

  test("StartTranscriptionJob", async () => {
    const res = await client.send(new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      LanguageCode: "en-US",
      Media: { MediaFileUri: "s3://my-bucket/audio.mp3" },
    }));
    expect(res.TranscriptionJob).toBeDefined();
    expect(res.TranscriptionJob!.TranscriptionJobName).toBe(jobName);
    expect(res.TranscriptionJob!.TranscriptionJobStatus).toBe("COMPLETED");
  });

  test("GetTranscriptionJob", async () => {
    const res = await client.send(new GetTranscriptionJobCommand({
      TranscriptionJobName: jobName,
    }));
    expect(res.TranscriptionJob).toBeDefined();
    expect(res.TranscriptionJob!.TranscriptionJobStatus).toBe("COMPLETED");
    expect(res.TranscriptionJob!.Transcript).toBeDefined();
    expect(res.TranscriptionJob!.Transcript!.TranscriptFileUri).toBeDefined();
  });

  test("ListTranscriptionJobs", async () => {
    const res = await client.send(new ListTranscriptionJobsCommand({}));
    expect(res.TranscriptionJobSummaries).toBeDefined();
    expect(res.TranscriptionJobSummaries!.length).toBeGreaterThan(0);
    const found = res.TranscriptionJobSummaries!.find(
      (j) => j.TranscriptionJobName === jobName,
    );
    expect(found).toBeDefined();
  });

  test("DeleteTranscriptionJob", async () => {
    await client.send(new DeleteTranscriptionJobCommand({
      TranscriptionJobName: jobName,
    }));
    const res = await client.send(new ListTranscriptionJobsCommand({}));
    const found = res.TranscriptionJobSummaries!.find(
      (j) => j.TranscriptionJobName === jobName,
    );
    expect(found).toBeUndefined();
  });

  test("CreateVocabulary", async () => {
    const res = await client.send(new CreateVocabularyCommand({
      VocabularyName: vocabName,
      LanguageCode: "en-US",
      Phrases: ["hello", "world"],
    }));
    expect(res.VocabularyName).toBe(vocabName);
    expect(res.VocabularyState).toBe("READY");
  });

  test("GetVocabulary", async () => {
    const res = await client.send(new GetVocabularyCommand({
      VocabularyName: vocabName,
    }));
    expect(res.VocabularyName).toBe(vocabName);
    expect(res.VocabularyState).toBe("READY");
  });

  test("ListVocabularies", async () => {
    const res = await client.send(new ListVocabulariesCommand({}));
    expect(res.Vocabularies).toBeDefined();
    const found = res.Vocabularies!.find((v) => v.VocabularyName === vocabName);
    expect(found).toBeDefined();
  });

  test("DeleteVocabulary", async () => {
    await client.send(new DeleteVocabularyCommand({ VocabularyName: vocabName }));
    const res = await client.send(new ListVocabulariesCommand({}));
    const found = res.Vocabularies?.find((v) => v.VocabularyName === vocabName);
    expect(found).toBeUndefined();
  });

  test("StartMedicalTranscriptionJob + Get", async () => {
    const medJobName = "med-job-" + Date.now();
    const startRes = await client.send(new StartMedicalTranscriptionJobCommand({
      MedicalTranscriptionJobName: medJobName,
      LanguageCode: "en-US",
      Media: { MediaFileUri: "s3://my-bucket/medical-audio.mp3" },
      OutputBucketName: "my-output-bucket",
      Specialty: "PRIMARYCARE",
      Type: "CONVERSATION",
    }));
    expect(startRes.MedicalTranscriptionJob).toBeDefined();
    expect(startRes.MedicalTranscriptionJob!.TranscriptionJobStatus).toBe("COMPLETED");

    const getRes = await client.send(new GetMedicalTranscriptionJobCommand({
      MedicalTranscriptionJobName: medJobName,
    }));
    expect(getRes.MedicalTranscriptionJob).toBeDefined();
    expect(getRes.MedicalTranscriptionJob!.Transcript).toBeDefined();
  });
});
