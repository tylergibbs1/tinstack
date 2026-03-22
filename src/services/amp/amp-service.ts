import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

interface Workspace {
  workspaceId: string;
  arn: string;
  alias?: string;
  status: { statusCode: string };
  prometheusEndpoint: string;
  createdAt: number;
  tags: Record<string, string>;
}

interface RuleGroupsNamespace {
  name: string;
  arn: string;
  workspaceId: string;
  data: string;
  status: { statusCode: string };
  createdAt: number;
  modifiedAt: number;
}

interface AlertManagerDefinition {
  workspaceId: string;
  data: string;
  status: { statusCode: string };
  createdAt: number;
  modifiedAt: number;
}

export class AmpService {
  private workspaces: StorageBackend<string, Workspace>;
  private ruleGroups: StorageBackend<string, RuleGroupsNamespace>;
  private alertManagers: StorageBackend<string, AlertManagerDefinition>;

  constructor(private accountId: string) {
    this.workspaces = new InMemoryStorage();
    this.ruleGroups = new InMemoryStorage();
    this.alertManagers = new InMemoryStorage();
  }

  createWorkspace(alias: string | undefined, tags: Record<string, string> | undefined, region: string): Workspace {
    const id = "ws-" + crypto.randomUUID().slice(0, 8);
    const arn = buildArn("aps", region, this.accountId, "workspace/", id);
    const ws: Workspace = {
      workspaceId: id, arn, alias, status: { statusCode: "ACTIVE" },
      prometheusEndpoint: `http://localhost:4566/workspaces/${id}/api/v1/remote_write`,
      createdAt: Date.now() / 1000, tags: tags ?? {},
    };
    this.workspaces.set(id, ws);
    return ws;
  }

  describeWorkspace(workspaceId: string): Workspace {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new AwsError("ResourceNotFoundException", `Workspace ${workspaceId} not found.`, 404);
    return ws;
  }

  listWorkspaces(): Workspace[] { return this.workspaces.values(); }

  deleteWorkspace(workspaceId: string): void {
    if (!this.workspaces.has(workspaceId)) throw new AwsError("ResourceNotFoundException", `Workspace ${workspaceId} not found.`, 404);
    this.workspaces.delete(workspaceId);
  }

  createRuleGroupsNamespace(workspaceId: string, name: string, data: string, region: string): RuleGroupsNamespace {
    this.describeWorkspace(workspaceId);
    const key = `${workspaceId}#${name}`;
    if (this.ruleGroups.has(key)) throw new AwsError("ConflictException", `Rule group ${name} already exists.`, 409);
    const now = Date.now() / 1000;
    const ns: RuleGroupsNamespace = { name, arn: buildArn("aps", region, this.accountId, `workspace/${workspaceId}/rulegroupsnamespace/`, name), workspaceId, data, status: { statusCode: "ACTIVE" }, createdAt: now, modifiedAt: now };
    this.ruleGroups.set(key, ns);
    return ns;
  }

  describeRuleGroupsNamespace(workspaceId: string, name: string): RuleGroupsNamespace {
    const ns = this.ruleGroups.get(`${workspaceId}#${name}`);
    if (!ns) throw new AwsError("ResourceNotFoundException", `Rule group ${name} not found.`, 404);
    return ns;
  }

  listRuleGroupsNamespaces(workspaceId: string): RuleGroupsNamespace[] {
    return this.ruleGroups.values().filter((r) => r.workspaceId === workspaceId);
  }

  createAlertManagerDefinition(workspaceId: string, data: string): AlertManagerDefinition {
    this.describeWorkspace(workspaceId);
    const now = Date.now() / 1000;
    const def: AlertManagerDefinition = { workspaceId, data, status: { statusCode: "ACTIVE" }, createdAt: now, modifiedAt: now };
    this.alertManagers.set(workspaceId, def);
    return def;
  }

  describeAlertManagerDefinition(workspaceId: string): AlertManagerDefinition {
    const def = this.alertManagers.get(workspaceId);
    if (!def) throw new AwsError("ResourceNotFoundException", `Alert manager definition not found for workspace ${workspaceId}.`, 404);
    return def;
  }

  tagResource(arn: string, tags: Record<string, string>): void {
    const ws = this.workspaces.values().find((w) => w.arn === arn);
    if (ws) { Object.assign(ws.tags, tags); return; }
    throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const ws = this.workspaces.values().find((w) => w.arn === arn);
    if (ws) { for (const k of tagKeys) delete ws.tags[k]; return; }
    throw new AwsError("ResourceNotFoundException", `Resource ${arn} not found.`, 404);
  }
}
