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
    return this.json({ CiphertextBlob: result.ciphertextBlob, KeyId: result.keyId }, ctx);
  }

  private decrypt(body: any, ctx: RequestContext): Response {
    const result = this.service.decrypt(body.CiphertextBlob, ctx.region);
    return this.json({ Plaintext: result.plaintext, KeyId: result.keyId }, ctx);
  }

  private generateDataKey(body: any, ctx: RequestContext): Response {
    const result = this.service.generateDataKey(body.KeyId, body.KeySpec ?? "AES_256", ctx.region);
    return this.json({ CiphertextBlob: result.ciphertextBlob, Plaintext: result.plaintext, KeyId: result.keyId }, ctx);
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
