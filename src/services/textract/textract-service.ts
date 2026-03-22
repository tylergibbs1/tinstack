import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface TextractJob {
  jobId: string;
  status: string;
  documentLocation?: { s3Bucket: string; s3Key: string };
  featureTypes?: string[];
  createdAt: string;
}

function makeGeometry() {
  return {
    BoundingBox: { Width: 0.8, Height: 0.05, Left: 0.1, Top: 0.1 },
    Polygon: [
      { X: 0.1, Y: 0.1 },
      { X: 0.9, Y: 0.1 },
      { X: 0.9, Y: 0.15 },
      { X: 0.1, Y: 0.15 },
    ],
  };
}

function generateDetectBlocks(): any[] {
  const pageId = crypto.randomUUID();
  const lineId1 = crypto.randomUUID();
  const lineId2 = crypto.randomUUID();
  const wordId1 = crypto.randomUUID();
  const wordId2 = crypto.randomUUID();
  const wordId3 = crypto.randomUUID();
  const wordId4 = crypto.randomUUID();
  const wordId5 = crypto.randomUUID();
  const wordId6 = crypto.randomUUID();

  return [
    {
      BlockType: "PAGE",
      Id: pageId,
      Geometry: makeGeometry(),
      Relationships: [{ Type: "CHILD", Ids: [lineId1, lineId2] }],
    },
    {
      BlockType: "LINE",
      Id: lineId1,
      Text: "Mock detected text line 1",
      Confidence: 99.5,
      Geometry: makeGeometry(),
      Relationships: [{ Type: "CHILD", Ids: [wordId1, wordId2, wordId3] }],
    },
    {
      BlockType: "LINE",
      Id: lineId2,
      Text: "Mock detected text line 2",
      Confidence: 99.3,
      Geometry: makeGeometry(),
      Relationships: [{ Type: "CHILD", Ids: [wordId4, wordId5, wordId6] }],
    },
    { BlockType: "WORD", Id: wordId1, Text: "Mock", Confidence: 99.8, Geometry: makeGeometry() },
    { BlockType: "WORD", Id: wordId2, Text: "detected", Confidence: 99.7, Geometry: makeGeometry() },
    { BlockType: "WORD", Id: wordId3, Text: "text", Confidence: 99.6, Geometry: makeGeometry() },
    { BlockType: "WORD", Id: wordId4, Text: "line", Confidence: 99.5, Geometry: makeGeometry() },
    { BlockType: "WORD", Id: wordId5, Text: "1", Confidence: 99.9, Geometry: makeGeometry() },
    { BlockType: "WORD", Id: wordId6, Text: "2", Confidence: 99.9, Geometry: makeGeometry() },
  ];
}

function generateAnalyzeBlocks(featureTypes: string[]): any[] {
  const blocks = generateDetectBlocks();

  if (featureTypes.includes("FORMS")) {
    const keyId = crypto.randomUUID();
    const valueId = crypto.randomUUID();
    blocks.push(
      {
        BlockType: "KEY_VALUE_SET",
        Id: keyId,
        EntityTypes: ["KEY"],
        Text: "Name",
        Confidence: 98.5,
        Geometry: makeGeometry(),
        Relationships: [{ Type: "VALUE", Ids: [valueId] }],
      },
      {
        BlockType: "KEY_VALUE_SET",
        Id: valueId,
        EntityTypes: ["VALUE"],
        Text: "Mock Value",
        Confidence: 98.0,
        Geometry: makeGeometry(),
      },
    );
  }

  if (featureTypes.includes("TABLES")) {
    const tableId = crypto.randomUUID();
    const cellId1 = crypto.randomUUID();
    const cellId2 = crypto.randomUUID();
    blocks.push(
      {
        BlockType: "TABLE",
        Id: tableId,
        Confidence: 99.0,
        Geometry: makeGeometry(),
        Relationships: [{ Type: "CHILD", Ids: [cellId1, cellId2] }],
      },
      {
        BlockType: "CELL",
        Id: cellId1,
        RowIndex: 1,
        ColumnIndex: 1,
        Text: "Header",
        Confidence: 98.5,
        Geometry: makeGeometry(),
      },
      {
        BlockType: "CELL",
        Id: cellId2,
        RowIndex: 2,
        ColumnIndex: 1,
        Text: "Data",
        Confidence: 98.0,
        Geometry: makeGeometry(),
      },
    );
  }

  return blocks;
}

export class TextractService {
  private jobs: StorageBackend<string, TextractJob>;

  constructor() {
    this.jobs = new InMemoryStorage();
  }

  detectDocumentText(_document: any): { DocumentMetadata: any; Blocks: any[] } {
    return {
      DocumentMetadata: { Pages: 1 },
      Blocks: generateDetectBlocks(),
    };
  }

  analyzeDocument(_document: any, featureTypes: string[]): { DocumentMetadata: any; Blocks: any[] } {
    if (!featureTypes || featureTypes.length === 0) {
      throw new AwsError(
        "InvalidParameterException",
        "FeatureTypes must contain at least one feature type.",
        400,
      );
    }
    return {
      DocumentMetadata: { Pages: 1 },
      Blocks: generateAnalyzeBlocks(featureTypes),
    };
  }

  startDocumentTextDetection(documentLocation: any): string {
    const jobId = crypto.randomUUID();
    this.jobs.set(jobId, {
      jobId,
      status: "SUCCEEDED",
      documentLocation: {
        s3Bucket: documentLocation?.S3Object?.Bucket ?? "mock-bucket",
        s3Key: documentLocation?.S3Object?.Name ?? "mock-key",
      },
      createdAt: new Date().toISOString(),
    });
    return jobId;
  }

  getDocumentTextDetection(jobId: string): any {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AwsError("InvalidJobIdException", `Job ${jobId} not found.`, 400);
    }
    return {
      JobStatus: job.status,
      DocumentMetadata: { Pages: 1 },
      Blocks: generateDetectBlocks(),
    };
  }

  startDocumentAnalysis(documentLocation: any, featureTypes: string[]): string {
    const jobId = crypto.randomUUID();
    this.jobs.set(jobId, {
      jobId,
      status: "SUCCEEDED",
      documentLocation: {
        s3Bucket: documentLocation?.S3Object?.Bucket ?? "mock-bucket",
        s3Key: documentLocation?.S3Object?.Name ?? "mock-key",
      },
      featureTypes,
      createdAt: new Date().toISOString(),
    });
    return jobId;
  }

  getDocumentAnalysis(jobId: string): any {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AwsError("InvalidJobIdException", `Job ${jobId} not found.`, 400);
    }
    return {
      JobStatus: job.status,
      DocumentMetadata: { Pages: 1 },
      Blocks: generateAnalyzeBlocks(job.featureTypes ?? ["TABLES", "FORMS"]),
    };
  }
}
