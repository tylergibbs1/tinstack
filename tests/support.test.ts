import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SupportClient,
  DescribeServicesCommand,
  DescribeSeverityLevelsCommand,
  CreateCaseCommand,
  DescribeCasesCommand,
  ResolveCaseCommand,
  AddCommunicationToCaseCommand,
  DescribeCommunicationsCommand,
  DescribeTrustedAdvisorChecksCommand,
  DescribeTrustedAdvisorCheckResultCommand,
  RefreshTrustedAdvisorCheckCommand,
} from "@aws-sdk/client-support";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new SupportClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Support", () => {
  let caseId: string;

  test("DescribeServices", async () => {
    const res = await client.send(new DescribeServicesCommand({}));
    expect(res.services).toBeDefined();
    expect(res.services!.length).toBeGreaterThanOrEqual(1);
    expect(res.services![0].code).toBeDefined();
    expect(res.services![0].name).toBeDefined();
    expect(res.services![0].categories).toBeDefined();
  });

  test("DescribeSeverityLevels", async () => {
    const res = await client.send(new DescribeSeverityLevelsCommand({}));
    expect(res.severityLevels).toBeDefined();
    expect(res.severityLevels!.length).toBe(5);
    const codes = res.severityLevels!.map((s) => s.code);
    expect(codes).toContain("low");
    expect(codes).toContain("critical");
  });

  test("CreateCase", async () => {
    const res = await client.send(new CreateCaseCommand({
      subject: "Test support case",
      serviceCode: "amazon-ec2",
      categoryCode: "general-guidance",
      severityCode: "low",
      communicationBody: "This is a test case.",
      ccEmailAddresses: ["test@example.com"],
      language: "en",
    }));
    expect(res.caseId).toBeDefined();
    caseId = res.caseId!;
  });

  test("DescribeCases", async () => {
    const res = await client.send(new DescribeCasesCommand({
      caseIdList: [caseId],
    }));
    expect(res.cases).toBeDefined();
    expect(res.cases!.length).toBe(1);
    expect(res.cases![0].subject).toBe("Test support case");
    expect(res.cases![0].serviceCode).toBe("amazon-ec2");
    expect(res.cases![0].status).toBe("opened");
  });

  test("AddCommunicationToCase", async () => {
    const res = await client.send(new AddCommunicationToCaseCommand({
      caseId,
      communicationBody: "Additional information for the case.",
    }));
    expect(res.result).toBe(true);
  });

  test("DescribeCommunications", async () => {
    const res = await client.send(new DescribeCommunicationsCommand({
      caseId,
    }));
    expect(res.communications).toBeDefined();
    expect(res.communications!.length).toBe(2);
    expect(res.communications![1].body).toBe("Additional information for the case.");
  });

  test("ResolveCase", async () => {
    const res = await client.send(new ResolveCaseCommand({
      caseId,
    }));
    expect(res.initialCaseStatus).toBe("opened");
    expect(res.finalCaseStatus).toBe("resolved");
  });

  test("DescribeCases - resolved case excluded by default", async () => {
    const res = await client.send(new DescribeCasesCommand({
      caseIdList: [caseId],
    }));
    expect(res.cases!.length).toBe(0);
  });

  test("DescribeCases - include resolved", async () => {
    const res = await client.send(new DescribeCasesCommand({
      caseIdList: [caseId],
      includeResolvedCases: true,
    }));
    expect(res.cases!.length).toBe(1);
    expect(res.cases![0].status).toBe("resolved");
  });

  test("DescribeTrustedAdvisorChecks", async () => {
    const res = await client.send(new DescribeTrustedAdvisorChecksCommand({
      language: "en",
    }));
    expect(res.checks).toBeDefined();
    expect(res.checks!.length).toBeGreaterThanOrEqual(1);
    expect(res.checks![0].id).toBeDefined();
    expect(res.checks![0].name).toBeDefined();
  });

  test("DescribeTrustedAdvisorCheckResult", async () => {
    const checksRes = await client.send(new DescribeTrustedAdvisorChecksCommand({
      language: "en",
    }));
    const checkId = checksRes.checks![0].id!;

    const res = await client.send(new DescribeTrustedAdvisorCheckResultCommand({
      checkId,
    }));
    expect(res.result).toBeDefined();
    expect(res.result!.checkId).toBe(checkId);
    expect(res.result!.status).toBeDefined();
  });

  test("RefreshTrustedAdvisorCheck", async () => {
    const checksRes = await client.send(new DescribeTrustedAdvisorChecksCommand({
      language: "en",
    }));
    const checkId = checksRes.checks![0].id!;

    const res = await client.send(new RefreshTrustedAdvisorCheckCommand({
      checkId,
    }));
    expect(res.status).toBeDefined();
    expect(res.status!.checkId).toBe(checkId);
    expect(res.status!.status).toBeDefined();
  });
});
