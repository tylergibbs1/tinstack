export class AwsError extends Error {
  deleteMarker?: boolean;
  versionId?: string;

  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "AwsError";
  }
}

export function jsonErrorResponse(err: AwsError, requestId: string): Response {
  return new Response(
    JSON.stringify({ __type: err.code, message: err.message }),
    {
      status: err.statusCode,
      headers: {
        "Content-Type": "application/x-amz-json-1.0",
        "x-amzn-RequestId": requestId,
      },
    },
  );
}

export function xmlErrorResponse(err: AwsError, requestId: string, extraHeaders?: Record<string, string>): Response {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<ErrorResponse>
  <Error>
    <Code>${escapeXml(err.code)}</Code>
    <Message>${escapeXml(err.message)}</Message>
  </Error>
  <RequestId>${requestId}</RequestId>
</ErrorResponse>`;
  return new Response(body, {
    status: err.statusCode,
    headers: { "Content-Type": "application/xml", "x-amzn-RequestId": requestId, ...extraHeaders },
  });
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
