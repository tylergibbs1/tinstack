import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface AthenaWorkGroup {
  name: string;
  arn: string;
  description: string;
  state: string;
  configuration: {
    resultConfiguration?: {
      outputLocation?: string;
    };
    enforceWorkGroupConfiguration?: boolean;
  };
  creationTime: number;
}

export interface AthenaQueryExecution {
  queryExecutionId: string;
  queryString: string;
  database?: string;
  catalog?: string;
  workGroup: string;
  resultConfiguration?: {
    outputLocation?: string;
  };
  status: {
    state: string;
    submissionDateTime: number;
    completionDateTime?: number;
  };
}

export interface AthenaNamedQuery {
  namedQueryId: string;
  name: string;
  database: string;
  queryString: string;
  description?: string;
  workGroup: string;
}

export interface AthenaDataCatalog {
  name: string;
  type: string; // LAMBDA | GLUE | HIVE
  description?: string;
  parameters?: Record<string, string>;
}

export interface AthenaPreparedStatement {
  statementName: string;
  workGroupName: string;
  queryStatement: string;
  description?: string;
  lastModifiedTime: number;
}

export class AthenaService {
  private workGroups: StorageBackend<string, AthenaWorkGroup>;
  private queryExecutions: StorageBackend<string, AthenaQueryExecution>;
  private namedQueries: StorageBackend<string, AthenaNamedQuery>;
  private dataCatalogs: StorageBackend<string, AthenaDataCatalog>;
  private preparedStatements: StorageBackend<string, AthenaPreparedStatement>;

  constructor(private accountId: string) {
    this.workGroups = new InMemoryStorage();
    this.queryExecutions = new InMemoryStorage();
    this.namedQueries = new InMemoryStorage();
    this.dataCatalogs = new InMemoryStorage();
    this.preparedStatements = new InMemoryStorage();
  }

  private regionKey(region: string, id: string): string {
    return `${region}#${id}`;
  }

  createWorkGroup(
    name: string,
    description: string | undefined,
    configuration: AthenaWorkGroup["configuration"] | undefined,
    region: string,
  ): AthenaWorkGroup {
    const key = this.regionKey(region, name);
    if (this.workGroups.has(key)) {
      throw new AwsError("InvalidRequestException", `WorkGroup ${name} already exists.`, 400);
    }
    const wg: AthenaWorkGroup = {
      name,
      arn: buildArn("athena", region, this.accountId, "workgroup/", name),
      description: description ?? "",
      state: "ENABLED",
      configuration: configuration ?? {},
      creationTime: Date.now() / 1000,
    };
    this.workGroups.set(key, wg);
    return wg;
  }

  getWorkGroup(name: string, region: string): AthenaWorkGroup {
    const wg = this.workGroups.get(this.regionKey(region, name));
    if (!wg) throw new AwsError("InvalidRequestException", `WorkGroup ${name} is not found.`, 400);
    return wg;
  }

  listWorkGroups(region: string): AthenaWorkGroup[] {
    return this.workGroups.values().filter((wg) => wg.arn.includes(`:${region}:`));
  }

  deleteWorkGroup(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.workGroups.has(key)) {
      throw new AwsError("InvalidRequestException", `WorkGroup ${name} is not found.`, 400);
    }
    this.workGroups.delete(key);
  }

  updateWorkGroup(
    name: string,
    description: string | undefined,
    configurationUpdates: AthenaWorkGroup["configuration"] | undefined,
    region: string,
  ): void {
    const wg = this.getWorkGroup(name, region);
    if (description !== undefined) wg.description = description;
    if (configurationUpdates) {
      if (configurationUpdates.resultConfiguration) {
        wg.configuration.resultConfiguration = {
          ...wg.configuration.resultConfiguration,
          ...configurationUpdates.resultConfiguration,
        };
      }
      if (configurationUpdates.enforceWorkGroupConfiguration !== undefined) {
        wg.configuration.enforceWorkGroupConfiguration = configurationUpdates.enforceWorkGroupConfiguration;
      }
    }
    this.workGroups.set(this.regionKey(region, name), wg);
  }

  startQueryExecution(
    queryString: string,
    queryExecutionContext: { Database?: string; Catalog?: string } | undefined,
    resultConfiguration: { OutputLocation?: string } | undefined,
    workGroup: string | undefined,
    region: string,
  ): string {
    const queryExecutionId = crypto.randomUUID();
    const now = Date.now() / 1000;
    const qe: AthenaQueryExecution = {
      queryExecutionId,
      queryString,
      database: queryExecutionContext?.Database,
      catalog: queryExecutionContext?.Catalog,
      workGroup: workGroup ?? "primary",
      resultConfiguration: resultConfiguration ? { outputLocation: resultConfiguration.OutputLocation } : undefined,
      status: {
        state: "SUCCEEDED",
        submissionDateTime: now,
        completionDateTime: now,
      },
    };
    this.queryExecutions.set(this.regionKey(region, queryExecutionId), qe);
    return queryExecutionId;
  }

  getQueryExecution(queryExecutionId: string, region: string): AthenaQueryExecution {
    const qe = this.queryExecutions.get(this.regionKey(region, queryExecutionId));
    if (!qe) throw new AwsError("InvalidRequestException", `QueryExecution ${queryExecutionId} is not found.`, 400);
    return qe;
  }

  listQueryExecutions(region: string): string[] {
    return this.queryExecutions
      .values()
      .filter((qe) => true) // all in this storage are region-scoped by key
      .map((qe) => qe.queryExecutionId);
  }

  getQueryResults(queryExecutionId: string, region: string): {
    columns: { Name: string; Type: string }[];
    rows: { Data: { VarCharValue: string }[] }[];
  } {
    // Ensure query exists
    this.getQueryExecution(queryExecutionId, region);
    return {
      columns: [
        { Name: "id", Type: "integer" },
        { Name: "name", Type: "varchar" },
      ],
      rows: [
        { Data: [{ VarCharValue: "1" }, { VarCharValue: "mock_row" }] },
      ],
    };
  }

  stopQueryExecution(queryExecutionId: string, region: string): void {
    const qe = this.getQueryExecution(queryExecutionId, region);
    qe.status.state = "CANCELLED";
    qe.status.completionDateTime = Date.now() / 1000;
    this.queryExecutions.set(this.regionKey(region, queryExecutionId), qe);
  }

  createNamedQuery(
    name: string,
    database: string,
    queryString: string,
    description: string | undefined,
    workGroup: string | undefined,
    region: string,
  ): string {
    const namedQueryId = crypto.randomUUID();
    const nq: AthenaNamedQuery = {
      namedQueryId,
      name,
      database,
      queryString,
      description,
      workGroup: workGroup ?? "primary",
    };
    this.namedQueries.set(this.regionKey(region, namedQueryId), nq);
    return namedQueryId;
  }

  getNamedQuery(namedQueryId: string, region: string): AthenaNamedQuery {
    const nq = this.namedQueries.get(this.regionKey(region, namedQueryId));
    if (!nq) throw new AwsError("InvalidRequestException", `NamedQuery ${namedQueryId} is not found.`, 400);
    return nq;
  }

  listNamedQueries(region: string): string[] {
    return this.namedQueries.values().map((nq) => nq.namedQueryId);
  }

  deleteNamedQuery(namedQueryId: string, region: string): void {
    const key = this.regionKey(region, namedQueryId);
    if (!this.namedQueries.has(key)) {
      throw new AwsError("InvalidRequestException", `NamedQuery ${namedQueryId} is not found.`, 400);
    }
    this.namedQueries.delete(key);
  }

  // Data Catalogs
  createDataCatalog(name: string, type: string, description: string | undefined, parameters: Record<string, string> | undefined, region: string): AthenaDataCatalog {
    const key = this.regionKey(region, name);
    if (this.dataCatalogs.has(key)) {
      throw new AwsError("InvalidRequestException", `DataCatalog ${name} already exists.`, 400);
    }
    const catalog: AthenaDataCatalog = { name, type, description, parameters };
    this.dataCatalogs.set(key, catalog);
    return catalog;
  }

  getDataCatalog(name: string, region: string): AthenaDataCatalog {
    const catalog = this.dataCatalogs.get(this.regionKey(region, name));
    if (!catalog) throw new AwsError("InvalidRequestException", `DataCatalog ${name} is not found.`, 400);
    return catalog;
  }

  listDataCatalogs(region: string): AthenaDataCatalog[] {
    return this.dataCatalogs.values().filter((c) => this.dataCatalogs.has(this.regionKey(region, c.name)));
  }

  updateDataCatalog(name: string, type: string | undefined, description: string | undefined, parameters: Record<string, string> | undefined, region: string): void {
    const catalog = this.getDataCatalog(name, region);
    if (type !== undefined) catalog.type = type;
    if (description !== undefined) catalog.description = description;
    if (parameters !== undefined) catalog.parameters = parameters;
    this.dataCatalogs.set(this.regionKey(region, name), catalog);
  }

  deleteDataCatalog(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.dataCatalogs.has(key)) {
      throw new AwsError("InvalidRequestException", `DataCatalog ${name} is not found.`, 400);
    }
    this.dataCatalogs.delete(key);
  }

  // Prepared Statements
  createPreparedStatement(statementName: string, workGroupName: string, queryStatement: string, description: string | undefined, region: string): AthenaPreparedStatement {
    const key = this.regionKey(region, `${workGroupName}#${statementName}`);
    if (this.preparedStatements.has(key)) {
      throw new AwsError("InvalidRequestException", `PreparedStatement ${statementName} already exists in workgroup ${workGroupName}.`, 400);
    }
    const stmt: AthenaPreparedStatement = {
      statementName,
      workGroupName,
      queryStatement,
      description,
      lastModifiedTime: Date.now() / 1000,
    };
    this.preparedStatements.set(key, stmt);
    return stmt;
  }

  getPreparedStatement(statementName: string, workGroupName: string, region: string): AthenaPreparedStatement {
    const stmt = this.preparedStatements.get(this.regionKey(region, `${workGroupName}#${statementName}`));
    if (!stmt) throw new AwsError("InvalidRequestException", `PreparedStatement ${statementName} is not found.`, 400);
    return stmt;
  }

  listPreparedStatements(workGroupName: string, region: string): AthenaPreparedStatement[] {
    return this.preparedStatements.values().filter((s) => s.workGroupName === workGroupName);
  }

  deletePreparedStatement(statementName: string, workGroupName: string, region: string): void {
    const key = this.regionKey(region, `${workGroupName}#${statementName}`);
    if (!this.preparedStatements.has(key)) {
      throw new AwsError("InvalidRequestException", `PreparedStatement ${statementName} is not found.`, 400);
    }
    this.preparedStatements.delete(key);
  }
}
