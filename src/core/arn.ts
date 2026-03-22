export function buildArn(
  service: string,
  region: string,
  accountId: string,
  resourceType: string,
  resourceId: string,
): string {
  return `arn:aws:${service}:${region}:${accountId}:${resourceType}${resourceId}`;
}

export function parseArn(arn: string) {
  const parts = arn.split(":");
  return {
    partition: parts[1],
    service: parts[2],
    region: parts[3],
    accountId: parts[4],
    resource: parts.slice(5).join(":"),
  };
}
