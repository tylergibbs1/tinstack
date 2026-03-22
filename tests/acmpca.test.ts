import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ACMPCAClient,
  CreateCertificateAuthorityCommand,
  DescribeCertificateAuthorityCommand,
  ListCertificateAuthoritiesCommand,
  UpdateCertificateAuthorityCommand,
  DeleteCertificateAuthorityCommand,
  IssueCertificateCommand,
  GetCertificateCommand,
  ImportCertificateAuthorityCertificateCommand,
  TagCertificateAuthorityCommand,
  UntagCertificateAuthorityCommand,
  ListTagsCommand,
} from "@aws-sdk/client-acm-pca";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ACMPCAClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("ACM PCA", () => {
  let caArn: string;
  let certArn: string;

  test("CreateCertificateAuthority", async () => {
    const res = await client.send(new CreateCertificateAuthorityCommand({
      CertificateAuthorityConfiguration: {
        KeyAlgorithm: "RSA_2048",
        SigningAlgorithm: "SHA256WITHRSA",
        Subject: {
          CommonName: "Test Root CA",
          Organization: "Test Org",
          Country: "US",
        },
      },
      CertificateAuthorityType: "ROOT",
      RevocationConfiguration: {
        CrlConfiguration: { Enabled: false },
      },
    }));
    expect(res.CertificateAuthorityArn).toBeDefined();
    expect(res.CertificateAuthorityArn).toContain("acm-pca");
    caArn = res.CertificateAuthorityArn!;
  });

  test("DescribeCertificateAuthority", async () => {
    const res = await client.send(new DescribeCertificateAuthorityCommand({
      CertificateAuthorityArn: caArn,
    }));
    expect(res.CertificateAuthority).toBeDefined();
    expect(res.CertificateAuthority!.Arn).toBe(caArn);
    expect(res.CertificateAuthority!.Type).toBe("ROOT");
    expect(res.CertificateAuthority!.Status).toBe("PENDING_CERTIFICATE");
  });

  test("ListCertificateAuthorities", async () => {
    const res = await client.send(new ListCertificateAuthoritiesCommand({}));
    expect(res.CertificateAuthorities).toBeDefined();
    expect(res.CertificateAuthorities!.length).toBeGreaterThanOrEqual(1);
    const found = res.CertificateAuthorities!.find((ca) => ca.Arn === caArn);
    expect(found).toBeDefined();
  });

  test("ImportCertificateAuthorityCertificate", async () => {
    const mockCert = "-----BEGIN CERTIFICATE-----\nMIICMockCert\n-----END CERTIFICATE-----";
    await client.send(new ImportCertificateAuthorityCertificateCommand({
      CertificateAuthorityArn: caArn,
      Certificate: new TextEncoder().encode(mockCert),
    }));

    const res = await client.send(new DescribeCertificateAuthorityCommand({
      CertificateAuthorityArn: caArn,
    }));
    expect(res.CertificateAuthority!.Status).toBe("ACTIVE");
  });

  test("IssueCertificate", async () => {
    const res = await client.send(new IssueCertificateCommand({
      CertificateAuthorityArn: caArn,
      Csr: new TextEncoder().encode("-----BEGIN CERTIFICATE REQUEST-----\nMock\n-----END CERTIFICATE REQUEST-----"),
      SigningAlgorithm: "SHA256WITHRSA",
      Validity: { Value: 365, Type: "DAYS" },
    }));
    expect(res.CertificateArn).toBeDefined();
    certArn = res.CertificateArn!;
  });

  test("GetCertificate", async () => {
    const res = await client.send(new GetCertificateCommand({
      CertificateAuthorityArn: caArn,
      CertificateArn: certArn,
    }));
    expect(res.Certificate).toBeDefined();
    expect(res.CertificateChain).toBeDefined();
  });

  test("TagCertificateAuthority", async () => {
    await client.send(new TagCertificateAuthorityCommand({
      CertificateAuthorityArn: caArn,
      Tags: [
        { Key: "env", Value: "test" },
        { Key: "team", Value: "platform" },
      ],
    }));
  });

  test("ListTags", async () => {
    const res = await client.send(new ListTagsCommand({
      CertificateAuthorityArn: caArn,
    }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.find((t) => t.Key === "env")?.Value).toBe("test");
    expect(res.Tags!.find((t) => t.Key === "team")?.Value).toBe("platform");
  });

  test("UntagCertificateAuthority", async () => {
    await client.send(new UntagCertificateAuthorityCommand({
      CertificateAuthorityArn: caArn,
      Tags: [{ Key: "team" }],
    }));

    const res = await client.send(new ListTagsCommand({
      CertificateAuthorityArn: caArn,
    }));
    expect(res.Tags!.find((t) => t.Key === "team")).toBeUndefined();
    expect(res.Tags!.find((t) => t.Key === "env")).toBeDefined();
  });

  test("UpdateCertificateAuthority - disable", async () => {
    await client.send(new UpdateCertificateAuthorityCommand({
      CertificateAuthorityArn: caArn,
      Status: "DISABLED",
    }));

    const res = await client.send(new DescribeCertificateAuthorityCommand({
      CertificateAuthorityArn: caArn,
    }));
    expect(res.CertificateAuthority!.Status).toBe("DISABLED");
  });

  test("DeleteCertificateAuthority", async () => {
    await client.send(new DeleteCertificateAuthorityCommand({
      CertificateAuthorityArn: caArn,
    }));

    const res = await client.send(new DescribeCertificateAuthorityCommand({
      CertificateAuthorityArn: caArn,
    }));
    expect(res.CertificateAuthority!.Status).toBe("DELETED");
  });

  test("DeleteCertificateAuthority - active CA should fail", async () => {
    const createRes = await client.send(new CreateCertificateAuthorityCommand({
      CertificateAuthorityConfiguration: {
        KeyAlgorithm: "RSA_2048",
        SigningAlgorithm: "SHA256WITHRSA",
        Subject: { CommonName: "Active CA" },
      },
      CertificateAuthorityType: "ROOT",
    }));
    const activeArn = createRes.CertificateAuthorityArn!;

    // Import cert to make it ACTIVE
    await client.send(new ImportCertificateAuthorityCertificateCommand({
      CertificateAuthorityArn: activeArn,
      Certificate: new TextEncoder().encode("-----BEGIN CERTIFICATE-----\nMock\n-----END CERTIFICATE-----"),
    }));

    // Try to delete an active CA - should fail
    await expect(
      client.send(new DeleteCertificateAuthorityCommand({
        CertificateAuthorityArn: activeArn,
      })),
    ).rejects.toThrow();

    // Disable and then delete
    await client.send(new UpdateCertificateAuthorityCommand({
      CertificateAuthorityArn: activeArn,
      Status: "DISABLED",
    }));
    await client.send(new DeleteCertificateAuthorityCommand({
      CertificateAuthorityArn: activeArn,
    }));
  });

  test("DescribeCertificateAuthority - not found", async () => {
    await expect(
      client.send(new DescribeCertificateAuthorityCommand({
        CertificateAuthorityArn: "arn:aws:acm-pca:us-east-1:000000000000:certificate-authority/nonexistent",
      })),
    ).rejects.toThrow();
  });
});
