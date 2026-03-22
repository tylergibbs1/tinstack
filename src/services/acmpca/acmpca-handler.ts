import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { AcmPcaService } from "./acmpca-service";

export class AcmPcaHandler {
  constructor(private service: AcmPcaService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateCertificateAuthority": {
          const arn = this.service.createCertificateAuthority(body, ctx.region);
          return this.json({ CertificateAuthorityArn: arn }, ctx);
        }

        case "DescribeCertificateAuthority": {
          const ca = this.service.describeCertificateAuthority(body.CertificateAuthorityArn);
          return this.json({ CertificateAuthority: this.service.formatCertificateAuthority(ca) }, ctx);
        }

        case "ListCertificateAuthorities": {
          const cas = this.service.listCertificateAuthorities();
          return this.json({ CertificateAuthorities: cas.map((ca) => this.service.formatCertificateAuthority(ca)) }, ctx);
        }

        case "DeleteCertificateAuthority":
          this.service.deleteCertificateAuthority(body.CertificateAuthorityArn);
          return this.json({}, ctx);

        case "UpdateCertificateAuthority":
          this.service.updateCertificateAuthority(body.CertificateAuthorityArn, body);
          return this.json({}, ctx);

        case "IssueCertificate": {
          const certArn = this.service.issueCertificate(body, ctx.region);
          return this.json({ CertificateArn: certArn }, ctx);
        }

        case "GetCertificate": {
          const result = this.service.getCertificate(body.CertificateAuthorityArn, body.CertificateArn);
          return this.json(result, ctx);
        }

        case "RevokeCertificate":
          this.service.revokeCertificate(body.CertificateAuthorityArn, body.CertificateSerial, body.RevocationReason ?? "UNSPECIFIED");
          return this.json({}, ctx);

        case "ImportCertificateAuthorityCertificate":
          this.service.importCertificateAuthorityCertificate(
            body.CertificateAuthorityArn,
            body.Certificate,
            body.CertificateChain,
          );
          return this.json({}, ctx);

        case "TagCertificateAuthority":
          this.service.tagCertificateAuthority(body.CertificateAuthorityArn, body.Tags ?? []);
          return this.json({}, ctx);

        case "UntagCertificateAuthority":
          this.service.untagCertificateAuthority(body.CertificateAuthorityArn, body.Tags ?? []);
          return this.json({}, ctx);

        case "ListTags": {
          const tags = this.service.listTags(body.CertificateAuthorityArn);
          return this.json({ Tags: tags }, ctx);
        }

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
}
