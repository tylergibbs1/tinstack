import { escapeXml } from "./errors";

export class XmlBuilder {
  private parts: string[] = [];

  start(tag: string, attrs?: Record<string, string>): this {
    let s = `<${tag}`;
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        s += ` ${k}="${escapeXml(v)}"`;
      }
    }
    s += ">";
    this.parts.push(s);
    return this;
  }

  end(tag: string): this {
    this.parts.push(`</${tag}>`);
    return this;
  }

  elem(tag: string, value: string | number | boolean): this {
    this.parts.push(`<${tag}>${escapeXml(String(value))}</${tag}>`);
    return this;
  }

  raw(xml: string): this {
    this.parts.push(xml);
    return this;
  }

  build(): string {
    return this.parts.join("");
  }
}

export function responseMetadata(requestId: string): string {
  return `<ResponseMetadata><RequestId>${requestId}</RequestId></ResponseMetadata>`;
}

export function xmlEnvelope(action: string, requestId: string, result: string, xmlns?: string): string {
  const ns = xmlns ? ` xmlns="${xmlns}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><${action}Response${ns}><${action}Result>${result}</${action}Result>${responseMetadata(requestId)}</${action}Response>`;
}

export function xmlEnvelopeNoResult(action: string, requestId: string, xmlns?: string): string {
  const ns = xmlns ? ` xmlns="${xmlns}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><${action}Response${ns}>${responseMetadata(requestId)}</${action}Response>`;
}

export function xmlResponse(body: string, requestId: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml",
      "x-amzn-RequestId": requestId,
    },
  });
}

export const AWS_NAMESPACES = {
  SQS: "https://sqs.amazonaws.com/doc/2012-11-05/",
  SNS: "http://sns.amazonaws.com/doc/2010-03-31/",
  IAM: "https://iam.amazonaws.com/doc/2010-05-08/",
  STS: "https://sts.amazonaws.com/doc/2011-06-15/",
  RDS: "http://rds.amazonaws.com/doc/2014-10-31/",
} as const;
