import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  GlueClient,
  CreateDatabaseCommand,
  GetDatabaseCommand,
  GetDatabasesCommand,
  UpdateDatabaseCommand,
  DeleteDatabaseCommand,
  CreateTableCommand,
  GetTableCommand,
  GetTablesCommand,
  UpdateTableCommand,
  DeleteTableCommand,
  CreatePartitionCommand,
  GetPartitionCommand,
  GetPartitionsCommand,
  BatchCreatePartitionCommand,
  CreateCrawlerCommand,
  GetCrawlerCommand,
  ListCrawlersCommand,
  StartCrawlerCommand,
  StopCrawlerCommand,
  DeleteCrawlerCommand,
  CreateJobCommand,
  GetJobCommand,
  GetJobsCommand,
  DeleteJobCommand,
  StartJobRunCommand,
  GetJobRunCommand,
  CreateTriggerCommand,
  GetTriggerCommand,
  ListTriggersCommand,
  UpdateTriggerCommand,
  StartTriggerCommand,
  StopTriggerCommand,
  DeleteTriggerCommand,
  CreateConnectionCommand,
  GetConnectionCommand,
  GetConnectionsCommand,
  DeleteConnectionCommand,
  GetJobBookmarkCommand,
  ResetJobBookmarkCommand,
} from "@aws-sdk/client-glue";
import { startServer, stopServer, clientConfig } from "./helpers";

const glue = new GlueClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Glue", () => {
  const dbName = "test_database";

  // --- Databases ---

  test("CreateDatabase", async () => {
    const res = await glue.send(new CreateDatabaseCommand({
      DatabaseInput: {
        Name: dbName,
        Description: "Test database",
        LocationUri: "s3://my-bucket/data/",
      },
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("CreateDatabase duplicate throws", async () => {
    await expect(
      glue.send(new CreateDatabaseCommand({
        DatabaseInput: { Name: dbName },
      })),
    ).rejects.toThrow();
  });

  test("GetDatabase", async () => {
    const res = await glue.send(new GetDatabaseCommand({ Name: dbName }));
    expect(res.Database?.Name).toBe(dbName);
    expect(res.Database?.Description).toBe("Test database");
    expect(res.Database?.LocationUri).toBe("s3://my-bucket/data/");
  });

  test("GetDatabases", async () => {
    const res = await glue.send(new GetDatabasesCommand({}));
    expect(res.DatabaseList?.some((db) => db.Name === dbName)).toBe(true);
  });

  test("UpdateDatabase", async () => {
    await glue.send(new UpdateDatabaseCommand({
      Name: dbName,
      DatabaseInput: { Name: dbName, Description: "Updated description" },
    }));
    const res = await glue.send(new GetDatabaseCommand({ Name: dbName }));
    expect(res.Database?.Description).toBe("Updated description");
  });

  // --- Tables ---

  const tableName = "test_table";

  test("CreateTable", async () => {
    const res = await glue.send(new CreateTableCommand({
      DatabaseName: dbName,
      TableInput: {
        Name: tableName,
        Description: "Test table",
        StorageDescriptor: {
          Columns: [
            { Name: "id", Type: "int" },
            { Name: "name", Type: "string" },
          ],
          Location: "s3://my-bucket/data/test_table/",
          InputFormat: "org.apache.hadoop.mapred.TextInputFormat",
          OutputFormat: "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
          SerdeInfo: {
            SerializationLibrary: "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe",
          },
        },
        PartitionKeys: [
          { Name: "year", Type: "int" },
        ],
      },
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("CreateTable duplicate throws", async () => {
    await expect(
      glue.send(new CreateTableCommand({
        DatabaseName: dbName,
        TableInput: { Name: tableName, StorageDescriptor: { Columns: [] } },
      })),
    ).rejects.toThrow();
  });

  test("GetTable", async () => {
    const res = await glue.send(new GetTableCommand({
      DatabaseName: dbName,
      Name: tableName,
    }));
    expect(res.Table?.Name).toBe(tableName);
    expect(res.Table?.DatabaseName).toBe(dbName);
    expect(res.Table?.StorageDescriptor?.Columns?.length).toBe(2);
    expect(res.Table?.PartitionKeys?.length).toBe(1);
  });

  test("GetTables", async () => {
    const res = await glue.send(new GetTablesCommand({ DatabaseName: dbName }));
    expect(res.TableList?.some((t) => t.Name === tableName)).toBe(true);
  });

  test("UpdateTable", async () => {
    await glue.send(new UpdateTableCommand({
      DatabaseName: dbName,
      TableInput: {
        Name: tableName,
        Description: "Updated table",
        StorageDescriptor: {
          Columns: [
            { Name: "id", Type: "int" },
            { Name: "name", Type: "string" },
            { Name: "email", Type: "string" },
          ],
          Location: "s3://my-bucket/data/test_table/",
        },
      },
    }));
    const res = await glue.send(new GetTableCommand({ DatabaseName: dbName, Name: tableName }));
    expect(res.Table?.Description).toBe("Updated table");
    expect(res.Table?.StorageDescriptor?.Columns?.length).toBe(3);
  });

  // --- Partitions ---

  test("CreatePartition", async () => {
    const res = await glue.send(new CreatePartitionCommand({
      DatabaseName: dbName,
      TableName: tableName,
      PartitionInput: {
        Values: ["2024"],
        StorageDescriptor: {
          Columns: [{ Name: "id", Type: "int" }, { Name: "name", Type: "string" }],
          Location: "s3://my-bucket/data/test_table/year=2024/",
        },
      },
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("GetPartition", async () => {
    const res = await glue.send(new GetPartitionCommand({
      DatabaseName: dbName,
      TableName: tableName,
      PartitionValues: ["2024"],
    }));
    expect(res.Partition?.Values).toEqual(["2024"]);
  });

  test("GetPartitions", async () => {
    const res = await glue.send(new GetPartitionsCommand({
      DatabaseName: dbName,
      TableName: tableName,
    }));
    expect(res.Partitions?.length).toBeGreaterThan(0);
  });

  test("BatchCreatePartition", async () => {
    const res = await glue.send(new BatchCreatePartitionCommand({
      DatabaseName: dbName,
      TableName: tableName,
      PartitionInputList: [
        {
          Values: ["2025"],
          StorageDescriptor: {
            Columns: [{ Name: "id", Type: "int" }],
            Location: "s3://my-bucket/data/test_table/year=2025/",
          },
        },
        {
          Values: ["2026"],
          StorageDescriptor: {
            Columns: [{ Name: "id", Type: "int" }],
            Location: "s3://my-bucket/data/test_table/year=2026/",
          },
        },
      ],
    }));
    expect(res.Errors?.length).toBe(0);

    const partitions = await glue.send(new GetPartitionsCommand({
      DatabaseName: dbName,
      TableName: tableName,
    }));
    expect(partitions.Partitions?.length).toBe(3);
  });

  // --- Crawlers ---

  const crawlerName = "test-crawler";

  test("CreateCrawler", async () => {
    const res = await glue.send(new CreateCrawlerCommand({
      Name: crawlerName,
      Role: "arn:aws:iam::123456789012:role/GlueCrawlerRole",
      DatabaseName: dbName,
      Targets: {
        S3Targets: [{ Path: "s3://my-bucket/data/" }],
      },
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("GetCrawler", async () => {
    const res = await glue.send(new GetCrawlerCommand({ Name: crawlerName }));
    expect(res.Crawler?.Name).toBe(crawlerName);
    expect(res.Crawler?.State).toBe("READY");
    expect(res.Crawler?.Targets?.S3Targets?.length).toBe(1);
  });

  test("ListCrawlers", async () => {
    const res = await glue.send(new ListCrawlersCommand({}));
    expect(res.CrawlerNames?.includes(crawlerName)).toBe(true);
  });

  test("StartCrawler", async () => {
    const res = await glue.send(new StartCrawlerCommand({ Name: crawlerName }));
    expect(res.$metadata.httpStatusCode).toBe(200);
    // Mock: crawler goes RUNNING then immediately READY
    const crawler = await glue.send(new GetCrawlerCommand({ Name: crawlerName }));
    expect(crawler.Crawler?.State).toBe("READY");
  });

  test("StopCrawler", async () => {
    const res = await glue.send(new StopCrawlerCommand({ Name: crawlerName }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("DeleteCrawler", async () => {
    await glue.send(new DeleteCrawlerCommand({ Name: crawlerName }));
    await expect(
      glue.send(new GetCrawlerCommand({ Name: crawlerName })),
    ).rejects.toThrow();
  });

  // --- Jobs ---

  const jobName = "test-job";

  test("CreateJob", async () => {
    const res = await glue.send(new CreateJobCommand({
      Name: jobName,
      Role: "arn:aws:iam::123456789012:role/GlueJobRole",
      Command: {
        Name: "glueetl",
        ScriptLocation: "s3://my-bucket/scripts/etl.py",
      },
      DefaultArguments: { "--TempDir": "s3://my-bucket/temp/" },
    }));
    expect(res.Name).toBe(jobName);
  });

  test("GetJob", async () => {
    const res = await glue.send(new GetJobCommand({ JobName: jobName }));
    expect(res.Job?.Name).toBe(jobName);
    expect(res.Job?.Command?.ScriptLocation).toBe("s3://my-bucket/scripts/etl.py");
  });

  test("GetJobs", async () => {
    const res = await glue.send(new GetJobsCommand({}));
    expect(res.Jobs?.some((j) => j.Name === jobName)).toBe(true);
  });

  let jobRunId: string;

  test("StartJobRun", async () => {
    const res = await glue.send(new StartJobRunCommand({ JobName: jobName }));
    jobRunId = res.JobRunId!;
    expect(jobRunId).toBeDefined();
  });

  test("GetJobRun", async () => {
    const res = await glue.send(new GetJobRunCommand({
      JobName: jobName,
      RunId: jobRunId,
    }));
    expect(res.JobRun?.Id).toBe(jobRunId);
    expect(res.JobRun?.JobRunState).toBe("SUCCEEDED");
  });

  test("DeleteJob", async () => {
    const res = await glue.send(new DeleteJobCommand({ JobName: jobName }));
    expect(res.JobName).toBe(jobName);
    await expect(
      glue.send(new GetJobCommand({ JobName: jobName })),
    ).rejects.toThrow();
  });

  // --- Cleanup ---

  test("DeleteTable", async () => {
    await glue.send(new DeleteTableCommand({ DatabaseName: dbName, Name: tableName }));
    await expect(
      glue.send(new GetTableCommand({ DatabaseName: dbName, Name: tableName })),
    ).rejects.toThrow();
  });

  test("DeleteDatabase", async () => {
    await glue.send(new DeleteDatabaseCommand({ Name: dbName }));
    await expect(
      glue.send(new GetDatabaseCommand({ Name: dbName })),
    ).rejects.toThrow();
  });

  // --- Triggers ---

  const triggerName = "test-trigger";

  test("CreateTrigger", async () => {
    const res = await glue.send(new CreateTriggerCommand({
      Name: triggerName,
      Type: "SCHEDULED",
      Schedule: "cron(0 12 * * ? *)",
      Actions: [{ JobName: "some-job" }],
    }));
    expect(res.Name).toBe(triggerName);
  });

  test("CreateTrigger - duplicate fails", async () => {
    await expect(
      glue.send(new CreateTriggerCommand({
        Name: triggerName,
        Type: "ON_DEMAND",
        Actions: [{ JobName: "some-job" }],
      })),
    ).rejects.toThrow();
  });

  test("GetTrigger", async () => {
    const res = await glue.send(new GetTriggerCommand({ Name: triggerName }));
    expect(res.Trigger?.Name).toBe(triggerName);
    expect(res.Trigger?.Type).toBe("SCHEDULED");
    expect(res.Trigger?.State).toBe("CREATED");
    expect(res.Trigger?.Schedule).toBe("cron(0 12 * * ? *)");
    expect(res.Trigger?.Actions?.length).toBe(1);
    expect(res.Trigger?.Actions?.[0].JobName).toBe("some-job");
  });

  test("ListTriggers", async () => {
    const res = await glue.send(new ListTriggersCommand({}));
    expect(res.TriggerNames?.includes(triggerName)).toBe(true);
  });

  test("StartTrigger", async () => {
    const res = await glue.send(new StartTriggerCommand({ Name: triggerName }));
    expect(res.Name).toBe(triggerName);
    const get = await glue.send(new GetTriggerCommand({ Name: triggerName }));
    expect(get.Trigger?.State).toBe("ACTIVATED");
  });

  test("StopTrigger", async () => {
    const res = await glue.send(new StopTriggerCommand({ Name: triggerName }));
    expect(res.Name).toBe(triggerName);
    const get = await glue.send(new GetTriggerCommand({ Name: triggerName }));
    expect(get.Trigger?.State).toBe("DEACTIVATED");
  });

  test("UpdateTrigger", async () => {
    const res = await glue.send(new UpdateTriggerCommand({
      Name: triggerName,
      TriggerUpdate: {
        Schedule: "cron(0 6 * * ? *)",
        Actions: [{ JobName: "updated-job", Arguments: { "--key": "value" } }],
      },
    }));
    expect(res.Trigger?.Schedule).toBe("cron(0 6 * * ? *)");
    expect(res.Trigger?.Actions?.[0].JobName).toBe("updated-job");
  });

  test("DeleteTrigger", async () => {
    await glue.send(new DeleteTriggerCommand({ Name: triggerName }));
    await expect(
      glue.send(new GetTriggerCommand({ Name: triggerName })),
    ).rejects.toThrow();
  });

  // --- Triggers with predicate (CONDITIONAL) ---

  test("CreateTrigger - CONDITIONAL with predicate", async () => {
    const res = await glue.send(new CreateTriggerCommand({
      Name: "conditional-trigger",
      Type: "CONDITIONAL",
      Predicate: {
        Logical: "AND",
        Conditions: [
          { LogicalOperator: "EQUALS", JobName: "upstream-job", State: "SUCCEEDED" },
        ],
      },
      Actions: [{ JobName: "downstream-job" }],
    }));
    expect(res.Name).toBe("conditional-trigger");

    const get = await glue.send(new GetTriggerCommand({ Name: "conditional-trigger" }));
    expect(get.Trigger?.Type).toBe("CONDITIONAL");
    expect(get.Trigger?.Predicate?.Conditions?.length).toBe(1);
    expect(get.Trigger?.Predicate?.Conditions?.[0].JobName).toBe("upstream-job");

    // Cleanup
    await glue.send(new DeleteTriggerCommand({ Name: "conditional-trigger" }));
  });

  // --- Connections ---

  const connectionName = "test-connection";

  test("CreateConnection", async () => {
    const res = await glue.send(new CreateConnectionCommand({
      ConnectionInput: {
        Name: connectionName,
        ConnectionType: "JDBC",
        ConnectionProperties: {
          JDBC_CONNECTION_URL: "jdbc:mysql://localhost:3306/mydb",
          USERNAME: "admin",
          PASSWORD: "secret",
        },
        PhysicalConnectionRequirements: {
          SubnetId: "subnet-12345",
          SecurityGroupIdList: ["sg-12345"],
          AvailabilityZone: "us-east-1a",
        },
      },
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("CreateConnection - duplicate fails", async () => {
    await expect(
      glue.send(new CreateConnectionCommand({
        ConnectionInput: {
          Name: connectionName,
          ConnectionType: "JDBC",
          ConnectionProperties: {},
        },
      })),
    ).rejects.toThrow();
  });

  test("GetConnection", async () => {
    const res = await glue.send(new GetConnectionCommand({ Name: connectionName }));
    expect(res.Connection?.Name).toBe(connectionName);
    expect(res.Connection?.ConnectionType).toBe("JDBC");
    expect(res.Connection?.ConnectionProperties?.JDBC_CONNECTION_URL).toBe("jdbc:mysql://localhost:3306/mydb");
    expect(res.Connection?.PhysicalConnectionRequirements?.SubnetId).toBe("subnet-12345");
  });

  test("GetConnections", async () => {
    const res = await glue.send(new GetConnectionsCommand({}));
    expect(res.ConnectionList?.some((c) => c.Name === connectionName)).toBe(true);
  });

  test("DeleteConnection", async () => {
    await glue.send(new DeleteConnectionCommand({ ConnectionName: connectionName }));
    await expect(
      glue.send(new GetConnectionCommand({ Name: connectionName })),
    ).rejects.toThrow();
  });

  // --- Job Bookmarks ---

  test("GetJobBookmark - empty for new job", async () => {
    const res = await glue.send(new GetJobBookmarkCommand({ JobName: "bookmark-test-job" }));
    expect(res.JobBookmarkEntry).toBeDefined();
    expect(res.JobBookmarkEntry?.JobName).toBe("bookmark-test-job");
    expect(res.JobBookmarkEntry?.Version).toBe(0);
    expect(res.JobBookmarkEntry?.Run).toBe(0);
  });

  test("ResetJobBookmark", async () => {
    const res = await glue.send(new ResetJobBookmarkCommand({ JobName: "bookmark-test-job" }));
    expect(res.JobBookmarkEntry).toBeDefined();
    expect(res.JobBookmarkEntry?.JobName).toBe("bookmark-test-job");
    expect(res.JobBookmarkEntry?.Version).toBe(0);
  });
});
