import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  KinesisVideoArchivedMediaClient,
  ListFragmentsCommand,
  GetHLSStreamingSessionURLCommand,
  GetDASHStreamingSessionURLCommand,
} from "@aws-sdk/client-kinesis-video-archived-media";
import { startServer, stopServer, ENDPOINT } from "./helpers";

const client = new KinesisVideoArchivedMediaClient({
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Kinesis Video Archived Media", () => {
  test("ListFragments", async () => {
    const res = await client.send(new ListFragmentsCommand({
      StreamName: "test-stream",
    }));
    expect(res.Fragments).toBeDefined();
    expect(res.Fragments!.length).toBeGreaterThanOrEqual(1);
  });

  test("GetHLSStreamingSessionURL", async () => {
    const res = await client.send(new GetHLSStreamingSessionURLCommand({
      StreamName: "test-stream",
    }));
    expect(res.HLSStreamingSessionURL).toContain("mock-token");
  });

  test("GetDASHStreamingSessionURL", async () => {
    const res = await client.send(new GetDASHStreamingSessionURLCommand({
      StreamName: "test-stream",
    }));
    expect(res.DASHStreamingSessionURL).toContain("mock-token");
  });
});
