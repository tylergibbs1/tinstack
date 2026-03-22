import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ACMClient,
  RequestCertificateCommand,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  DeleteCertificateCommand,
  AddTagsToCertificateCommand,
  ListTagsForCertificateCommand,
  RemoveTagsFromCertificateCommand,
} from "@aws-sdk/client-acm";
import { startServer, stopServer, clientConfig } from "./helpers";

const acm = new ACMClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("ACM", () => {
  let certArn: string;

  test("RequestCertificate", async () => {
    const res = await acm.send(new RequestCertificateCommand({
      DomainName: "example.com",
      SubjectAlternativeNames: ["example.com", "*.example.com"],
      ValidationMethod: "DNS",
    }));
    certArn = res.CertificateArn!;
    expect(certArn).toBeDefined();
    expect(certArn).toContain("acm");
  });

  test("DescribeCertificate", async () => {
    const res = await acm.send(new DescribeCertificateCommand({
      CertificateArn: certArn,
    }));
    const cert = res.Certificate!;
    expect(cert.CertificateArn).toBe(certArn);
    expect(cert.DomainName).toBe("example.com");
    expect(cert.SubjectAlternativeNames).toContain("example.com");
    expect(cert.SubjectAlternativeNames).toContain("*.example.com");
    expect(cert.Status).toBe("ISSUED");
    expect(cert.Type).toBe("AMAZON_ISSUED");
    expect(cert.DomainValidationOptions).toBeDefined();
    expect(cert.DomainValidationOptions!.length).toBeGreaterThanOrEqual(1);
  });

  test("ListCertificates", async () => {
    const res = await acm.send(new ListCertificatesCommand({}));
    expect(res.CertificateSummaryList).toBeDefined();
    expect(res.CertificateSummaryList!.length).toBeGreaterThanOrEqual(1);
    const found = res.CertificateSummaryList!.find((c) => c.CertificateArn === certArn);
    expect(found).toBeDefined();
    expect(found!.DomainName).toBe("example.com");
    expect(found!.Status).toBe("ISSUED");
  });

  test("RequestCertificate - with defaults", async () => {
    const res = await acm.send(new RequestCertificateCommand({
      DomainName: "other.com",
    }));
    const arn = res.CertificateArn!;
    expect(arn).toBeDefined();

    const desc = await acm.send(new DescribeCertificateCommand({ CertificateArn: arn }));
    expect(desc.Certificate!.DomainName).toBe("other.com");
    // domain should be in SANs by default
    expect(desc.Certificate!.SubjectAlternativeNames).toContain("other.com");

    // clean up
    await acm.send(new DeleteCertificateCommand({ CertificateArn: arn }));
  });

  // --- Tags ---

  test("AddTagsToCertificate", async () => {
    await acm.send(new AddTagsToCertificateCommand({
      CertificateArn: certArn,
      Tags: [
        { Key: "env", Value: "test" },
        { Key: "team", Value: "platform" },
      ],
    }));
    // No error means success
  });

  test("ListTagsForCertificate", async () => {
    const res = await acm.send(new ListTagsForCertificateCommand({
      CertificateArn: certArn,
    }));
    expect(res.Tags).toBeDefined();
    const envTag = res.Tags!.find((t) => t.Key === "env");
    expect(envTag?.Value).toBe("test");
    const teamTag = res.Tags!.find((t) => t.Key === "team");
    expect(teamTag?.Value).toBe("platform");
  });

  test("RemoveTagsFromCertificate", async () => {
    await acm.send(new RemoveTagsFromCertificateCommand({
      CertificateArn: certArn,
      Tags: [{ Key: "team" }],
    }));
    const res = await acm.send(new ListTagsForCertificateCommand({
      CertificateArn: certArn,
    }));
    expect(res.Tags!.find((t) => t.Key === "team")).toBeUndefined();
    expect(res.Tags!.find((t) => t.Key === "env")).toBeDefined();
  });

  test("AddTagsToCertificate - update existing tag", async () => {
    await acm.send(new AddTagsToCertificateCommand({
      CertificateArn: certArn,
      Tags: [{ Key: "env", Value: "production" }],
    }));
    const res = await acm.send(new ListTagsForCertificateCommand({
      CertificateArn: certArn,
    }));
    const envTag = res.Tags!.find((t) => t.Key === "env");
    expect(envTag?.Value).toBe("production");
  });

  // --- Cleanup ---

  test("DeleteCertificate", async () => {
    await acm.send(new DeleteCertificateCommand({ CertificateArn: certArn }));
    // Verify it's gone
    const res = await acm.send(new ListCertificatesCommand({}));
    expect(res.CertificateSummaryList!.find((c) => c.CertificateArn === certArn)).toBeUndefined();
  });

  test("DeleteCertificate - not found", async () => {
    await expect(
      acm.send(new DeleteCertificateCommand({
        CertificateArn: "arn:aws:acm:us-east-1:000000000000:certificate/nonexistent",
      })),
    ).rejects.toThrow();
  });

  test("DescribeCertificate - not found", async () => {
    await expect(
      acm.send(new DescribeCertificateCommand({
        CertificateArn: "arn:aws:acm:us-east-1:000000000000:certificate/nonexistent",
      })),
    ).rejects.toThrow();
  });
});
