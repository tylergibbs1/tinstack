import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  RekognitionClient,
  DetectFacesCommand,
  DetectLabelsCommand,
  DetectTextCommand,
  DetectModerationLabelsCommand,
  CompareFacesCommand,
  RecognizeCelebritiesCommand,
  CreateCollectionCommand,
  DescribeCollectionCommand,
  ListCollectionsCommand,
  DeleteCollectionCommand,
  IndexFacesCommand,
  SearchFacesCommand,
  StartFaceDetectionCommand,
  GetFaceDetectionCommand,
} from "@aws-sdk/client-rekognition";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new RekognitionClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

const mockImage = { Bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) };

describe("Rekognition", () => {
  const collectionId = "test-collection-" + Date.now();

  test("DetectFaces", async () => {
    const res = await client.send(new DetectFacesCommand({ Image: mockImage }));
    expect(res.FaceDetails).toBeDefined();
    expect(res.FaceDetails!.length).toBeGreaterThan(0);
    expect(res.FaceDetails![0].Confidence).toBeGreaterThan(90);
    expect(res.FaceDetails![0].BoundingBox).toBeDefined();
  });

  test("DetectLabels", async () => {
    const res = await client.send(new DetectLabelsCommand({ Image: mockImage }));
    expect(res.Labels).toBeDefined();
    expect(res.Labels!.length).toBeGreaterThan(0);
    expect(res.Labels![0].Name).toBeDefined();
    expect(res.Labels![0].Confidence).toBeGreaterThan(90);
  });

  test("DetectText", async () => {
    const res = await client.send(new DetectTextCommand({ Image: mockImage }));
    expect(res.TextDetections).toBeDefined();
    expect(res.TextDetections!.length).toBeGreaterThan(0);
    expect(res.TextDetections![0].DetectedText).toBe("Hello world");
  });

  test("DetectModerationLabels", async () => {
    const res = await client.send(new DetectModerationLabelsCommand({ Image: mockImage }));
    expect(res.ModerationLabels).toBeDefined();
    expect(res.ModerationModelVersion).toBeDefined();
  });

  test("CompareFaces", async () => {
    const res = await client.send(new CompareFacesCommand({
      SourceImage: mockImage,
      TargetImage: mockImage,
    }));
    expect(res.FaceMatches).toBeDefined();
    expect(res.FaceMatches!.length).toBeGreaterThan(0);
    expect(res.FaceMatches![0].Similarity).toBe(100.0);
    expect(res.SourceImageFace).toBeDefined();
  });

  test("RecognizeCelebrities", async () => {
    const res = await client.send(new RecognizeCelebritiesCommand({ Image: mockImage }));
    expect(res.CelebrityFaces).toBeDefined();
    expect(res.CelebrityFaces!.length).toBeGreaterThan(0);
    expect(res.CelebrityFaces![0].Name).toBe("Mock Celebrity");
  });

  test("CreateCollection", async () => {
    const res = await client.send(new CreateCollectionCommand({ CollectionId: collectionId }));
    expect(res.CollectionArn).toContain(collectionId);
    expect(res.StatusCode).toBe(200);
  });

  test("DescribeCollection", async () => {
    const res = await client.send(new DescribeCollectionCommand({ CollectionId: collectionId }));
    expect(res.CollectionARN).toContain(collectionId);
    expect(res.FaceCount).toBe(0);
  });

  test("ListCollections", async () => {
    const res = await client.send(new ListCollectionsCommand({}));
    expect(res.CollectionIds).toContain(collectionId);
  });

  test("IndexFaces", async () => {
    const res = await client.send(new IndexFacesCommand({
      CollectionId: collectionId,
      Image: mockImage,
      ExternalImageId: "test-face",
    }));
    expect(res.FaceRecords).toBeDefined();
    expect(res.FaceRecords!.length).toBe(1);
    expect(res.FaceRecords![0].Face!.FaceId).toBeDefined();
    expect(res.FaceRecords![0].Face!.ExternalImageId).toBe("test-face");
  });

  test("SearchFaces", async () => {
    // Index another face so we can search
    const indexRes = await client.send(new IndexFacesCommand({
      CollectionId: collectionId,
      Image: mockImage,
      ExternalImageId: "search-target",
    }));
    const faceId = indexRes.FaceRecords![0].Face!.FaceId!;

    const res = await client.send(new SearchFacesCommand({
      CollectionId: collectionId,
      FaceId: faceId,
      MaxFaces: 10,
    }));
    expect(res.SearchedFaceId).toBe(faceId);
    expect(res.FaceMatches).toBeDefined();
  });

  test("StartFaceDetection + GetFaceDetection", async () => {
    const startRes = await client.send(new StartFaceDetectionCommand({
      Video: { S3Object: { Bucket: "test-bucket", Name: "test-video.mp4" } },
    }));
    expect(startRes.JobId).toBeDefined();

    const getRes = await client.send(new GetFaceDetectionCommand({ JobId: startRes.JobId! }));
    expect(getRes.JobStatus).toBe("SUCCEEDED");
    expect(getRes.Faces).toBeDefined();
  });

  test("DeleteCollection", async () => {
    const res = await client.send(new DeleteCollectionCommand({ CollectionId: collectionId }));
    expect(res.StatusCode).toBe(200);

    // Verify deleted
    const listRes = await client.send(new ListCollectionsCommand({}));
    expect(listRes.CollectionIds).not.toContain(collectionId);
  });
});
