import { AwsError } from "../../core/errors";

export interface FaceRecord {
  faceId: string;
  boundingBox: BoundingBox;
  confidence: number;
  imageId: string;
  externalImageId?: string;
}

export interface BoundingBox {
  Width: number;
  Height: number;
  Left: number;
  Top: number;
}

export interface RekognitionCollection {
  collectionId: string;
  collectionArn: string;
  faceCount: number;
  createdAt: string;
  faces: Map<string, FaceRecord>;
}

export interface AsyncJob {
  jobId: string;
  status: string;
  createdAt: string;
}

function makeBoundingBox(): BoundingBox {
  return { Width: 0.55, Height: 0.31, Left: 0.24, Top: 0.12 };
}

function makeLandmarks() {
  return [
    { Type: "eyeLeft", X: 0.48, Y: 0.23 },
    { Type: "eyeRight", X: 0.64, Y: 0.19 },
    { Type: "mouthLeft", X: 0.53, Y: 0.62 },
    { Type: "mouthRight", X: 0.66, Y: 0.58 },
    { Type: "nose", X: 0.62, Y: 0.38 },
  ];
}

function makeFaceDetail() {
  return {
    BoundingBox: makeBoundingBox(),
    Landmarks: makeLandmarks(),
    Pose: { Roll: -5.06, Yaw: 18.04, Pitch: 12.57 },
    Quality: { Brightness: 83.42, Sharpness: 67.23 },
    Confidence: 99.99,
    AgeRange: { Low: 25, High: 35 },
    Smile: { Value: true, Confidence: 98.5 },
    Gender: { Value: "Male", Confidence: 99.2 },
    Emotions: [
      { Type: "HAPPY", Confidence: 95.0 },
      { Type: "CALM", Confidence: 4.5 },
      { Type: "SAD", Confidence: 0.5 },
    ],
  };
}

export class RekognitionService {
  private collections = new Map<string, RekognitionCollection>();
  private asyncJobs = new Map<string, AsyncJob>();

  constructor(private accountId: string) {}

  detectFaces(_image: any): { FaceDetails: any[] } {
    return {
      FaceDetails: [makeFaceDetail()],
    };
  }

  detectLabels(_image: any): { Labels: any[]; LabelModelVersion: string } {
    return {
      Labels: [
        {
          Name: "Mobile Phone",
          Confidence: 99.94,
          Instances: [{ BoundingBox: makeBoundingBox(), Confidence: 99.94 }],
          Parents: [{ Name: "Phone" }],
          Categories: [{ Name: "Technology and Computing" }],
        },
        {
          Name: "Person",
          Confidence: 98.5,
          Instances: [{ BoundingBox: makeBoundingBox(), Confidence: 98.5 }],
          Parents: [],
          Categories: [{ Name: "Person Description" }],
        },
      ],
      LabelModelVersion: "3.0",
    };
  }

  detectText(_image: any): { TextDetections: any[]; TextModelVersion: string } {
    return {
      TextDetections: [
        {
          DetectedText: "Hello world",
          Type: "LINE",
          Id: 0,
          Confidence: 99.36,
          Geometry: {
            BoundingBox: { Width: 0.14, Height: 0.03, Left: 0.43, Top: 0.88 },
            Polygon: [
              { X: 0.43, Y: 0.88 },
              { X: 0.57, Y: 0.88 },
              { X: 0.57, Y: 0.91 },
              { X: 0.43, Y: 0.91 },
            ],
          },
        },
        {
          DetectedText: "Hello",
          Type: "WORD",
          Id: 1,
          ParentId: 0,
          Confidence: 99.16,
          Geometry: {
            BoundingBox: { Width: 0.06, Height: 0.02, Left: 0.43, Top: 0.88 },
            Polygon: [
              { X: 0.43, Y: 0.88 },
              { X: 0.50, Y: 0.88 },
              { X: 0.50, Y: 0.90 },
              { X: 0.43, Y: 0.90 },
            ],
          },
        },
      ],
      TextModelVersion: "3.0",
    };
  }

  detectModerationLabels(_image: any): { ModerationLabels: any[]; ModerationModelVersion: string } {
    return {
      ModerationLabels: [
        {
          Confidence: 12.5,
          Name: "Suggestive",
          ParentName: "",
        },
      ],
      ModerationModelVersion: "6.1",
    };
  }

  compareFaces(_sourceImage: any, _targetImage: any, similarityThreshold?: number): any {
    const threshold = similarityThreshold ?? 80;
    return {
      SourceImageFace: {
        BoundingBox: makeBoundingBox(),
        Confidence: 99.99,
      },
      FaceMatches: [
        {
          Similarity: 100.0,
          Face: {
            BoundingBox: makeBoundingBox(),
            Confidence: 99.99,
            Landmarks: makeLandmarks(),
            Pose: { Roll: -5.06, Yaw: 18.04, Pitch: 12.57 },
            Quality: { Brightness: 83.42, Sharpness: 67.23 },
          },
        },
      ],
      UnmatchedFaces: [],
      SourceImageOrientationCorrection: "ROTATE_0",
      TargetImageOrientationCorrection: "ROTATE_0",
    };
  }

  recognizeCelebrities(_image: any): any {
    return {
      CelebrityFaces: [
        {
          Name: "Mock Celebrity",
          Id: "mock-celeb-id",
          MatchConfidence: 99.5,
          Face: {
            BoundingBox: makeBoundingBox(),
            Confidence: 99.99,
            Landmarks: makeLandmarks(),
            Pose: { Roll: -5.06, Yaw: 18.04, Pitch: 12.57 },
            Quality: { Brightness: 83.42, Sharpness: 67.23 },
          },
          Urls: ["www.example.com"],
        },
      ],
      UnrecognizedFaces: [],
    };
  }

  createCollection(collectionId: string, region: string): RekognitionCollection {
    if (this.collections.has(collectionId)) {
      throw new AwsError("ResourceAlreadyExistsException", `Collection ${collectionId} already exists.`, 400);
    }
    const collection: RekognitionCollection = {
      collectionId,
      collectionArn: `arn:aws:rekognition:${region}:${this.accountId}:collection/${collectionId}`,
      faceCount: 0,
      createdAt: new Date().toISOString(),
      faces: new Map(),
    };
    this.collections.set(collectionId, collection);
    return collection;
  }

  describeCollection(collectionId: string): RekognitionCollection {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      throw new AwsError("ResourceNotFoundException", `Collection ${collectionId} not found.`, 400);
    }
    return collection;
  }

  listCollections(): string[] {
    return Array.from(this.collections.keys());
  }

  deleteCollection(collectionId: string): void {
    if (!this.collections.has(collectionId)) {
      throw new AwsError("ResourceNotFoundException", `Collection ${collectionId} not found.`, 400);
    }
    this.collections.delete(collectionId);
  }

  indexFaces(collectionId: string, _image: any, externalImageId?: string): { FaceRecords: any[]; FaceModelVersion: string } {
    const collection = this.describeCollection(collectionId);
    const faceId = crypto.randomUUID();
    const imageId = crypto.randomUUID();
    const record: FaceRecord = {
      faceId,
      boundingBox: makeBoundingBox(),
      confidence: 99.99,
      imageId,
      externalImageId,
    };
    collection.faces.set(faceId, record);
    collection.faceCount = collection.faces.size;
    return {
      FaceRecords: [
        {
          Face: {
            FaceId: faceId,
            BoundingBox: record.boundingBox,
            ImageId: imageId,
            ExternalImageId: externalImageId,
            Confidence: record.confidence,
          },
          FaceDetail: makeFaceDetail(),
        },
      ],
      FaceModelVersion: "6.0",
    };
  }

  searchFaces(collectionId: string, faceId: string, maxFaces?: number): { SearchedFaceId: string; FaceMatches: any[]; FaceModelVersion: string } {
    const collection = this.describeCollection(collectionId);
    const limit = maxFaces ?? 10;
    const matches: any[] = [];
    for (const [id, face] of collection.faces) {
      if (id === faceId) continue;
      if (matches.length >= limit) break;
      matches.push({
        Similarity: 99.5 - matches.length * 0.1,
        Face: {
          FaceId: face.faceId,
          BoundingBox: face.boundingBox,
          Confidence: face.confidence,
          ImageId: face.imageId,
          ExternalImageId: face.externalImageId,
        },
      });
    }
    return {
      SearchedFaceId: faceId,
      FaceMatches: matches,
      FaceModelVersion: "6.0",
    };
  }

  startFaceDetection(video: any): string {
    const jobId = crypto.randomUUID();
    this.asyncJobs.set(jobId, { jobId, status: "SUCCEEDED", createdAt: new Date().toISOString() });
    return jobId;
  }

  getFaceDetection(jobId: string): any {
    const job = this.asyncJobs.get(jobId);
    if (!job) {
      throw new AwsError("InvalidParameterException", `Job ${jobId} not found.`, 400);
    }
    return {
      JobStatus: job.status,
      VideoMetadata: {
        Codec: "h264",
        DurationMillis: 15020,
        Format: "QuickTime / MOV",
        FrameRate: 24.0,
        FrameHeight: 720,
        FrameWidth: 1280,
      },
      Faces: [
        {
          Timestamp: 0,
          Face: makeFaceDetail(),
        },
      ],
    };
  }
}
