import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface AssumedRole {
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: string;
  };
  assumedRoleUser: {
    assumedRoleId: string;
    arn: string;
  };
}

export class StsService {
  constructor(
    private defaultAccountId: string,
    private defaultRegion: string,
  ) {}

  getCallerIdentity(region: string): { account: string; arn: string; userId: string } {
    return {
      account: this.defaultAccountId,
      arn: buildArn("iam", "", this.defaultAccountId, "user/", "default"),
      userId: "AIDAEXAMPLEID",
    };
  }

  assumeRole(roleArn: string, roleSessionName: string, durationSeconds: number, region: string): AssumedRole {
    const expiration = new Date(Date.now() + (durationSeconds || 3600) * 1000).toISOString();
    const sessionId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    return {
      credentials: {
        accessKeyId: `ASIA${sessionId.toUpperCase()}`,
        secretAccessKey: crypto.randomUUID(),
        sessionToken: `FwoGZXIv${Buffer.from(crypto.randomUUID()).toString("base64")}`,
        expiration,
      },
      assumedRoleUser: {
        assumedRoleId: `AROA${sessionId.toUpperCase()}:${roleSessionName}`,
        arn: `${roleArn.replace(":role/", ":assumed-role/")}/${roleSessionName}`,
      },
    };
  }

  getSessionToken(durationSeconds: number): AssumedRole["credentials"] {
    const sessionId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    return {
      accessKeyId: `ASIA${sessionId.toUpperCase()}`,
      secretAccessKey: crypto.randomUUID(),
      sessionToken: `FwoGZXIv${Buffer.from(crypto.randomUUID()).toString("base64")}`,
      expiration: new Date(Date.now() + (durationSeconds || 3600) * 1000).toISOString(),
    };
  }

  assumeRoleWithWebIdentity(
    roleArn: string,
    roleSessionName: string,
    webIdentityToken: string,
    durationSeconds: number,
    region: string,
  ): AssumedRole & { subjectFromWebIdentityToken: string } {
    const role = this.assumeRole(roleArn, roleSessionName, durationSeconds, region);
    return {
      ...role,
      subjectFromWebIdentityToken: Buffer.from(webIdentityToken).toString("base64url").slice(0, 32),
    };
  }

  assumeRoleWithSAML(
    roleArn: string,
    principalArn: string,
    samlAssertion: string,
    durationSeconds: number,
    region: string,
  ): AssumedRole {
    return this.assumeRole(roleArn, `saml-session-${Date.now()}`, durationSeconds, region);
  }

  getAccessKeyInfo(accessKeyId: string): { account: string } {
    return { account: this.defaultAccountId };
  }
}
