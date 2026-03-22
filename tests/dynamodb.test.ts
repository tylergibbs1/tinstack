import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
  UpdateTableCommand,
  DescribeEndpointsCommand,
  CreateBackupCommand,
  DescribeBackupCommand,
  ListBackupsCommand,
  DeleteBackupCommand,
  RestoreTableFromBackupCommand,
  UpdateContinuousBackupsCommand,
  DescribeContinuousBackupsCommand,
  ExecuteStatementCommand,
  BatchExecuteStatementCommand,
  ExecuteTransactionCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
  BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import { startServer, stopServer, clientConfig } from "./helpers";

const ddb = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(ddb);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("DynamoDB", () => {
  const tableName = "test-table-" + Date.now();

  test("CreateTable", async () => {
    const res = await ddb.send(new CreateTableCommand({
      TableName: tableName,
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }));
    expect(res.TableDescription?.TableStatus).toBe("ACTIVE");
    expect(res.TableDescription?.TableArn).toContain(tableName);
  });

  test("DescribeTable", async () => {
    const res = await ddb.send(new DescribeTableCommand({ TableName: tableName }));
    expect(res.Table?.TableName).toBe(tableName);
  });

  test("ListTables", async () => {
    const res = await ddb.send(new ListTablesCommand({}));
    expect(res.TableNames?.includes(tableName)).toBe(true);
  });

  test("PutItem + GetItem", async () => {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: "user#1", sk: "profile", name: "Alice", age: 30 },
    }));

    const get = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: { pk: "user#1", sk: "profile" },
    }));
    expect(get.Item?.name).toBe("Alice");
    expect(get.Item?.age).toBe(30);
  });

  test("UpdateItem", async () => {
    const res = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: "user#1", sk: "profile" },
      UpdateExpression: "SET age = age + :inc, #n = :name",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: { ":inc": 1, ":name": "Alice Updated" },
      ReturnValues: "ALL_NEW",
    }));
    expect(res.Attributes?.age).toBe(31);
    expect(res.Attributes?.name).toBe("Alice Updated");
  });

  test("Query", async () => {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: "user#1", sk: "order#001", total: 50 },
    }));
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: "user#1", sk: "order#002", total: 75 },
    }));

    const res = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": "user#1", ":prefix": "order#" },
    }));
    expect(res.Count).toBe(2);
    expect(res.Items?.length).toBe(2);
  });

  test("Scan with filter", async () => {
    const res = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: "attribute_exists(age)",
    }));
    expect(res.Items?.length).toBeGreaterThan(0);
  });

  test("DeleteItem", async () => {
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: "user#1", sk: "order#001" },
    }));

    const get = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: { pk: "user#1", sk: "order#001" },
    }));
    expect(get.Item).toBeUndefined();
  });

  test("BatchWriteItem + BatchGetItem", async () => {
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: [
          { PutRequest: { Item: { pk: "batch#1", sk: "a", data: "x" } } },
          { PutRequest: { Item: { pk: "batch#1", sk: "b", data: "y" } } },
          { PutRequest: { Item: { pk: "batch#1", sk: "c", data: "z" } } },
        ],
      },
    }));

    const get = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: [
            { pk: "batch#1", sk: "a" },
            { pk: "batch#1", sk: "b" },
          ],
        },
      },
    }));
    expect(get.Responses?.[tableName]?.length).toBe(2);
  });

  test("ConditionExpression", async () => {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: "cond#1", sk: "test", value: "original" },
    }));

    try {
      await docClient.send(new PutCommand({
        TableName: tableName,
        Item: { pk: "cond#1", sk: "test", value: "new" },
        ConditionExpression: "attribute_not_exists(pk)",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ConditionalCheckFailedException");
    }
  });

  test("DeleteTable", async () => {
    const res = await ddb.send(new DeleteTableCommand({ TableName: tableName }));
    expect(res.TableDescription?.TableStatus).toBe("DELETING");
  });
});

describe("DynamoDB UpdateTable", () => {
  const tableName = "update-table-" + Date.now();

  test("create table for update tests", async () => {
    await ddb.send(new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "gsiKey", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }));
  });

  test("UpdateTable - change BillingMode", async () => {
    const res = await ddb.send(new UpdateTableCommand({
      TableName: tableName,
      BillingMode: "PROVISIONED",
      ProvisionedThroughput: { ReadCapacityUnits: 10, WriteCapacityUnits: 5 },
    }));
    expect(res.TableDescription?.BillingModeSummary?.BillingMode).toBe("PROVISIONED");
    expect(res.TableDescription?.ProvisionedThroughput?.ReadCapacityUnits).toBe(10);
    expect(res.TableDescription?.ProvisionedThroughput?.WriteCapacityUnits).toBe(5);
  });

  test("UpdateTable - add GSI", async () => {
    const res = await ddb.send(new UpdateTableCommand({
      TableName: tableName,
      GlobalSecondaryIndexUpdates: [{
        Create: {
          IndexName: "gsi-1",
          KeySchema: [{ AttributeName: "gsiKey", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      }],
    }));
    expect(res.TableDescription?.GlobalSecondaryIndexes?.length).toBe(1);
    expect(res.TableDescription?.GlobalSecondaryIndexes?.[0].IndexName).toBe("gsi-1");
  });

  test("UpdateTable - add duplicate GSI throws", async () => {
    try {
      await ddb.send(new UpdateTableCommand({
        TableName: tableName,
        GlobalSecondaryIndexUpdates: [{
          Create: {
            IndexName: "gsi-1",
            KeySchema: [{ AttributeName: "gsiKey", KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
          },
        }],
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ValidationException");
    }
  });

  test("UpdateTable - delete GSI", async () => {
    const res = await ddb.send(new UpdateTableCommand({
      TableName: tableName,
      GlobalSecondaryIndexUpdates: [{ Delete: { IndexName: "gsi-1" } }],
    }));
    expect(res.TableDescription?.GlobalSecondaryIndexes).toBeUndefined();
  });

  test("UpdateTable - update StreamSpecification", async () => {
    const res = await ddb.send(new UpdateTableCommand({
      TableName: tableName,
      StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" },
    }));
    expect(res.TableDescription?.StreamSpecification?.StreamEnabled).toBe(true);
    expect(res.TableDescription?.StreamSpecification?.StreamViewType).toBe("NEW_AND_OLD_IMAGES");
  });

  test("cleanup", async () => {
    await ddb.send(new DeleteTableCommand({ TableName: tableName }));
  });
});

describe("DynamoDB DescribeEndpoints", () => {
  test("DescribeEndpoints returns mock endpoint", async () => {
    const res = await ddb.send(new DescribeEndpointsCommand({}));
    expect(res.Endpoints!.length).toBeGreaterThan(0);
    expect(res.Endpoints![0].Address).toBeDefined();
    expect(res.Endpoints![0].CachePeriodInMinutes).toBeDefined();
  });
});

describe("DynamoDB PartiQL", () => {
  const tableName = "partiql-table-" + Date.now();

  test("setup table", async () => {
    await ddb.send(new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
  });

  test("ExecuteStatement SELECT returns items", async () => {
    // Insert items via PutCommand first
    await docClient.send(new PutCommand({ TableName: tableName, Item: { pk: "a1", name: "Alice" } }));
    await docClient.send(new PutCommand({ TableName: tableName, Item: { pk: "b2", name: "Bob" } }));

    const res = await ddb.send(new ExecuteStatementCommand({
      Statement: `SELECT * FROM "${tableName}" WHERE pk = ?`,
      Parameters: [{ S: "a1" }],
    }));
    expect(res.Items).toBeDefined();
    expect(res.Items!.length).toBe(1);
    expect(res.Items![0].pk.S).toBe("a1");
  });

  test("ExecuteStatement SELECT without WHERE returns all items", async () => {
    const res = await ddb.send(new ExecuteStatementCommand({
      Statement: `SELECT * FROM "${tableName}"`,
    }));
    expect(res.Items).toBeDefined();
    expect(res.Items!.length).toBeGreaterThanOrEqual(2);
  });

  test("BatchExecuteStatement executes multiple statements", async () => {
    const res = await ddb.send(new BatchExecuteStatementCommand({
      Statements: [
        { Statement: `SELECT * FROM "${tableName}" WHERE pk = ?`, Parameters: [{ S: "a1" }] },
        { Statement: `SELECT * FROM "${tableName}" WHERE pk = ?`, Parameters: [{ S: "b2" }] },
      ],
    }));
    expect(res.Responses).toBeDefined();
    expect(res.Responses!.length).toBe(2);
  });

  test("ExecuteTransaction executes statements transactionally", async () => {
    const res = await ddb.send(new ExecuteTransactionCommand({
      TransactStatements: [
        { Statement: `SELECT * FROM "${tableName}" WHERE pk = ?`, Parameters: [{ S: "a1" }] },
      ],
    }));
    expect(res.Responses).toBeDefined();
    expect(res.Responses!.length).toBe(1);
  });

  test("cleanup", async () => {
    await ddb.send(new DeleteTableCommand({ TableName: tableName }));
  });
});

describe("DynamoDB nested attribute operations", () => {
  const tableName = "nested-attr-table-" + Date.now();

  test("setup table", async () => {
    await ddb.send(new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
  });

  test("UpdateItem SET nested map path", async () => {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: "nested#1", info: { title: "Movie", rating: 5 } },
    }));

    const res = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: "nested#1" },
      UpdateExpression: "SET info.rating = :r",
      ExpressionAttributeValues: { ":r": 8 },
      ReturnValues: "ALL_NEW",
    }));
    expect(res.Attributes?.info?.rating).toBe(8);
    expect(res.Attributes?.info?.title).toBe("Movie");
  });

  test("UpdateItem SET list element by index", async () => {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: "nested#2", tags: ["old", "keep"] },
    }));

    const res = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: "nested#2" },
      UpdateExpression: "SET tags[0] = :val",
      ExpressionAttributeValues: { ":val": "new" },
      ReturnValues: "ALL_NEW",
    }));
    expect(res.Attributes?.tags?.[0]).toBe("new");
    expect(res.Attributes?.tags?.[1]).toBe("keep");
  });

  test("UpdateItem REMOVE nested map key", async () => {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: "nested#3", info: { title: "Movie", rating: 5 } },
    }));

    const res = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: "nested#3" },
      UpdateExpression: "REMOVE info.rating",
      ReturnValues: "ALL_NEW",
    }));
    expect(res.Attributes?.info?.title).toBe("Movie");
    expect(res.Attributes?.info?.rating).toBeUndefined();
  });

  test("Query with ProjectionExpression on nested path", async () => {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: "nested#4", info: { title: "Movie", rating: 9 }, other: "data" },
    }));

    const res = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "nested#4" },
      ProjectionExpression: "info.rating",
    }));
    expect(res.Items?.length).toBe(1);
    const item = res.Items![0];
    expect(item.info?.rating).toBe(9);
    expect(item.info?.title).toBeUndefined();
    expect(item.other).toBeUndefined();
  });

  test("UpdateItem SET creates intermediate maps", async () => {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: "nested#5" },
    }));

    const res = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: "nested#5" },
      UpdateExpression: "SET a.b.c = :val",
      ExpressionAttributeValues: { ":val": "deep" },
      ReturnValues: "ALL_NEW",
    }));
    expect(res.Attributes?.a?.b?.c).toBe("deep");
  });

  test("cleanup", async () => {
    await ddb.send(new DeleteTableCommand({ TableName: tableName }));
  });
});

describe("DynamoDB Backups", () => {
  const tableName = "backup-table-" + Date.now();
  let backupArn: string;

  test("setup table", async () => {
    await ddb.send(new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
  });

  test("CreateBackup", async () => {
    const res = await ddb.send(new CreateBackupCommand({
      TableName: tableName,
      BackupName: "my-backup",
    }));
    expect(res.BackupDetails).toBeDefined();
    expect(res.BackupDetails!.BackupArn).toBeDefined();
    expect(res.BackupDetails!.BackupName).toBe("my-backup");
    expect(res.BackupDetails!.BackupStatus).toBe("AVAILABLE");
    backupArn = res.BackupDetails!.BackupArn!;
  });

  test("DescribeBackup", async () => {
    const res = await ddb.send(new DescribeBackupCommand({ BackupArn: backupArn }));
    expect(res.BackupDescription).toBeDefined();
    expect(res.BackupDescription!.BackupDetails!.BackupName).toBe("my-backup");
    expect(res.BackupDescription!.SourceTableDetails!.TableName).toBe(tableName);
  });

  test("ListBackups", async () => {
    const res = await ddb.send(new ListBackupsCommand({ TableName: tableName }));
    expect(res.BackupSummaries).toBeDefined();
    expect(res.BackupSummaries!.length).toBeGreaterThanOrEqual(1);
    expect(res.BackupSummaries![0].BackupName).toBe("my-backup");
  });

  test("RestoreTableFromBackup", async () => {
    const restoredName = "restored-" + Date.now();
    const res = await ddb.send(new RestoreTableFromBackupCommand({
      BackupArn: backupArn,
      TargetTableName: restoredName,
    }));
    expect(res.TableDescription).toBeDefined();
    expect(res.TableDescription!.TableName).toBe(restoredName);
    expect(res.TableDescription!.TableStatus).toBe("ACTIVE");
    // Cleanup
    await ddb.send(new DeleteTableCommand({ TableName: restoredName }));
  });

  test("DeleteBackup", async () => {
    const res = await ddb.send(new DeleteBackupCommand({ BackupArn: backupArn }));
    expect(res.BackupDescription!.BackupDetails!.BackupStatus).toBe("DELETED");
  });

  test("UpdateContinuousBackups", async () => {
    const res = await ddb.send(new UpdateContinuousBackupsCommand({
      TableName: tableName,
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    }));
    expect(res.ContinuousBackupsDescription).toBeDefined();
    expect(res.ContinuousBackupsDescription!.PointInTimeRecoveryDescription!.PointInTimeRecoveryStatus).toBe("ENABLED");
  });

  test("DescribeContinuousBackups after enable", async () => {
    const res = await ddb.send(new DescribeContinuousBackupsCommand({ TableName: tableName }));
    expect(res.ContinuousBackupsDescription!.PointInTimeRecoveryDescription!.PointInTimeRecoveryStatus).toBe("ENABLED");
  });

  test("cleanup", async () => {
    await ddb.send(new DeleteTableCommand({ TableName: tableName }));
  });
});
