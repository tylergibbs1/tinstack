import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
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
