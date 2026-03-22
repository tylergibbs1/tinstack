export interface RequestContext {
  region: string;
  accountId: string;
  requestId: string;
}

const REGION_RE = /Credential=\w+\/\d{8}\/([^/]+)\//;

export function extractRegion(authorization: string | null, defaultRegion: string): string {
  if (!authorization) return defaultRegion;
  const match = REGION_RE.exec(authorization);
  return match?.[1] ?? defaultRegion;
}

export function createContext(req: Request, defaultRegion: string, defaultAccountId: string): RequestContext {
  return {
    region: extractRegion(req.headers.get("authorization"), defaultRegion),
    accountId: defaultAccountId,
    requestId: crypto.randomUUID(),
  };
}
