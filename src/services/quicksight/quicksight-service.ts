import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface QsDataSet {
  dataSetId: string;
  name: string;
  arn: string;
  importMode: string;
  createdTime: number;
  lastUpdatedTime: number;
}

export interface QsDataSource {
  dataSourceId: string;
  name: string;
  arn: string;
  type: string;
  status: string;
  createdTime: number;
  lastUpdatedTime: number;
}

export interface QsDashboard {
  dashboardId: string;
  name: string;
  arn: string;
  versionNumber: number;
  status: string;
  createdTime: number;
  lastUpdatedTime: number;
  lastPublishedTime: number;
}

export interface QsAnalysis {
  analysisId: string;
  name: string;
  arn: string;
  status: string;
  createdTime: number;
  lastUpdatedTime: number;
}

export interface QsGroup {
  groupName: string;
  arn: string;
  description: string;
  principalId: string;
  members: string[];
}

export class QuickSightService {
  private dataSets: StorageBackend<string, QsDataSet>;
  private dataSources: StorageBackend<string, QsDataSource>;
  private dashboards: StorageBackend<string, QsDashboard>;
  private analyses: StorageBackend<string, QsAnalysis>;
  private groups: StorageBackend<string, QsGroup>;
  private resourceTags: StorageBackend<string, { Key: string; Value: string }[]>;

  constructor(private accountId: string) {
    this.dataSets = new InMemoryStorage();
    this.dataSources = new InMemoryStorage();
    this.dashboards = new InMemoryStorage();
    this.analyses = new InMemoryStorage();
    this.groups = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();
  }

  // --- DataSets ---

  createDataSet(dataSetId: string, name: string, importMode: string, region: string): QsDataSet {
    if (this.dataSets.has(dataSetId)) {
      throw new AwsError("ResourceExistsException", `DataSet ${dataSetId} already exists.`, 409);
    }
    const now = Date.now() / 1000;
    const ds: QsDataSet = {
      dataSetId,
      name,
      arn: `arn:aws:quicksight:${region}:${this.accountId}:dataset/${dataSetId}`,
      importMode: importMode ?? "SPICE",
      createdTime: now,
      lastUpdatedTime: now,
    };
    this.dataSets.set(dataSetId, ds);
    return ds;
  }

  describeDataSet(dataSetId: string): QsDataSet {
    const ds = this.dataSets.get(dataSetId);
    if (!ds) throw new AwsError("ResourceNotFoundException", `DataSet ${dataSetId} not found.`, 404);
    return ds;
  }

  listDataSets(): QsDataSet[] {
    return this.dataSets.values();
  }

  deleteDataSet(dataSetId: string): QsDataSet {
    const ds = this.dataSets.get(dataSetId);
    if (!ds) throw new AwsError("ResourceNotFoundException", `DataSet ${dataSetId} not found.`, 404);
    this.dataSets.delete(dataSetId);
    return ds;
  }

  // --- DataSources ---

  createDataSource(dataSourceId: string, name: string, type: string, region: string): QsDataSource {
    if (this.dataSources.has(dataSourceId)) {
      throw new AwsError("ResourceExistsException", `DataSource ${dataSourceId} already exists.`, 409);
    }
    const now = Date.now() / 1000;
    const ds: QsDataSource = {
      dataSourceId,
      name,
      arn: `arn:aws:quicksight:${region}:${this.accountId}:datasource/${dataSourceId}`,
      type: type ?? "S3",
      status: "CREATION_SUCCESSFUL",
      createdTime: now,
      lastUpdatedTime: now,
    };
    this.dataSources.set(dataSourceId, ds);
    return ds;
  }

  describeDataSource(dataSourceId: string): QsDataSource {
    const ds = this.dataSources.get(dataSourceId);
    if (!ds) throw new AwsError("ResourceNotFoundException", `DataSource ${dataSourceId} not found.`, 404);
    return ds;
  }

  listDataSources(): QsDataSource[] {
    return this.dataSources.values();
  }

  deleteDataSource(dataSourceId: string): QsDataSource {
    const ds = this.dataSources.get(dataSourceId);
    if (!ds) throw new AwsError("ResourceNotFoundException", `DataSource ${dataSourceId} not found.`, 404);
    this.dataSources.delete(dataSourceId);
    return ds;
  }

  // --- Dashboards ---

  createDashboard(dashboardId: string, name: string, region: string): QsDashboard {
    if (this.dashboards.has(dashboardId)) {
      throw new AwsError("ResourceExistsException", `Dashboard ${dashboardId} already exists.`, 409);
    }
    const now = Date.now() / 1000;
    const d: QsDashboard = {
      dashboardId,
      name,
      arn: `arn:aws:quicksight:${region}:${this.accountId}:dashboard/${dashboardId}`,
      versionNumber: 1,
      status: "CREATION_SUCCESSFUL",
      createdTime: now,
      lastUpdatedTime: now,
      lastPublishedTime: now,
    };
    this.dashboards.set(dashboardId, d);
    return d;
  }

  describeDashboard(dashboardId: string): QsDashboard {
    const d = this.dashboards.get(dashboardId);
    if (!d) throw new AwsError("ResourceNotFoundException", `Dashboard ${dashboardId} not found.`, 404);
    return d;
  }

  listDashboards(): QsDashboard[] {
    return this.dashboards.values();
  }

  deleteDashboard(dashboardId: string): void {
    if (!this.dashboards.has(dashboardId)) {
      throw new AwsError("ResourceNotFoundException", `Dashboard ${dashboardId} not found.`, 404);
    }
    this.dashboards.delete(dashboardId);
  }

  // --- Analyses ---

  createAnalysis(analysisId: string, name: string, region: string): QsAnalysis {
    if (this.analyses.has(analysisId)) {
      throw new AwsError("ResourceExistsException", `Analysis ${analysisId} already exists.`, 409);
    }
    const now = Date.now() / 1000;
    const a: QsAnalysis = {
      analysisId,
      name,
      arn: `arn:aws:quicksight:${region}:${this.accountId}:analysis/${analysisId}`,
      status: "CREATION_SUCCESSFUL",
      createdTime: now,
      lastUpdatedTime: now,
    };
    this.analyses.set(analysisId, a);
    return a;
  }

  describeAnalysis(analysisId: string): QsAnalysis {
    const a = this.analyses.get(analysisId);
    if (!a) throw new AwsError("ResourceNotFoundException", `Analysis ${analysisId} not found.`, 404);
    return a;
  }

  listAnalyses(): QsAnalysis[] {
    return this.analyses.values();
  }

  // --- Groups ---

  createGroup(groupName: string, description: string, namespace: string, region: string): QsGroup {
    const key = `${namespace}:${groupName}`;
    if (this.groups.has(key)) {
      throw new AwsError("ResourceExistsException", `Group ${groupName} already exists.`, 409);
    }
    const g: QsGroup = {
      groupName,
      arn: `arn:aws:quicksight:${region}:${this.accountId}:group/${namespace}/${groupName}`,
      description: description ?? "",
      principalId: crypto.randomUUID(),
      members: [],
    };
    this.groups.set(key, g);
    return g;
  }

  describeGroup(groupName: string, namespace: string): QsGroup {
    const key = `${namespace}:${groupName}`;
    const g = this.groups.get(key);
    if (!g) throw new AwsError("ResourceNotFoundException", `Group ${groupName} not found.`, 404);
    return g;
  }

  listGroups(namespace: string): QsGroup[] {
    return this.groups.values().filter((g) => g.arn.includes(`:group/${namespace}/`));
  }

  deleteGroup(groupName: string, namespace: string): void {
    const key = `${namespace}:${groupName}`;
    if (!this.groups.has(key)) {
      throw new AwsError("ResourceNotFoundException", `Group ${groupName} not found.`, 404);
    }
    this.groups.delete(key);
  }

  createGroupMembership(groupName: string, memberName: string, namespace: string): { GroupName: string; MemberName: string } {
    const g = this.describeGroup(groupName, namespace);
    if (!g.members.includes(memberName)) {
      g.members.push(memberName);
      this.groups.set(`${namespace}:${groupName}`, g);
    }
    return { GroupName: groupName, MemberName: memberName };
  }

  listGroupMemberships(groupName: string, namespace: string): string[] {
    const g = this.describeGroup(groupName, namespace);
    return g.members;
  }

  // --- Tags ---

  tagResource(arn: string, tags: { Key: string; Value: string }[]): void {
    const existing = this.resourceTags.get(arn) ?? [];
    for (const tag of tags) {
      const idx = existing.findIndex((t) => t.Key === tag.Key);
      if (idx >= 0) existing[idx] = tag;
      else existing.push(tag);
    }
    this.resourceTags.set(arn, existing);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(arn) ?? [];
    this.resourceTags.set(arn, existing.filter((t) => !tagKeys.includes(t.Key)));
  }

  listTagsForResource(arn: string): { Key: string; Value: string }[] {
    return this.resourceTags.get(arn) ?? [];
  }
}
