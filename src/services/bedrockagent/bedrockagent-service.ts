import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Agent {
  agentId: string;
  agentName: string;
  agentArn: string;
  agentStatus: string;
  description: string;
  foundationModel: string;
  instruction: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBase {
  knowledgeBaseId: string;
  name: string;
  knowledgeBaseArn: string;
  status: string;
  description: string;
  roleArn: string;
  knowledgeBaseConfiguration: any;
  storageConfiguration: any;
  createdAt: string;
  updatedAt: string;
}

export interface DataSource {
  dataSourceId: string;
  knowledgeBaseId: string;
  name: string;
  status: string;
  description: string;
  dataSourceConfiguration: any;
  createdAt: string;
  updatedAt: string;
}

export class BedrockAgentService {
  private agents: StorageBackend<string, Agent>;
  private knowledgeBases: StorageBackend<string, KnowledgeBase>;
  private dataSources: StorageBackend<string, DataSource>;

  constructor(private accountId: string) {
    this.agents = new InMemoryStorage();
    this.knowledgeBases = new InMemoryStorage();
    this.dataSources = new InMemoryStorage();
  }

  createAgent(name: string, region: string, description?: string, foundationModel?: string, instruction?: string): Agent {
    const id = crypto.randomUUID().slice(0, 10).replace(/-/g, "").toUpperCase();
    const agent: Agent = {
      agentId: id, agentName: name,
      agentArn: buildArn("bedrock", region, this.accountId, "agent/", id),
      agentStatus: "NOT_PREPARED", description: description ?? "",
      foundationModel: foundationModel ?? "anthropic.claude-v2",
      instruction: instruction ?? "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    this.agents.set(id, agent);
    return agent;
  }

  getAgent(agentId: string): Agent {
    const a = this.agents.get(agentId);
    if (!a) throw new AwsError("ResourceNotFoundException", `Agent ${agentId} not found.`, 404);
    return a;
  }

  listAgents(): Agent[] { return this.agents.values(); }

  deleteAgent(agentId: string): void {
    if (!this.agents.has(agentId)) throw new AwsError("ResourceNotFoundException", `Agent ${agentId} not found.`, 404);
    this.agents.delete(agentId);
  }

  createKnowledgeBase(name: string, region: string, roleArn: string, kbConfig: any, storageConfig: any, description?: string): KnowledgeBase {
    const id = crypto.randomUUID().slice(0, 10).replace(/-/g, "").toUpperCase();
    const kb: KnowledgeBase = {
      knowledgeBaseId: id, name,
      knowledgeBaseArn: buildArn("bedrock", region, this.accountId, "knowledge-base/", id),
      status: "ACTIVE", description: description ?? "", roleArn: roleArn ?? "",
      knowledgeBaseConfiguration: kbConfig ?? {}, storageConfiguration: storageConfig ?? {},
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    this.knowledgeBases.set(id, kb);
    return kb;
  }

  getKnowledgeBase(id: string): KnowledgeBase {
    const kb = this.knowledgeBases.get(id);
    if (!kb) throw new AwsError("ResourceNotFoundException", `KnowledgeBase ${id} not found.`, 404);
    return kb;
  }

  listKnowledgeBases(): KnowledgeBase[] { return this.knowledgeBases.values(); }

  deleteKnowledgeBase(id: string): void {
    if (!this.knowledgeBases.has(id)) throw new AwsError("ResourceNotFoundException", `KnowledgeBase ${id} not found.`, 404);
    this.knowledgeBases.delete(id);
  }

  createDataSource(knowledgeBaseId: string, name: string, dataSourceConfig: any, description?: string): DataSource {
    if (!this.knowledgeBases.has(knowledgeBaseId)) throw new AwsError("ResourceNotFoundException", `KnowledgeBase ${knowledgeBaseId} not found.`, 404);
    const id = crypto.randomUUID().slice(0, 10).replace(/-/g, "").toUpperCase();
    const ds: DataSource = {
      dataSourceId: id, knowledgeBaseId, name, status: "AVAILABLE",
      description: description ?? "", dataSourceConfiguration: dataSourceConfig ?? {},
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    this.dataSources.set(id, ds);
    return ds;
  }

  getDataSource(knowledgeBaseId: string, dataSourceId: string): DataSource {
    const ds = this.dataSources.get(dataSourceId);
    if (!ds || ds.knowledgeBaseId !== knowledgeBaseId) throw new AwsError("ResourceNotFoundException", `DataSource ${dataSourceId} not found.`, 404);
    return ds;
  }

  listDataSources(knowledgeBaseId: string): DataSource[] {
    return this.dataSources.values().filter(ds => ds.knowledgeBaseId === knowledgeBaseId);
  }
}
