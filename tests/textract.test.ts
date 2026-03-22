import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  TextractClient,
  DetectDocumentTextCommand,
  AnalyzeDocumentCommand,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
} from "@aws-sdk/client-textract";
import { startServer, stopServer, clientConfig } from "./helpers";

const textract = new TextractClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Textract", () => {
  test("DetectDocumentText", async () => {
    const res = await textract.send(new DetectDocumentTextCommand({
      Document: {
        Bytes: new TextEncoder().encode("fake document content"),
      },
    }));

    expect(res.DocumentMetadata).toBeDefined();
    expect(res.DocumentMetadata!.Pages).toBe(1);
    expect(res.Blocks).toBeDefined();
    expect(res.Blocks!.length).toBeGreaterThan(0);

    const pageBlock = res.Blocks!.find((b) => b.BlockType === "PAGE");
    expect(pageBlock).toBeDefined();
    expect(pageBlock!.Geometry).toBeDefined();
    expect(pageBlock!.Relationships).toBeDefined();

    const lineBlocks = res.Blocks!.filter((b) => b.BlockType === "LINE");
    expect(lineBlocks.length).toBeGreaterThanOrEqual(1);
    expect(lineBlocks[0].Text).toContain("Mock detected text");
    expect(lineBlocks[0].Confidence).toBeGreaterThan(90);

    const wordBlocks = res.Blocks!.filter((b) => b.BlockType === "WORD");
    expect(wordBlocks.length).toBeGreaterThanOrEqual(1);
    expect(wordBlocks[0].Text).toBeDefined();
  });

  test("AnalyzeDocument - FORMS", async () => {
    const res = await textract.send(new AnalyzeDocumentCommand({
      Document: {
        Bytes: new TextEncoder().encode("fake document content"),
      },
      FeatureTypes: ["FORMS"],
    }));

    expect(res.DocumentMetadata!.Pages).toBe(1);
    expect(res.Blocks).toBeDefined();

    const kvBlocks = res.Blocks!.filter((b) => b.BlockType === "KEY_VALUE_SET");
    expect(kvBlocks.length).toBeGreaterThanOrEqual(2);

    const keyBlock = kvBlocks.find((b) => b.EntityTypes?.includes("KEY"));
    expect(keyBlock).toBeDefined();

    const valueBlock = kvBlocks.find((b) => b.EntityTypes?.includes("VALUE"));
    expect(valueBlock).toBeDefined();
  });

  test("AnalyzeDocument - TABLES", async () => {
    const res = await textract.send(new AnalyzeDocumentCommand({
      Document: {
        Bytes: new TextEncoder().encode("fake document content"),
      },
      FeatureTypes: ["TABLES"],
    }));

    expect(res.Blocks).toBeDefined();

    const tableBlock = res.Blocks!.find((b) => b.BlockType === "TABLE");
    expect(tableBlock).toBeDefined();
    expect(tableBlock!.Confidence).toBeGreaterThan(90);

    const cellBlocks = res.Blocks!.filter((b) => b.BlockType === "CELL");
    expect(cellBlocks.length).toBeGreaterThanOrEqual(2);
  });

  test("AnalyzeDocument - TABLES and FORMS combined", async () => {
    const res = await textract.send(new AnalyzeDocumentCommand({
      Document: {
        Bytes: new TextEncoder().encode("fake document content"),
      },
      FeatureTypes: ["TABLES", "FORMS"],
    }));

    expect(res.Blocks).toBeDefined();
    const tableBlock = res.Blocks!.find((b) => b.BlockType === "TABLE");
    expect(tableBlock).toBeDefined();
    const kvBlocks = res.Blocks!.filter((b) => b.BlockType === "KEY_VALUE_SET");
    expect(kvBlocks.length).toBeGreaterThanOrEqual(2);
  });

  test("StartDocumentTextDetection and GetDocumentTextDetection", async () => {
    const startRes = await textract.send(new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: { Bucket: "my-bucket", Name: "document.pdf" },
      },
    }));

    expect(startRes.JobId).toBeDefined();
    const jobId = startRes.JobId!;

    const getRes = await textract.send(new GetDocumentTextDetectionCommand({
      JobId: jobId,
    }));

    expect(getRes.JobStatus).toBe("SUCCEEDED");
    expect(getRes.DocumentMetadata!.Pages).toBe(1);
    expect(getRes.Blocks).toBeDefined();
    expect(getRes.Blocks!.length).toBeGreaterThan(0);
  });

  test("StartDocumentAnalysis and GetDocumentAnalysis", async () => {
    const startRes = await textract.send(new StartDocumentAnalysisCommand({
      DocumentLocation: {
        S3Object: { Bucket: "my-bucket", Name: "document.pdf" },
      },
      FeatureTypes: ["TABLES", "FORMS"],
    }));

    expect(startRes.JobId).toBeDefined();
    const jobId = startRes.JobId!;

    const getRes = await textract.send(new GetDocumentAnalysisCommand({
      JobId: jobId,
    }));

    expect(getRes.JobStatus).toBe("SUCCEEDED");
    expect(getRes.DocumentMetadata!.Pages).toBe(1);
    expect(getRes.Blocks).toBeDefined();

    const tableBlock = getRes.Blocks!.find((b) => b.BlockType === "TABLE");
    expect(tableBlock).toBeDefined();
  });

  test("GetDocumentTextDetection - invalid job ID", async () => {
    await expect(
      textract.send(new GetDocumentTextDetectionCommand({
        JobId: "nonexistent-job-id",
      })),
    ).rejects.toThrow();
  });
});
