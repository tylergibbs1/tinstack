import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { AcmService } from "./acm-service";

export class AcmHandler {
  constructor(private service: AcmService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "RequestCertificate":
          return this.requestCertificate(body, ctx);
        case "DescribeCertificate":
          return this.describeCertificate(body, ctx);
        case "ListCertificates":
          return this.listCertificates(ctx);
        case "DeleteCertificate":
          this.service.deleteCertificate(body.CertificateArn);
          return this.json({}, ctx);
        case "ListTagsForCertificate":
          return this.listTagsForCertificate(body, ctx);
        case "AddTagsToCertificate":
          this.service.addTagsToCertificate(body.CertificateArn, body.Tags ?? []);
          return this.json({}, ctx);
        case "RemoveTagsFromCertificate":
          this.service.removeTagsFromCertificate(body.CertificateArn, body.Tags ?? []);
          return this.json({}, ctx);
        default:
          return jsonErrorResponse(
            new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400),
            ctx.requestId,
          );
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private requestCertificate(body: any, ctx: RequestContext): Response {
    const arn = this.service.requestCertificate(
      body.DomainName,
      body.SubjectAlternativeNames,
      body.ValidationMethod,
      ctx.region,
    );
    return this.json({ CertificateArn: arn }, ctx);
  }

  private describeCertificate(body: any, ctx: RequestContext): Response {
    const cert = this.service.describeCertificate(body.CertificateArn);
    return this.json({
      Certificate: {
        CertificateArn: cert.certificateArn,
        DomainName: cert.domainName,
        SubjectAlternativeNames: cert.subjectAlternativeNames,
        Status: cert.status,
        Type: cert.type,
        CreatedAt: cert.createdAt,
        IssuedAt: cert.issuedAt,
        DomainValidationOptions: cert.subjectAlternativeNames.map((domain) => ({
          DomainName: domain,
          ValidationDomain: domain,
          ValidationStatus: "SUCCESS",
          ValidationMethod: cert.validationMethod,
        })),
        KeyAlgorithm: "RSA_2048",
        SignatureAlgorithm: "SHA256WITHRSA",
        InUseBy: [],
        RenewalEligibility: "ELIGIBLE",
      },
    }, ctx);
  }

  private listCertificates(ctx: RequestContext): Response {
    const certs = this.service.listCertificates(ctx.region);
    return this.json({
      CertificateSummaryList: certs.map((c) => ({
        CertificateArn: c.certificateArn,
        DomainName: c.domainName,
        Status: c.status,
        Type: c.type,
        CreatedAt: c.createdAt,
        SubjectAlternativeNameSummaries: c.subjectAlternativeNames,
        HasAdditionalSubjectAlternativeNames: false,
        KeyAlgorithm: "RSA_2048",
      })),
    }, ctx);
  }

  private listTagsForCertificate(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTagsForCertificate(body.CertificateArn);
    return this.json({ Tags: tags }, ctx);
  }
}
