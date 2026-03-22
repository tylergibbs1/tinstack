import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { SecretsManagerService } from "./secrets-service";

export class SecretsManagerHandler {
  constructor(private service: SecretsManagerService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateSecret":
          return this.createSecret(body, ctx);
        case "GetSecretValue":
          return this.getSecretValue(body, ctx);
        case "UpdateSecret":
          return this.updateSecret(body, ctx);
        case "PutSecretValue":
          return this.putSecretValue(body, ctx);
        case "DeleteSecret":
          return this.deleteSecret(body, ctx);
        case "RestoreSecret":
          return this.restoreSecret(body, ctx);
        case "ListSecrets":
          return this.listSecrets(body, ctx);
        case "DescribeSecret":
          return this.describeSecret(body, ctx);
        case "ListSecretVersionIds":
          return this.listSecretVersionIds(body, ctx);
        case "TagResource":
          return this.tagResource(body, ctx);
        case "UntagResource":
          return this.untagResource(body, ctx);
        case "GetRandomPassword":
          return this.getRandomPassword(body, ctx);
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

  private createSecret(body: any, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    if (body.Tags) for (const t of body.Tags) tags[t.Key] = t.Value;
    const secret = this.service.createSecret(
      body.Name, body.SecretString, body.SecretBinary,
      body.Description, body.KmsKeyId, tags, ctx.region,
    );
    return this.json({
      ARN: secret.arn,
      Name: secret.name,
      VersionId: secret.currentVersionId,
    }, ctx);
  }

  private getSecretValue(body: any, ctx: RequestContext): Response {
    const { secret, version } = this.service.getSecretValue(
      body.SecretId, body.VersionId, body.VersionStage, ctx.region,
    );
    return this.json({
      ARN: secret.arn,
      Name: secret.name,
      VersionId: version.versionId,
      SecretString: version.secretString,
      SecretBinary: version.secretBinary,
      VersionStages: version.versionStages,
      CreatedDate: version.createdDate,
    }, ctx);
  }

  private updateSecret(body: any, ctx: RequestContext): Response {
    const secret = this.service.updateSecret(
      body.SecretId, body.SecretString, body.SecretBinary, body.Description, ctx.region,
    );
    return this.json({
      ARN: secret.arn,
      Name: secret.name,
      VersionId: secret.currentVersionId,
    }, ctx);
  }

  private putSecretValue(body: any, ctx: RequestContext): Response {
    const { secret, versionId } = this.service.putSecretValue(
      body.SecretId, body.SecretString, body.SecretBinary, body.VersionStages, ctx.region,
    );
    return this.json({
      ARN: secret.arn,
      Name: secret.name,
      VersionId: versionId,
      VersionStages: body.VersionStages ?? ["AWSCURRENT"],
    }, ctx);
  }

  private deleteSecret(body: any, ctx: RequestContext): Response {
    const secret = this.service.deleteSecret(
      body.SecretId, body.RecoveryWindowInDays, body.ForceDeleteWithoutRecovery ?? false, ctx.region,
    );
    return this.json({
      ARN: secret.arn,
      Name: secret.name,
      DeletionDate: secret.deletedDate,
    }, ctx);
  }

  private restoreSecret(body: any, ctx: RequestContext): Response {
    const secret = this.service.restoreSecret(body.SecretId, ctx.region);
    return this.json({ ARN: secret.arn, Name: secret.name }, ctx);
  }

  private listSecrets(body: any, ctx: RequestContext): Response {
    const result = this.service.listSecrets(ctx.region, body.MaxResults, body.Filters);
    return this.json({
      SecretList: result.secrets.map((s) => ({
        ARN: s.arn,
        Name: s.name,
        Description: s.description,
        KmsKeyId: s.kmsKeyId,
        LastChangedDate: s.lastChangedDate,
        LastAccessedDate: s.lastAccessedDate,
        CreatedDate: s.createdDate,
        DeletedDate: s.deletedDate,
        Tags: Object.entries(s.tags).map(([Key, Value]) => ({ Key, Value })),
      })),
      NextToken: result.nextToken,
    }, ctx);
  }

  private describeSecret(body: any, ctx: RequestContext): Response {
    const secret = this.service.describeSecret(body.SecretId, ctx.region);
    const versionIdsToStages: Record<string, string[]> = {};
    for (const v of secret.versions.values()) {
      versionIdsToStages[v.versionId] = v.versionStages;
    }
    return this.json({
      ARN: secret.arn,
      Name: secret.name,
      Description: secret.description,
      KmsKeyId: secret.kmsKeyId,
      LastChangedDate: secret.lastChangedDate,
      LastAccessedDate: secret.lastAccessedDate,
      CreatedDate: secret.createdDate,
      DeletedDate: secret.deletedDate,
      Tags: Object.entries(secret.tags).map(([Key, Value]) => ({ Key, Value })),
      VersionIdsToStages: versionIdsToStages,
    }, ctx);
  }

  private listSecretVersionIds(body: any, ctx: RequestContext): Response {
    const versions = this.service.listSecretVersionIds(body.SecretId, ctx.region);
    const secret = this.service.describeSecret(body.SecretId, ctx.region);
    return this.json({
      ARN: secret.arn,
      Name: secret.name,
      Versions: versions.map((v) => ({
        VersionId: v.versionId,
        VersionStages: v.versionStages,
        CreatedDate: v.createdDate,
      })),
    }, ctx);
  }

  private tagResource(body: any, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    for (const t of body.Tags ?? []) tags[t.Key] = t.Value;
    this.service.tagResource(body.SecretId, tags, ctx.region);
    return this.json({}, ctx);
  }

  private untagResource(body: any, ctx: RequestContext): Response {
    this.service.untagResource(body.SecretId, body.TagKeys ?? [], ctx.region);
    return this.json({}, ctx);
  }

  private getRandomPassword(body: any, ctx: RequestContext): Response {
    const password = this.service.getRandomPassword(
      body.PasswordLength ?? 32,
      body.ExcludeCharacters ?? "",
      body.ExcludeNumbers ?? false,
      body.ExcludePunctuation ?? false,
      body.ExcludeUppercase ?? false,
      body.ExcludeLowercase ?? false,
      body.IncludeSpace ?? false,
    );
    return this.json({ RandomPassword: password }, ctx);
  }
}
