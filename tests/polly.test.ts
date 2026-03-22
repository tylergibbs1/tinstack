import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  PollyClient,
  DescribeVoicesCommand,
  SynthesizeSpeechCommand,
  PutLexiconCommand,
  GetLexiconCommand,
  ListLexiconsCommand,
  DeleteLexiconCommand,
  StartSpeechSynthesisTaskCommand,
  GetSpeechSynthesisTaskCommand,
  ListSpeechSynthesisTasksCommand,
} from "@aws-sdk/client-polly";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new PollyClient({
  ...clientConfig,
  requestHandler: new NodeHttpHandler(),
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Polly", () => {
  test("DescribeVoices — all", async () => {
    const res = await client.send(new DescribeVoicesCommand({}));
    expect(res.Voices).toBeDefined();
    expect(res.Voices!.length).toBeGreaterThan(0);
    expect(res.Voices![0].Id).toBeDefined();
    expect(res.Voices![0].LanguageCode).toBeDefined();
  });

  test("DescribeVoices — filtered", async () => {
    const res = await client.send(new DescribeVoicesCommand({ LanguageCode: "en-US" }));
    expect(res.Voices).toBeDefined();
    for (const voice of res.Voices!) {
      expect(voice.LanguageCode).toBe("en-US");
    }
  });

  test("SynthesizeSpeech", async () => {
    const res = await client.send(new SynthesizeSpeechCommand({
      Text: "Hello, world!",
      OutputFormat: "mp3",
      VoiceId: "Joanna",
    }));
    expect(res.AudioStream).toBeDefined();
    expect(res.ContentType).toBe("audio/mpeg");
  });

  const lexiconName = "test-lexicon-" + Date.now();

  test("PutLexicon", async () => {
    await client.send(new PutLexiconCommand({
      Name: lexiconName,
      Content: "<lexicon>test</lexicon>",
    }));
    // No error means success
  });

  test("GetLexicon", async () => {
    const res = await client.send(new GetLexiconCommand({ Name: lexiconName }));
    expect(res.Lexicon).toBeDefined();
    expect(res.Lexicon!.Name).toBe(lexiconName);
    expect(res.LexiconAttributes).toBeDefined();
  });

  test("ListLexicons", async () => {
    const res = await client.send(new ListLexiconsCommand({}));
    expect(res.Lexicons).toBeDefined();
    const found = res.Lexicons!.find((l) => l.Name === lexiconName);
    expect(found).toBeDefined();
  });

  test("DeleteLexicon", async () => {
    await client.send(new DeleteLexiconCommand({ Name: lexiconName }));
    const res = await client.send(new ListLexiconsCommand({}));
    const found = res.Lexicons?.find((l) => l.Name === lexiconName);
    expect(found).toBeUndefined();
  });

  let taskId: string;

  test("StartSpeechSynthesisTask", async () => {
    const res = await client.send(new StartSpeechSynthesisTaskCommand({
      Text: "Hello from Polly synthesis task",
      OutputFormat: "mp3",
      OutputS3BucketName: "my-bucket",
      VoiceId: "Joanna",
    }));
    expect(res.SynthesisTask).toBeDefined();
    expect(res.SynthesisTask!.TaskId).toBeDefined();
    expect(res.SynthesisTask!.TaskStatus).toBe("completed");
    taskId = res.SynthesisTask!.TaskId!;
  });

  test("GetSpeechSynthesisTask", async () => {
    const res = await client.send(new GetSpeechSynthesisTaskCommand({ TaskId: taskId }));
    expect(res.SynthesisTask).toBeDefined();
    expect(res.SynthesisTask!.TaskId).toBe(taskId);
    expect(res.SynthesisTask!.OutputUri).toContain("my-bucket");
  });

  test("ListSpeechSynthesisTasks", async () => {
    const res = await client.send(new ListSpeechSynthesisTasksCommand({}));
    expect(res.SynthesisTasks).toBeDefined();
    expect(res.SynthesisTasks!.length).toBeGreaterThan(0);
  });
});
