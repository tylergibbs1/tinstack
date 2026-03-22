import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { KmsService } from "./kms-service";

export class KmsHandler {
  constructor(private service: KmsService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateKey": return this.createKey(body, ctx);
        case "DescribeKey": return this.describeKey(body, ctx);
        case "ListKeys": return this.listKeys(ctx);
        case "EnableKey": this.service.enableKey(body.KeyId, ctx.region); return this.json({}, ctx);
        case "DisableKey": this.service.disableKey(body.KeyId, ctx.region); return this.json({}, ctx);
        case "ScheduleKeyDeletion": return this.scheduleKeyDeletion(body, ctx);
        case "CreateAlias": this.service.createAlias(body.AliasName, body.TargetKeyId, ctx.region); return this.json({}, ctx);
        case "DeleteAlias": this.service.deleteAlias(body.AliasName, ctx.region); return this.json({}, ctx);
        case "ListAliases": return this.json({
          Aliases: this.service.listAliases(ctx.region).map((a) => ({
            AliasName: a.aliasName, AliasArn: a.aliasArn, TargetKeyId: a.targetKeyId,
          })),
          Truncated: false,
        }, ctx);
        case "Encrypt": return this.encrypt(body, ctx);
        case "Decrypt": return this.decrypt(body, ctx);
        case "GenerateDataKey": return this.generateDataKey(body, ctx);
        case "GetKeyPolicy": return this.getKeyPolicy(body, ctx);
        case "GetKeyRotationStatus": return this.getKeyRotationStatus(body, ctx);
        case "ListResourceTags": return this.listResourceTags(body, ctx);
        case "TagResource":
          this.service.tagResource(body.KeyId, body.Tags ?? [], ctx.region);
          return this.json({}, ctx);
        case "UntagResource":
          this.service.untagResource(body.KeyId, body.TagKeys ?? [], ctx.region);
          return this.json({}, ctx);
        case "EnableKeyRotation":
          this.service.enableKeyRotation(body.KeyId, ctx.region);
          return this.json({}, ctx);
        case "DisableKeyRotation":
          this.service.disableKeyRotation(body.KeyId, ctx.region);
          return this.json({}, ctx);
        case "GenerateRandom":
          return this.json({ Plaintext: this.service.generateRandom(body.NumberOfBytes) }, ctx);
        case "Sign": return this.sign(body, ctx);
        case "Verify": return this.verify(body, ctx);
        case "ReEncrypt": return this.reEncrypt(body, ctx);
        case "CreateGrant": return this.createGrant(body, ctx);
        case "ListGrants": return this.listGrants(body, ctx);
        case "RevokeGrant":
          this.service.revokeGrant(body.KeyId, body.GrantId, ctx.region);
          return this.json({}, ctx);
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
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

  private createKey(body: any, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    if (body.Tags) for (const t of body.Tags) tags[t.TagKey] = t.TagValue;
    const key = this.service.createKey(body.Description, body.KeyUsage, body.KeySpec, tags, ctx.region);
    return this.json({ KeyMetadata: this.keyMeta(key) }, ctx);
  }

  private describeKey(body: any, ctx: RequestContext): Response {
    const key = this.service.describeKey(body.KeyId, ctx.region);
    return this.json({ KeyMetadata: this.keyMeta(key) }, ctx);
  }

  private listKeys(ctx: RequestContext): Response {
    const keys = this.service.listKeys(ctx.region);
    return this.json({
      Keys: keys.map((k) => ({ KeyId: k.keyId, KeyArn: k.arn })),
      Truncated: false,
    }, ctx);
  }

  private scheduleKeyDeletion(body: any, ctx: RequestContext): Response {
    const result = this.service.scheduleKeyDeletion(body.KeyId, body.PendingWindowInDays, ctx.region);
    return this.json({ KeyId: result.keyId, DeletionDate: result.deletionDate, KeyState: "PendingDeletion" }, ctx);
  }

  private encrypt(body: any, ctx: RequestContext): Response {
    const result = this.service.encrypt(body.KeyId, body.Plaintext, ctx.region);
    return this.json({ CiphertextBlob: result.ciphertextBlob, KeyId: result.keyId, EncryptionAlgorithm: "SYMMETRIC_DEFAULT" }, ctx);
  }

  private decrypt(body: any, ctx: RequestContext): Response {
    const result = this.service.decrypt(body.CiphertextBlob, ctx.region);
    return this.json({ Plaintext: result.plaintext, KeyId: result.keyId, EncryptionAlgorithm: "SYMMETRIC_DEFAULT" }, ctx);
  }

  private generateDataKey(body: any, ctx: RequestContext): Response {
    const result = this.service.generateDataKey(body.KeyId, body.KeySpec ?? "AES_256", ctx.region);
    return this.json({ CiphertextBlob: result.ciphertextBlob, Plaintext: result.plaintext, KeyId: result.keyId, EncryptionAlgorithm: "SYMMETRIC_DEFAULT" }, ctx);
  }

  private getKeyPolicy(body: any, ctx: RequestContext): Response {
    const key = this.service.describeKey(body.KeyId, ctx.region);
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Sid: "Enable IAM User Permissions",
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${key.arn.split(":")[4] || "000000000000"}:root` },
        Action: "kms:*",
        Resource: "*",
      }],
    });
    return this.json({ Policy: policy }, ctx);
  }

  private getKeyRotationStatus(body: any, ctx: RequestContext): Response {
    const enabled = this.service.getKeyRotationStatus(body.KeyId, ctx.region);
    return this.json({ KeyRotationEnabled: enabled }, ctx);
  }

  private listResourceTags(body: any, ctx: RequestContext): Response {
    const tags = this.service.listResourceTags(body.KeyId, ctx.region);
    return this.json({ Tags: tags, Truncated: false }, ctx);
  }

  private sign(body: any, ctx: RequestContext): Response {
    const result = this.service.sign(body.KeyId, body.Message, body.SigningAlgorithm, ctx.region);
    return this.json({ Signature: result.signature, KeyId: result.keyId, SigningAlgorithm: result.signingAlgorithm }, ctx);
  }

  private verify(body: any, ctx: RequestContext): Response {
    const result = this.service.verify(body.KeyId, body.Message, body.Signature, body.SigningAlgorithm, ctx.region);
    return this.json({ SignatureValid: result.signatureValid, KeyId: result.keyId, SigningAlgorithm: result.signingAlgorithm }, ctx);
  }

  private reEncrypt(body: any, ctx: RequestContext): Response {
    const result = this.service.reEncrypt(body.CiphertextBlob, body.DestinationKeyId, ctx.region);
    return this.json({ CiphertextBlob: result.ciphertextBlob, SourceKeyId: result.sourceKeyId, KeyId: result.keyId }, ctx);
  }

  private createGrant(body: any, ctx: RequestContext): Response {
    const result = this.service.createGrant(body.KeyId, body.GranteePrincipal, body.Operations ?? [], body.RetiringPrincipal, body.Name, ctx.region);
    return this.json({ GrantId: result.grantId, GrantToken: result.grantToken }, ctx);
  }

  private listGrants(body: any, ctx: RequestContext): Response {
    const grants = this.service.listGrants(body.KeyId, ctx.region);
    return this.json({
      Grants: grants.map((g) => ({
        GrantId: g.grantId, KeyId: g.keyId,
        GranteePrincipal: g.granteePrincipal, RetiringPrincipal: g.retiringPrincipal,
        Operations: g.operations, CreationDate: g.creationDate, Name: g.name,
      })),
      Truncated: false,
    }, ctx);
  }

  private keyMeta(key: any): any {
    return {
      KeyId: key.keyId, Arn: key.arn, Description: key.description,
      KeyState: key.keyState, KeyUsage: key.keyUsage, KeySpec: key.keySpec,
      CreationDate: key.creationDate, Enabled: key.enabled,
      KeyManager: "CUSTOMER", Origin: "AWS_KMS",
    };
  }
}
