import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface GlueDatabase {
  name: string;
  arn: string;
  description: string;
  locationUri?: string;
  createTime: number;
}

export interface GlueColumn {
  name: string;
  type: string;
  comment?: string;
}

export interface GlueStorageDescriptor {
  columns: GlueColumn[];
  location?: string;
  inputFormat?: string;
  outputFormat?: string;
  serdeInfo?: {
    serializationLibrary?: string;
    parameters?: Record<string, string>;
  };
}

export interface GlueTable {
  databaseName: string;
  name: string;
  arn: string;
  description?: string;
  storageDescriptor: GlueStorageDescriptor;
  partitionKeys: GlueColumn[];
  createTime: number;
  updateTime: number;
}

export interface GluePartition {
  databaseName: string;
  tableName: string;
  values: string[];
  storageDescriptor: GlueStorageDescriptor;
  creationTime: number;
}

export interface GlueCrawler {
  name: string;
  arn: string;
  role: string;
  databaseName: string;
  targets: {
    s3Targets: { path: string }[];
  };
  state: string;
  creationTime: number;
}

export interface GlueJob {
  name: string;
  arn: string;
  role: string;
  command: {
    name: string;
    scriptLocation: string;
  };
  defaultArguments: Record<string, string>;
  creationTime: number;
}

export interface GlueJobRun {
  id: string;
  jobName: string;
  status: string;
  startedOn: number;
  completedOn?: number;
}

export interface GlueTrigger {
  name: string;
  arn: string;
  type: string;
  state: string;
  schedule?: string;
  predicate?: {
    logical?: string;
    conditions: { logicalOperator?: string; jobName: string; state?: string }[];
  };
  actions: { jobName: string; arguments?: Record<string, string> }[];
  createdAt: number;
}

export interface GlueConnection {
  name: string;
  connectionType: string;
  connectionProperties: Record<string, string>;
  physicalConnectionRequirements?: {
    subnetId?: string;
    securityGroupIdList?: string[];
    availabilityZone?: string;
  };
  creationTime: number;
}

export interface GlueJobBookmark {
  jobName: string;
  run: number;
  attempt: number;
  previousRunId?: string;
  runId?: string;
  version: number;
  jobBookmark?: string;
}

export class GlueService {
  private databases: StorageBackend<string, GlueDatabase>;
  private tables: StorageBackend<string, GlueTable>;
  private partitions: StorageBackend<string, GluePartition>;
  private crawlers: StorageBackend<string, GlueCrawler>;
  private jobs: StorageBackend<string, GlueJob>;
  private jobRuns: StorageBackend<string, GlueJobRun>;
  private triggers: StorageBackend<string, GlueTrigger>;
  private connections: StorageBackend<string, GlueConnection>;
  private jobBookmarks: StorageBackend<string, GlueJobBookmark>;

  constructor(private accountId: string) {
    this.databases = new InMemoryStorage();
    this.tables = new InMemoryStorage();
    this.partitions = new InMemoryStorage();
    this.crawlers = new InMemoryStorage();
    this.jobs = new InMemoryStorage();
    this.jobRuns = new InMemoryStorage();
    this.triggers = new InMemoryStorage();
    this.connections = new InMemoryStorage();
    this.jobBookmarks = new InMemoryStorage();
  }

  private regionKey(region: string, id: string): string {
    return `${region}#${id}`;
  }

  // --- Databases ---

  createDatabase(name: string, description: string | undefined, locationUri: string | undefined, region: string): GlueDatabase {
    const key = this.regionKey(region, name);
    if (this.databases.has(key)) {
      throw new AwsError("AlreadyExistsException", `Database ${name} already exists.`, 400);
    }
    const db: GlueDatabase = {
      name,
      arn: buildArn("glue", region, this.accountId, "database/", name),
      description: description ?? "",
      locationUri,
      createTime: Date.now() / 1000,
    };
    this.databases.set(key, db);
    return db;
  }

  getDatabase(name: string, region: string): GlueDatabase {
    const db = this.databases.get(this.regionKey(region, name));
    if (!db) throw new AwsError("EntityNotFoundException", `Database ${name} not found.`, 400);
    return db;
  }

  getDatabases(region: string): GlueDatabase[] {
    return this.databases.values().filter((db) => db.arn.includes(`:${region}:`));
  }

  deleteDatabase(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.databases.has(key)) {
      throw new AwsError("EntityNotFoundException", `Database ${name} not found.`, 400);
    }
    this.databases.delete(key);
  }

  updateDatabase(name: string, description: string | undefined, region: string): void {
    const db = this.getDatabase(name, region);
    if (description !== undefined) db.description = description;
    this.databases.set(this.regionKey(region, name), db);
  }

  // --- Tables ---

  createTable(
    databaseName: string,
    name: string,
    storageDescriptor: GlueStorageDescriptor,
    partitionKeys: GlueColumn[] | undefined,
    description: string | undefined,
    region: string,
  ): GlueTable {
    // Verify database exists
    this.getDatabase(databaseName, region);

    const tableKey = this.regionKey(region, `${databaseName}/${name}`);
    if (this.tables.has(tableKey)) {
      throw new AwsError("AlreadyExistsException", `Table ${name} already exists in database ${databaseName}.`, 400);
    }
    const now = Date.now() / 1000;
    const table: GlueTable = {
      databaseName,
      name,
      arn: buildArn("glue", region, this.accountId, "table/", `${databaseName}/${name}`),
      description,
      storageDescriptor,
      partitionKeys: partitionKeys ?? [],
      createTime: now,
      updateTime: now,
    };
    this.tables.set(tableKey, table);
    return table;
  }

  getTable(databaseName: string, name: string, region: string): GlueTable {
    const table = this.tables.get(this.regionKey(region, `${databaseName}/${name}`));
    if (!table) throw new AwsError("EntityNotFoundException", `Table ${name} not found in database ${databaseName}.`, 400);
    return table;
  }

  getTables(databaseName: string, region: string): GlueTable[] {
    // Verify database exists
    this.getDatabase(databaseName, region);
    return this.tables.values().filter((t) => t.databaseName === databaseName && t.arn.includes(`:${region}:`));
  }

  deleteTable(databaseName: string, name: string, region: string): void {
    const key = this.regionKey(region, `${databaseName}/${name}`);
    if (!this.tables.has(key)) {
      throw new AwsError("EntityNotFoundException", `Table ${name} not found in database ${databaseName}.`, 400);
    }
    this.tables.delete(key);
  }

  updateTable(
    databaseName: string,
    name: string,
    storageDescriptor: GlueStorageDescriptor | undefined,
    description: string | undefined,
    region: string,
  ): void {
    const table = this.getTable(databaseName, name, region);
    if (storageDescriptor) table.storageDescriptor = storageDescriptor;
    if (description !== undefined) table.description = description;
    table.updateTime = Date.now() / 1000;
    this.tables.set(this.regionKey(region, `${databaseName}/${name}`), table);
  }

  // --- Partitions ---

  createPartition(
    databaseName: string,
    tableName: string,
    values: string[],
    storageDescriptor: GlueStorageDescriptor | undefined,
    region: string,
  ): GluePartition {
    // Verify table exists
    const table = this.getTable(databaseName, tableName, region);

    const partKey = this.regionKey(region, `${databaseName}/${tableName}/${values.join("/")}`);
    if (this.partitions.has(partKey)) {
      throw new AwsError("AlreadyExistsException", `Partition already exists.`, 400);
    }
    const partition: GluePartition = {
      databaseName,
      tableName,
      values,
      storageDescriptor: storageDescriptor ?? table.storageDescriptor,
      creationTime: Date.now() / 1000,
    };
    this.partitions.set(partKey, partition);
    return partition;
  }

  getPartition(databaseName: string, tableName: string, values: string[], region: string): GluePartition {
    const partKey = this.regionKey(region, `${databaseName}/${tableName}/${values.join("/")}`);
    const partition = this.partitions.get(partKey);
    if (!partition) throw new AwsError("EntityNotFoundException", `Partition not found.`, 400);
    return partition;
  }

  getPartitions(databaseName: string, tableName: string, region: string): GluePartition[] {
    // Verify table exists
    this.getTable(databaseName, tableName, region);
    return this.partitions.values().filter(
      (p) => p.databaseName === databaseName && p.tableName === tableName,
    );
  }

  batchCreatePartition(
    databaseName: string,
    tableName: string,
    partitionInputs: { Values: string[]; StorageDescriptor?: GlueStorageDescriptor }[],
    region: string,
  ): { errors: { PartitionValues: string[]; ErrorDetail: { ErrorCode: string; ErrorMessage: string } }[] } {
    const errors: { PartitionValues: string[]; ErrorDetail: { ErrorCode: string; ErrorMessage: string } }[] = [];
    for (const input of partitionInputs) {
      try {
        this.createPartition(
          databaseName,
          tableName,
          input.Values,
          input.StorageDescriptor ? this.parseStorageDescriptor(input.StorageDescriptor) : undefined,
          region,
        );
      } catch (e) {
        if (e instanceof AwsError) {
          errors.push({
            PartitionValues: input.Values,
            ErrorDetail: { ErrorCode: e.code, ErrorMessage: e.message },
          });
        } else {
          throw e;
        }
      }
    }
    return { errors };
  }

  private parseStorageDescriptor(sd: any): GlueStorageDescriptor {
    return {
      columns: (sd.Columns ?? []).map((c: any) => ({ name: c.Name, type: c.Type, comment: c.Comment })),
      location: sd.Location,
      inputFormat: sd.InputFormat,
      outputFormat: sd.OutputFormat,
      serdeInfo: sd.SerdeInfo ? {
        serializationLibrary: sd.SerdeInfo.SerializationLibrary,
        parameters: sd.SerdeInfo.Parameters,
      } : undefined,
    };
  }

  // --- Crawlers ---

  createCrawler(
    name: string,
    role: string,
    databaseName: string,
    targets: { s3Targets: { path: string }[] },
    region: string,
  ): GlueCrawler {
    const key = this.regionKey(region, name);
    if (this.crawlers.has(key)) {
      throw new AwsError("AlreadyExistsException", `Crawler ${name} already exists.`, 400);
    }
    const crawler: GlueCrawler = {
      name,
      arn: buildArn("glue", region, this.accountId, "crawler/", name),
      role,
      databaseName,
      targets,
      state: "READY",
      creationTime: Date.now() / 1000,
    };
    this.crawlers.set(key, crawler);
    return crawler;
  }

  getCrawler(name: string, region: string): GlueCrawler {
    const crawler = this.crawlers.get(this.regionKey(region, name));
    if (!crawler) throw new AwsError("EntityNotFoundException", `Crawler ${name} not found.`, 400);
    return crawler;
  }

  listCrawlers(region: string): string[] {
    return this.crawlers.values()
      .filter((c) => c.arn.includes(`:${region}:`))
      .map((c) => c.name);
  }

  startCrawler(name: string, region: string): void {
    const crawler = this.getCrawler(name, region);
    crawler.state = "RUNNING";
    // Mock: immediately transition to READY
    crawler.state = "READY";
    this.crawlers.set(this.regionKey(region, name), crawler);
  }

  stopCrawler(name: string, region: string): void {
    const crawler = this.getCrawler(name, region);
    crawler.state = "STOPPING";
    // Mock: immediately transition to READY
    crawler.state = "READY";
    this.crawlers.set(this.regionKey(region, name), crawler);
  }

  deleteCrawler(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.crawlers.has(key)) {
      throw new AwsError("EntityNotFoundException", `Crawler ${name} not found.`, 400);
    }
    this.crawlers.delete(key);
  }

  // --- Jobs ---

  createJob(
    name: string,
    role: string,
    command: { name: string; scriptLocation: string },
    defaultArguments: Record<string, string> | undefined,
    region: string,
  ): GlueJob {
    const key = this.regionKey(region, name);
    if (this.jobs.has(key)) {
      throw new AwsError("AlreadyExistsException", `Job ${name} already exists.`, 400);
    }
    const job: GlueJob = {
      name,
      arn: buildArn("glue", region, this.accountId, "job/", name),
      role,
      command,
      defaultArguments: defaultArguments ?? {},
      creationTime: Date.now() / 1000,
    };
    this.jobs.set(key, job);
    return job;
  }

  getJob(name: string, region: string): GlueJob {
    const job = this.jobs.get(this.regionKey(region, name));
    if (!job) throw new AwsError("EntityNotFoundException", `Job ${name} not found.`, 400);
    return job;
  }

  getJobs(region: string): GlueJob[] {
    return this.jobs.values().filter((j) => j.arn.includes(`:${region}:`));
  }

  deleteJob(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.jobs.has(key)) {
      throw new AwsError("EntityNotFoundException", `Job ${name} not found.`, 400);
    }
    this.jobs.delete(key);
  }

  startJobRun(jobName: string, region: string): string {
    // Verify job exists
    this.getJob(jobName, region);

    const runId = `jr_${crypto.randomUUID().replace(/-/g, "")}`;
    const now = Date.now() / 1000;
    const run: GlueJobRun = {
      id: runId,
      jobName,
      status: "SUCCEEDED",
      startedOn: now,
      completedOn: now,
    };
    this.jobRuns.set(this.regionKey(region, `${jobName}/${runId}`), run);
    return runId;
  }

  getJobRun(jobName: string, runId: string, region: string): GlueJobRun {
    const run = this.jobRuns.get(this.regionKey(region, `${jobName}/${runId}`));
    if (!run) throw new AwsError("EntityNotFoundException", `JobRun ${runId} not found.`, 400);
    return run;
  }

  // --- Triggers ---

  createTrigger(
    name: string,
    type: string,
    schedule: string | undefined,
    predicate: GlueTrigger["predicate"] | undefined,
    actions: GlueTrigger["actions"],
    region: string,
  ): GlueTrigger {
    const key = this.regionKey(region, name);
    if (this.triggers.has(key)) {
      throw new AwsError("AlreadyExistsException", `Trigger ${name} already exists.`, 400);
    }
    const trigger: GlueTrigger = {
      name,
      arn: buildArn("glue", region, this.accountId, "trigger/", name),
      type,
      state: "CREATED",
      schedule,
      predicate,
      actions,
      createdAt: Date.now() / 1000,
    };
    this.triggers.set(key, trigger);
    return trigger;
  }

  getTrigger(name: string, region: string): GlueTrigger {
    const trigger = this.triggers.get(this.regionKey(region, name));
    if (!trigger) throw new AwsError("EntityNotFoundException", `Trigger ${name} not found.`, 400);
    return trigger;
  }

  listTriggers(region: string): string[] {
    return this.triggers.values()
      .filter((t) => t.arn.includes(`:${region}:`))
      .map((t) => t.name);
  }

  updateTrigger(
    name: string,
    schedule: string | undefined,
    actions: GlueTrigger["actions"] | undefined,
    region: string,
  ): GlueTrigger {
    const trigger = this.getTrigger(name, region);
    if (schedule !== undefined) trigger.schedule = schedule;
    if (actions !== undefined) trigger.actions = actions;
    return trigger;
  }

  startTrigger(name: string, region: string): void {
    const trigger = this.getTrigger(name, region);
    trigger.state = "ACTIVATED";
  }

  stopTrigger(name: string, region: string): void {
    const trigger = this.getTrigger(name, region);
    trigger.state = "DEACTIVATED";
  }

  deleteTrigger(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.triggers.has(key)) {
      throw new AwsError("EntityNotFoundException", `Trigger ${name} not found.`, 400);
    }
    this.triggers.delete(key);
  }

  // --- Connections ---

  createConnection(
    name: string,
    connectionType: string,
    connectionProperties: Record<string, string>,
    physicalConnectionRequirements: GlueConnection["physicalConnectionRequirements"] | undefined,
    region: string,
  ): GlueConnection {
    const key = this.regionKey(region, name);
    if (this.connections.has(key)) {
      throw new AwsError("AlreadyExistsException", `Connection ${name} already exists.`, 400);
    }
    const conn: GlueConnection = {
      name,
      connectionType,
      connectionProperties,
      physicalConnectionRequirements,
      creationTime: Date.now() / 1000,
    };
    this.connections.set(key, conn);
    return conn;
  }

  getConnection(name: string, region: string): GlueConnection {
    const conn = this.connections.get(this.regionKey(region, name));
    if (!conn) throw new AwsError("EntityNotFoundException", `Connection ${name} not found.`, 400);
    return conn;
  }

  getConnections(region: string): GlueConnection[] {
    return this.connections.values().filter((c) => {
      // connections don't have ARNs, use key-based region matching
      const key = this.regionKey(region, c.name);
      return this.connections.has(key);
    });
  }

  deleteConnection(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.connections.has(key)) {
      throw new AwsError("EntityNotFoundException", `Connection ${name} not found.`, 400);
    }
    this.connections.delete(key);
  }

  // --- Job Bookmarks ---

  getJobBookmark(jobName: string, region: string): GlueJobBookmark {
    const key = this.regionKey(region, jobName);
    const bookmark = this.jobBookmarks.get(key);
    if (!bookmark) {
      // Return an empty bookmark if none exists
      return {
        jobName,
        run: 0,
        attempt: 0,
        version: 0,
      };
    }
    return bookmark;
  }

  resetJobBookmark(jobName: string, region: string): GlueJobBookmark {
    const key = this.regionKey(region, jobName);
    const bookmark: GlueJobBookmark = {
      jobName,
      run: 0,
      attempt: 0,
      version: 0,
    };
    this.jobBookmarks.set(key, bookmark);
    return bookmark;
  }
}
