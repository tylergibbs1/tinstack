import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface CertificateAuthority {
  arn: string;
  type: string;
  status: string;
  certificateAuthorityConfiguration: {
    KeyAlgorithm: string;
    SigningAlgorithm: string;
    Subject: Record<string, string>;
  };
  revocationConfiguration: {
    CrlConfiguration: { Enabled: boolean; ExpirationInDays?: number; S3BucketName?: string };
    OcspConfiguration?: { Enabled: boolean };
  };
  createdAt: number;
  lastStateChangeAt: number;
  serialNumber?: string;
  tags: { Key: string; Value: string }[];
  issuedCertificates: Map<string, { certificateArn: string; certificate: string; chain: string; status: string; revokedAt?: number; revocationReason?: string }>;
  caCertificate?: string;
  caCertificateChain?: string;
}

export class AcmPcaService {
  private cas: StorageBackend<string, CertificateAuthority>;

  constructor(private accountId: string) {
    this.cas = new InMemoryStorage();
  }

  createCertificateAuthority(body: any, region: string): string {
    const caId = crypto.randomUUID();
    const arn = buildArn("acm-pca", region, this.accountId, "certificate-authority/", caId);

    const caConfig = body.CertificateAuthorityConfiguration ?? {
      KeyAlgorithm: "RSA_2048",
      SigningAlgorithm: "SHA256WITHRSA",
      Subject: { CommonName: "Test CA" },
    };

    const ca: CertificateAuthority = {
      arn,
      type: body.CertificateAuthorityType ?? "ROOT",
      status: "PENDING_CERTIFICATE",
      certificateAuthorityConfiguration: caConfig,
      revocationConfiguration: body.RevocationConfiguration ?? {
        CrlConfiguration: { Enabled: false },
      },
      createdAt: Date.now() / 1000,
      lastStateChangeAt: Date.now() / 1000,
      tags: body.Tags ?? [],
      issuedCertificates: new Map(),
    };

    this.cas.set(arn, ca);
    return arn;
  }

  describeCertificateAuthority(arn: string): CertificateAuthority {
    const ca = this.cas.get(arn);
    if (!ca) throw new AwsError("ResourceNotFoundException", `Certificate authority ${arn} not found.`, 400);
    return ca;
  }

  listCertificateAuthorities(): CertificateAuthority[] {
    return this.cas.values();
  }

  deleteCertificateAuthority(arn: string): void {
    const ca = this.cas.get(arn);
    if (!ca) throw new AwsError("ResourceNotFoundException", `Certificate authority ${arn} not found.`, 400);
    if (ca.status === "ACTIVE") {
      throw new AwsError("InvalidStateException", "Cannot delete an active certificate authority. Disable it first.", 409);
    }
    ca.status = "DELETED";
    ca.lastStateChangeAt = Date.now() / 1000;
    this.cas.set(arn, ca);
  }

  updateCertificateAuthority(arn: string, body: any): void {
    const ca = this.cas.get(arn);
    if (!ca) throw new AwsError("ResourceNotFoundException", `Certificate authority ${arn} not found.`, 400);

    if (body.RevocationConfiguration !== undefined) {
      ca.revocationConfiguration = body.RevocationConfiguration;
    }
    if (body.Status !== undefined) {
      ca.status = body.Status;
    }
    ca.lastStateChangeAt = Date.now() / 1000;
    this.cas.set(arn, ca);
  }

  issueCertificate(body: any, region: string): string {
    const caArn = body.CertificateAuthorityArn;
    const ca = this.cas.get(caArn);
    if (!ca) throw new AwsError("ResourceNotFoundException", `Certificate authority ${caArn} not found.`, 400);

    const certId = crypto.randomUUID();
    const certArn = buildArn("acm-pca", region, this.accountId, "certificate-authority/", `${caArn.split("/").pop()}/certificate/${certId}`);

    // Generate a mock PEM certificate
    const mockCert = `-----BEGIN CERTIFICATE-----\nMIICMock${Buffer.from(certId).toString("base64").slice(0, 40)}\n-----END CERTIFICATE-----`;
    const mockChain = `-----BEGIN CERTIFICATE-----\nMIICChain${Buffer.from(caArn).toString("base64").slice(0, 40)}\n-----END CERTIFICATE-----`;

    ca.issuedCertificates.set(certArn, {
      certificateArn: certArn,
      certificate: mockCert,
      chain: mockChain,
      status: "ISSUED",
    });
    this.cas.set(caArn, ca);
    return certArn;
  }

  getCertificate(caArn: string, certArn: string): { Certificate: string; CertificateChain: string } {
    const ca = this.cas.get(caArn);
    if (!ca) throw new AwsError("ResourceNotFoundException", `Certificate authority ${caArn} not found.`, 400);

    const cert = ca.issuedCertificates.get(certArn);
    if (!cert) throw new AwsError("ResourceNotFoundException", `Certificate ${certArn} not found.`, 400);
    if (cert.status === "REVOKED") throw new AwsError("ResourceNotFoundException", `Certificate ${certArn} has been revoked.`, 400);

    return { Certificate: cert.certificate, CertificateChain: cert.chain };
  }

  revokeCertificate(caArn: string, certSerial: string, revocationReason: string): void {
    const ca = this.cas.get(caArn);
    if (!ca) throw new AwsError("ResourceNotFoundException", `Certificate authority ${caArn} not found.`, 400);

    // Find by serial or ARN
    for (const [, cert] of ca.issuedCertificates) {
      if (cert.certificateArn.includes(certSerial) || cert.certificateArn === certSerial) {
        cert.status = "REVOKED";
        cert.revokedAt = Date.now() / 1000;
        cert.revocationReason = revocationReason;
        this.cas.set(caArn, ca);
        return;
      }
    }
    throw new AwsError("ResourceNotFoundException", `Certificate with serial ${certSerial} not found.`, 400);
  }

  importCertificateAuthorityCertificate(caArn: string, certificate: string, certificateChain?: string): void {
    const ca = this.cas.get(caArn);
    if (!ca) throw new AwsError("ResourceNotFoundException", `Certificate authority ${caArn} not found.`, 400);

    ca.caCertificate = certificate;
    ca.caCertificateChain = certificateChain;
    ca.status = "ACTIVE";
    ca.lastStateChangeAt = Date.now() / 1000;
    this.cas.set(caArn, ca);
  }

  tagCertificateAuthority(arn: string, tags: { Key: string; Value: string }[]): void {
    const ca = this.cas.get(arn);
    if (!ca) throw new AwsError("ResourceNotFoundException", `Certificate authority ${arn} not found.`, 400);
    for (const tag of tags) {
      const idx = ca.tags.findIndex((t) => t.Key === tag.Key);
      if (idx >= 0) ca.tags[idx] = tag;
      else ca.tags.push(tag);
    }
    this.cas.set(arn, ca);
  }

  untagCertificateAuthority(arn: string, tags: { Key: string; Value?: string }[]): void {
    const ca = this.cas.get(arn);
    if (!ca) throw new AwsError("ResourceNotFoundException", `Certificate authority ${arn} not found.`, 400);
    const keysToRemove = new Set(tags.map((t) => t.Key));
    ca.tags = ca.tags.filter((t) => !keysToRemove.has(t.Key));
    this.cas.set(arn, ca);
  }

  listTags(arn: string): { Key: string; Value: string }[] {
    const ca = this.cas.get(arn);
    if (!ca) throw new AwsError("ResourceNotFoundException", `Certificate authority ${arn} not found.`, 400);
    return ca.tags;
  }

  formatCertificateAuthority(ca: CertificateAuthority): Record<string, any> {
    return {
      Arn: ca.arn,
      Type: ca.type,
      Status: ca.status,
      CertificateAuthorityConfiguration: ca.certificateAuthorityConfiguration,
      RevocationConfiguration: ca.revocationConfiguration,
      CreatedAt: ca.createdAt,
      LastStateChangeAt: ca.lastStateChangeAt,
      Serial: ca.serialNumber,
    };
  }
}
