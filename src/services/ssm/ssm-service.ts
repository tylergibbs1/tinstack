import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface SsmParameter {
  name: string;
  value: string;
  type: "String" | "StringList" | "SecureString";
  description?: string;
  arn: string;
  version: number;
  lastModifiedDate: number;
  dataType: string;
  tags: Record<string, string>;
}

interface ParameterHistory {
  name: string;
  value: string;
  type: string;
  version: number;
  lastModifiedDate: number;
  description?: string;
}

export class SsmService {
  private params: StorageBackend<string, SsmParameter>;
  private history: StorageBackend<string, ParameterHistory[]>;

  constructor(private accountId: string) {
    this.params = new InMemoryStorage();
    this.history = new InMemoryStorage();
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  putParameter(name: string, value: string, type: string, description: string | undefined, overwrite: boolean, tags: Record<string, string>, region: string): { version: number; tier: string } {
    const key = this.regionKey(region, name);
    const existing = this.params.get(key);

    if (existing && !overwrite) {
      throw new AwsError("ParameterAlreadyExists", `The parameter already exists. To overwrite this value, set the overwrite option in the request to true.`, 400);
    }

    const version = (existing?.version ?? 0) + 1;
    const param: SsmParameter = {
      name,
      value,
      type: (type as SsmParameter["type"]) ?? "String",
      description,
      arn: buildArn("ssm", region, this.accountId, "parameter", name),
      version,
      lastModifiedDate: Date.now() / 1000,
      dataType: "text",
      tags: existing?.tags ?? tags,
    };

    this.params.set(key, param);

    const histKey = this.regionKey(region, name);
    const hist = this.history.get(histKey) ?? [];
    hist.push({ name, value, type: param.type, version, lastModifiedDate: param.lastModifiedDate, description });
    this.history.set(histKey, hist);

    return { version, tier: "Standard" };
  }

  getParameter(name: string, withDecryption: boolean, region: string): SsmParameter {
    const key = this.regionKey(region, name);
    const param = this.params.get(key);
    if (!param) throw new AwsError("ParameterNotFound", `Parameter ${name} not found.`, 400);
    return param;
  }

  getParameters(names: string[], region: string): { parameters: SsmParameter[]; invalidParameters: string[] } {
    const parameters: SsmParameter[] = [];
    const invalidParameters: string[] = [];
    for (const name of names) {
      const key = this.regionKey(region, name);
      const param = this.params.get(key);
      if (param) parameters.push(param);
      else invalidParameters.push(name);
    }
    return { parameters, invalidParameters };
  }

  getParametersByPath(path: string, recursive: boolean, region: string, maxResults?: number): { parameters: SsmParameter[]; nextToken?: string } {
    const prefix = path.endsWith("/") ? path : path + "/";
    const allParams = this.params.values().filter((p) => {
      const k = this.regionKey(region, p.name);
      if (!this.params.has(k)) return false;
      if (!p.name.startsWith(prefix)) return false;
      if (!recursive) {
        const rest = p.name.slice(prefix.length);
        if (rest.includes("/")) return false;
      }
      return true;
    });

    const limit = maxResults ?? 10;
    return {
      parameters: allParams.slice(0, limit),
      nextToken: allParams.length > limit ? String(limit) : undefined,
    };
  }

  deleteParameter(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.params.has(key)) throw new AwsError("ParameterNotFound", `Parameter ${name} not found.`, 400);
    this.params.delete(key);
  }

  deleteParameters(names: string[], region: string): { deletedParameters: string[]; invalidParameters: string[] } {
    const deleted: string[] = [];
    const invalid: string[] = [];
    for (const name of names) {
      const key = this.regionKey(region, name);
      if (this.params.has(key)) {
        this.params.delete(key);
        deleted.push(name);
      } else {
        invalid.push(name);
      }
    }
    return { deletedParameters: deleted, invalidParameters: invalid };
  }

  describeParameters(region: string, filters?: any[], maxResults?: number): { parameters: any[]; nextToken?: string } {
    const allParams = this.params.values().filter((p) => {
      return this.params.has(this.regionKey(region, p.name));
    });

    const result = allParams.map((p) => ({
      Name: p.name,
      Type: p.type,
      Description: p.description,
      Version: p.version,
      LastModifiedDate: p.lastModifiedDate,
      ARN: p.arn,
      DataType: p.dataType,
    }));

    const limit = maxResults ?? 50;
    return {
      parameters: result.slice(0, limit),
      nextToken: result.length > limit ? String(limit) : undefined,
    };
  }

  getParameterHistory(name: string, region: string): ParameterHistory[] {
    const key = this.regionKey(region, name);
    return this.history.get(key) ?? [];
  }

  addTagsToResource(resourceId: string, tags: Record<string, string>, region: string): void {
    const key = this.regionKey(region, resourceId);
    const param = this.params.get(key);
    if (!param) throw new AwsError("InvalidResourceId", `Resource ${resourceId} not found.`, 400);
    Object.assign(param.tags, tags);
  }

  listTagsForResource(resourceId: string, region: string): Record<string, string> {
    const key = this.regionKey(region, resourceId);
    const param = this.params.get(key);
    if (!param) throw new AwsError("InvalidResourceId", `Resource ${resourceId} not found.`, 400);
    return param.tags;
  }
}
