import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Certificate {
  certificateArn: string;
  domainName: string;
  subjectAlternativeNames: string[];
  status: string;
  type: string;
  validationMethod: string;
  createdAt: number;
  issuedAt: number;
  tags: { Key: string; Value: string }[];
}

export class AcmService {
  private certs: StorageBackend<string, Certificate>;

  constructor(private accountId: string) {
    this.certs = new InMemoryStorage();
  }

  requestCertificate(
    domainName: string,
    subjectAlternativeNames: string[] | undefined,
    validationMethod: string | undefined,
    region: string,
  ): string {
    const certId = crypto.randomUUID();
    const arn = buildArn("acm", region, this.accountId, "certificate/", certId);
    const sans = subjectAlternativeNames ?? [domainName];
    if (!sans.includes(domainName)) sans.unshift(domainName);

    const cert: Certificate = {
      certificateArn: arn,
      domainName,
      subjectAlternativeNames: sans,
      status: "ISSUED",
      type: "AMAZON_ISSUED",
      validationMethod: validationMethod ?? "DNS",
      createdAt: Date.now() / 1000,
      issuedAt: Date.now() / 1000,
      tags: [],
    };
    this.certs.set(arn, cert);
    return arn;
  }

  describeCertificate(arn: string): Certificate {
    const cert = this.certs.get(arn);
    if (!cert) throw new AwsError("ResourceNotFoundException", `Certificate ${arn} not found.`, 400);
    return cert;
  }

  listCertificates(region: string): Certificate[] {
    return this.certs.values().filter((c) => c.certificateArn.includes(`:${region}:`));
  }

  deleteCertificate(arn: string): void {
    if (!this.certs.get(arn)) {
      throw new AwsError("ResourceNotFoundException", `Certificate ${arn} not found.`, 400);
    }
    this.certs.delete(arn);
  }

  listTagsForCertificate(arn: string): { Key: string; Value: string }[] {
    const cert = this.describeCertificate(arn);
    return cert.tags;
  }

  addTagsToCertificate(arn: string, tags: { Key: string; Value: string }[]): void {
    const cert = this.describeCertificate(arn);
    for (const tag of tags) {
      const existing = cert.tags.find((t) => t.Key === tag.Key);
      if (existing) {
        existing.Value = tag.Value;
      } else {
        cert.tags.push(tag);
      }
    }
  }

  removeTagsFromCertificate(arn: string, tags: { Key: string; Value?: string }[]): void {
    const cert = this.describeCertificate(arn);
    const keysToRemove = new Set(tags.map((t) => t.Key));
    cert.tags = cert.tags.filter((t) => !keysToRemove.has(t.Key));
  }
}
