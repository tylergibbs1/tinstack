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

export interface SsmDocument {
  name: string;
  content: string;
  documentType: string;
  documentFormat: string;
  description?: string;
  version: string;
  createdDate: number;
  status: string;
  tags: Record<string, string>;
  arn: string;
}

export interface SsmCommand {
  commandId: string;
  documentName: string;
  instanceIds: string[];
  parameters: Record<string, string[]>;
  comment?: string;
  timeoutSeconds?: number;
  status: string;
  requestedDateTime: number;
  invocations: SsmCommandInvocation[];
}

export interface SsmCommandInvocation {
  commandId: string;
  instanceId: string;
  status: string;
  statusDetails: string;
  standardOutputContent: string;
  standardErrorContent: string;
  responseCode: number;
}

export interface MaintenanceWindow {
  windowId: string;
  name: string;
  schedule: string;
  duration: number;
  cutoff: number;
  allowUnassociatedTargets: boolean;
  enabled: boolean;
  createdDate: number;
  modifiedDate: number;
}

export class SsmService {
  private params: StorageBackend<string, SsmParameter>;
  private history: StorageBackend<string, ParameterHistory[]>;
  private documents: StorageBackend<string, SsmDocument>;
  private commands: StorageBackend<string, SsmCommand>;
  private maintenanceWindows: StorageBackend<string, MaintenanceWindow>;

  constructor(private accountId: string) {
    this.params = new InMemoryStorage();
    this.history = new InMemoryStorage();
    this.documents = new InMemoryStorage();
    this.commands = new InMemoryStorage();
    this.maintenanceWindows = new InMemoryStorage();
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

  getParametersByPath(path: string, recursive: boolean, region: string, maxResults?: number, nextToken?: string): { parameters: SsmParameter[]; nextToken?: string } {
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

    const offset = nextToken ? parseInt(nextToken, 10) : 0;
    const limit = maxResults ?? 10;
    const sliced = allParams.slice(offset, offset + limit);
    return {
      parameters: sliced,
      nextToken: offset + limit < allParams.length ? String(offset + limit) : undefined,
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

  describeParameters(region: string, filters?: any[], maxResults?: number, nextToken?: string): { parameters: any[]; nextToken?: string } {
    let allParams = this.params.values().filter((p) => {
      return this.params.has(this.regionKey(region, p.name));
    });

    // Apply ParameterFilters
    if (filters && filters.length > 0) {
      allParams = allParams.filter((p) => {
        return filters.every((f: any) => {
          const key: string = f.Key;
          const option: string | undefined = f.Option;
          const values: string[] = f.Values ?? [];
          if (key === "Name") {
            if (option === "BeginsWith") {
              return values.some((v) => p.name.startsWith(v));
            }
            if (option === "Equals" || !option) {
              return values.includes(p.name);
            }
            return true;
          }
          if (key === "Type") {
            return values.includes(p.type);
          }
          return true;
        });
      });
    }

    const result = allParams.map((p) => ({
      Name: p.name,
      Type: p.type,
      Description: p.description,
      Version: p.version,
      LastModifiedDate: p.lastModifiedDate,
      ARN: p.arn,
      DataType: p.dataType,
    }));

    const offset = nextToken ? parseInt(nextToken, 10) : 0;
    const limit = maxResults ?? 50;
    const sliced = result.slice(offset, offset + limit);
    return {
      parameters: sliced,
      nextToken: offset + limit < result.length ? String(offset + limit) : undefined,
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

  removeTagsFromResource(resourceId: string, tagKeys: string[], region: string): void {
    const key = this.regionKey(region, resourceId);
    const param = this.params.get(key);
    if (!param) throw new AwsError("InvalidResourceId", `Resource ${resourceId} not found.`, 400);
    for (const k of tagKeys) delete param.tags[k];
  }

  // --- Documents ---

  createDocument(name: string, content: string, documentType: string, documentFormat: string, tags: Record<string, string>, region: string): SsmDocument {
    const key = this.regionKey(region, name);
    if (this.documents.has(key)) throw new AwsError("DocumentAlreadyExists", `Document ${name} already exists.`, 400);
    const doc: SsmDocument = {
      name,
      content,
      documentType: documentType || "Command",
      documentFormat: documentFormat || "JSON",
      version: "1",
      createdDate: Date.now() / 1000,
      status: "Active",
      tags,
      arn: buildArn("ssm", region, this.accountId, "document/", name),
    };
    // Try to extract description from content
    try {
      const parsed = JSON.parse(content);
      if (parsed.description) doc.description = parsed.description;
    } catch { /* YAML or non-JSON, skip */ }
    this.documents.set(key, doc);
    return doc;
  }

  getDocument(name: string, region: string): SsmDocument {
    const key = this.regionKey(region, name);
    const doc = this.documents.get(key);
    if (!doc) throw new AwsError("InvalidDocument", `Document ${name} does not exist.`, 400);
    return doc;
  }

  describeDocument(name: string, region: string): SsmDocument {
    return this.getDocument(name, region);
  }

  listDocuments(region: string): SsmDocument[] {
    return this.documents.values().filter((d) => this.documents.has(this.regionKey(region, d.name)));
  }

  updateDocument(name: string, content: string, documentVersion: string | undefined, region: string): SsmDocument {
    const key = this.regionKey(region, name);
    const doc = this.documents.get(key);
    if (!doc) throw new AwsError("InvalidDocument", `Document ${name} does not exist.`, 400);
    doc.content = content;
    doc.version = String(parseInt(doc.version) + 1);
    try {
      const parsed = JSON.parse(content);
      if (parsed.description) doc.description = parsed.description;
    } catch { /* skip */ }
    return doc;
  }

  deleteDocument(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.documents.has(key)) throw new AwsError("InvalidDocument", `Document ${name} does not exist.`, 400);
    this.documents.delete(key);
  }

  // --- Commands ---

  sendCommand(documentName: string, instanceIds: string[], parameters: Record<string, string[]>, comment: string | undefined, timeoutSeconds: number | undefined, region: string): SsmCommand {
    const commandId = crypto.randomUUID();
    const invocations: SsmCommandInvocation[] = instanceIds.map((instanceId) => ({
      commandId,
      instanceId,
      status: "Success",
      statusDetails: "Success",
      standardOutputContent: "",
      standardErrorContent: "",
      responseCode: 0,
    }));
    const cmd: SsmCommand = {
      commandId,
      documentName,
      instanceIds,
      parameters: parameters ?? {},
      comment,
      timeoutSeconds,
      status: "Success",
      requestedDateTime: Date.now() / 1000,
      invocations,
    };
    this.commands.set(this.regionKey(region, commandId), cmd);
    return cmd;
  }

  getCommandInvocation(commandId: string, instanceId: string, region: string): SsmCommandInvocation {
    const cmd = this.commands.get(this.regionKey(region, commandId));
    if (!cmd) throw new AwsError("InvalidCommandId", `Command ${commandId} not found.`, 400);
    const inv = cmd.invocations.find((i) => i.instanceId === instanceId);
    if (!inv) throw new AwsError("InvocationDoesNotExist", `Invocation for instance ${instanceId} not found.`, 400);
    return inv;
  }

  listCommands(commandId: string | undefined, region: string): SsmCommand[] {
    const all = this.commands.values().filter((c) => this.commands.has(this.regionKey(region, c.commandId)));
    if (commandId) return all.filter((c) => c.commandId === commandId);
    return all;
  }

  listCommandInvocations(commandId: string, region: string): SsmCommandInvocation[] {
    const cmd = this.commands.get(this.regionKey(region, commandId));
    if (!cmd) throw new AwsError("InvalidCommandId", `Command ${commandId} not found.`, 400);
    return cmd.invocations;
  }

  // --- Maintenance Windows ---

  createMaintenanceWindow(name: string, schedule: string, duration: number, cutoff: number, allowUnassociatedTargets: boolean, region: string): MaintenanceWindow {
    const windowId = `mw-${crypto.randomUUID().replace(/-/g, "").slice(0, 17)}`;
    const now = Date.now() / 1000;
    const mw: MaintenanceWindow = {
      windowId,
      name,
      schedule,
      duration,
      cutoff,
      allowUnassociatedTargets: allowUnassociatedTargets ?? false,
      enabled: true,
      createdDate: now,
      modifiedDate: now,
    };
    this.maintenanceWindows.set(this.regionKey(region, windowId), mw);
    return mw;
  }

  getMaintenanceWindow(windowId: string, region: string): MaintenanceWindow {
    const mw = this.maintenanceWindows.get(this.regionKey(region, windowId));
    if (!mw) throw new AwsError("DoesNotExistException", `Maintenance window ${windowId} not found.`, 400);
    return mw;
  }

  describeMaintenanceWindows(region: string): MaintenanceWindow[] {
    return this.maintenanceWindows.values().filter((mw) => this.maintenanceWindows.has(this.regionKey(region, mw.windowId)));
  }

  updateMaintenanceWindow(windowId: string, name: string | undefined, schedule: string | undefined, duration: number | undefined, cutoff: number | undefined, enabled: boolean | undefined, region: string): MaintenanceWindow {
    const mw = this.getMaintenanceWindow(windowId, region);
    if (name !== undefined) mw.name = name;
    if (schedule !== undefined) mw.schedule = schedule;
    if (duration !== undefined) mw.duration = duration;
    if (cutoff !== undefined) mw.cutoff = cutoff;
    if (enabled !== undefined) mw.enabled = enabled;
    mw.modifiedDate = Date.now() / 1000;
    return mw;
  }

  deleteMaintenanceWindow(windowId: string, region: string): void {
    const key = this.regionKey(region, windowId);
    if (!this.maintenanceWindows.has(key)) throw new AwsError("DoesNotExistException", `Maintenance window ${windowId} not found.`, 400);
    this.maintenanceWindows.delete(key);
  }
}
