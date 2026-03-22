import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  GuardDutyClient,
  CreateDetectorCommand,
  GetDetectorCommand,
  ListDetectorsCommand,
  UpdateDetectorCommand,
  DeleteDetectorCommand,
  CreateFilterCommand,
  GetFilterCommand,
  ListFiltersCommand,
  DeleteFilterCommand,
  CreateIPSetCommand,
  GetIPSetCommand,
  ListIPSetsCommand,
  DeleteIPSetCommand,
  CreateThreatIntelSetCommand,
  ListFindingsCommand,
  GetFindingsCommand,
  ArchiveFindingsCommand,
  UnarchiveFindingsCommand,
} from "@aws-sdk/client-guardduty";
import { startServer, stopServer, clientConfig } from "./helpers";

const gd = new GuardDutyClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("GuardDuty", () => {
  let detectorId: string;
  let ipSetId: string;

  // --- Detectors ---

  test("CreateDetector", async () => {
    const res = await gd.send(new CreateDetectorCommand({
      Enable: true,
      FindingPublishingFrequency: "FIFTEEN_MINUTES",
      Tags: { env: "test" },
    }));
    detectorId = res.DetectorId!;
    expect(detectorId).toBeDefined();
    expect(detectorId.length).toBe(32);
  });

  test("GetDetector", async () => {
    const res = await gd.send(new GetDetectorCommand({
      DetectorId: detectorId,
    }));
    expect(res.Status).toBe("ENABLED");
    expect(res.FindingPublishingFrequency).toBe("FIFTEEN_MINUTES");
    expect(res.ServiceRole).toContain("guardduty");
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.env).toBe("test");
  });

  test("ListDetectors", async () => {
    const res = await gd.send(new ListDetectorsCommand({}));
    expect(res.DetectorIds).toBeDefined();
    expect(res.DetectorIds!.length).toBeGreaterThanOrEqual(1);
    expect(res.DetectorIds!).toContain(detectorId);
  });

  test("UpdateDetector", async () => {
    await gd.send(new UpdateDetectorCommand({
      DetectorId: detectorId,
      Enable: false,
      FindingPublishingFrequency: "SIX_HOURS",
    }));
    const res = await gd.send(new GetDetectorCommand({
      DetectorId: detectorId,
    }));
    expect(res.Status).toBe("DISABLED");
    expect(res.FindingPublishingFrequency).toBe("SIX_HOURS");
  });

  // --- Filters ---

  test("CreateFilter", async () => {
    const res = await gd.send(new CreateFilterCommand({
      DetectorId: detectorId,
      Name: "test-filter",
      Action: "ARCHIVE",
      Description: "Test filter",
      FindingCriteria: { Criterion: {} },
      Rank: 1,
    }));
    expect(res.Name).toBe("test-filter");
  });

  test("GetFilter", async () => {
    const res = await gd.send(new GetFilterCommand({
      DetectorId: detectorId,
      FilterName: "test-filter",
    }));
    expect(res.Name).toBe("test-filter");
    expect(res.Action).toBe("ARCHIVE");
    expect(res.Description).toBe("Test filter");
    expect(res.Rank).toBe(1);
  });

  test("ListFilters", async () => {
    const res = await gd.send(new ListFiltersCommand({
      DetectorId: detectorId,
    }));
    expect(res.FilterNames).toBeDefined();
    expect(res.FilterNames!).toContain("test-filter");
  });

  test("DeleteFilter", async () => {
    await gd.send(new DeleteFilterCommand({
      DetectorId: detectorId,
      FilterName: "test-filter",
    }));
    const res = await gd.send(new ListFiltersCommand({
      DetectorId: detectorId,
    }));
    expect(res.FilterNames!).not.toContain("test-filter");
  });

  // --- IPSets ---

  test("CreateIPSet", async () => {
    const res = await gd.send(new CreateIPSetCommand({
      DetectorId: detectorId,
      Name: "test-ipset",
      Format: "TXT",
      Location: "s3://bucket/ipset.txt",
      Activate: true,
    }));
    ipSetId = res.IpSetId!;
    expect(ipSetId).toBeDefined();
  });

  test("GetIPSet", async () => {
    const res = await gd.send(new GetIPSetCommand({
      DetectorId: detectorId,
      IpSetId: ipSetId,
    }));
    expect(res.Name).toBe("test-ipset");
    expect(res.Format).toBe("TXT");
    expect(res.Location).toBe("s3://bucket/ipset.txt");
    expect(res.Status).toBe("ACTIVE");
  });

  test("ListIPSets", async () => {
    const res = await gd.send(new ListIPSetsCommand({
      DetectorId: detectorId,
    }));
    expect(res.IpSetIds).toBeDefined();
    expect(res.IpSetIds!).toContain(ipSetId);
  });

  test("DeleteIPSet", async () => {
    await gd.send(new DeleteIPSetCommand({
      DetectorId: detectorId,
      IpSetId: ipSetId,
    }));
    const res = await gd.send(new ListIPSetsCommand({
      DetectorId: detectorId,
    }));
    expect(res.IpSetIds!).not.toContain(ipSetId);
  });

  // --- ThreatIntelSets ---

  test("CreateThreatIntelSet", async () => {
    const res = await gd.send(new CreateThreatIntelSetCommand({
      DetectorId: detectorId,
      Name: "test-tis",
      Format: "TXT",
      Location: "s3://bucket/tis.txt",
      Activate: true,
    }));
    expect(res.ThreatIntelSetId).toBeDefined();
  });

  // --- Findings ---

  test("ListFindings", async () => {
    const res = await gd.send(new ListFindingsCommand({
      DetectorId: detectorId,
    }));
    expect(res.FindingIds).toBeDefined();
  });

  test("GetFindings - empty", async () => {
    const res = await gd.send(new GetFindingsCommand({
      DetectorId: detectorId,
      FindingIds: ["nonexistent-id"],
    }));
    expect(res.Findings).toBeDefined();
    expect(res.Findings!.length).toBe(0);
  });

  // --- Cleanup ---

  test("DeleteDetector", async () => {
    await gd.send(new DeleteDetectorCommand({
      DetectorId: detectorId,
    }));
    const res = await gd.send(new ListDetectorsCommand({}));
    expect(res.DetectorIds!).not.toContain(detectorId);
  });

  test("GetDetector - not found", async () => {
    await expect(
      gd.send(new GetDetectorCommand({ DetectorId: "nonexistent" })),
    ).rejects.toThrow();
  });
});
