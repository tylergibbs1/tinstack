import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { SQSClient, CreateQueueCommand, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, GetQueueAttributesCommand, DeleteQueueCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand, DeleteSecretCommand } from "@aws-sdk/client-secrets-manager";
import { SFNClient, CreateStateMachineCommand, StartExecutionCommand, DescribeExecutionCommand, DeleteStateMachineCommand } from "@aws-sdk/client-sfn";
import { startServer, stopServer, clientConfig } from "./helpers";

const s3 = new S3Client(clientConfig);
const sqs = new SQSClient(clientConfig);
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));
const sm = new SecretsManagerClient(clientConfig);
const sfn = new SFNClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("S3 edge cases", () => {
  const bucket = "edge-s3-" + Date.now();

  test("GetObject on non-existent bucket throws NoSuchBucket", async () => {
    try {
      await s3.send(new GetObjectCommand({ Bucket: "nonexistent-bucket-xyz", Key: "k" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("NoSuchBucket");
    }
  });

  test("GetObject on non-existent key throws NoSuchKey", async () => {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    try {
      await s3.send(new GetObjectCommand({ Bucket: bucket, Key: "missing-key" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("NoSuchKey");
    }
  });

  test("PutObject with empty body", async () => {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "empty.txt", Body: "" }));
    const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: "empty.txt" }));
    const body = await get.Body!.transformToString();
    expect(body).toBe("");
  });

  test("PutObject with unicode key and metadata", async () => {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: "folder/sub folder/file with spaces.txt",
      Body: "unicode content: é à ü ñ 中文",
      Metadata: { "custom-header": "test-value" },
    }));
    const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: "folder/sub folder/file with spaces.txt" }));
    const body = await get.Body!.transformToString();
    expect(body).toBe("unicode content: é à ü ñ 中文");
  });

  test("ListObjectsV2 with prefix returns correct results", async () => {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "a/1.txt", Body: "1" }));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "a/2.txt", Body: "2" }));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "b/1.txt", Body: "3" }));

    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "a/" }));
    expect(res.Contents?.length).toBe(2);
    expect(res.Contents?.every((c) => c.Key?.startsWith("a/"))).toBe(true);
  });

  test("Overwrite existing object", async () => {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "overwrite.txt", Body: "v1" }));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: "overwrite.txt", Body: "v2" }));
    const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: "overwrite.txt" }));
    expect(await get.Body!.transformToString()).toBe("v2");
  });

  test("DeleteObject on non-existent key succeeds silently", async () => {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: "never-existed" }));
    // Should not throw
  });

  test("CreateBucket that already exists returns success", async () => {
    // AWS returns success for idempotent create if same owner
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (e: any) {
      expect(e.name).toBe("BucketAlreadyOwnedByYou");
    }
  });
});

describe("SQS edge cases", () => {
  let queueUrl: string;

  test("Send and receive large message", async () => {
    const res = await sqs.send(new CreateQueueCommand({ QueueName: "edge-queue-" + Date.now() }));
    queueUrl = res.QueueUrl!;

    const largeBody = "x".repeat(200_000); // 200KB
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: largeBody }));
    const recv = await sqs.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 1 }));
    expect(recv.Messages?.[0].Body?.length).toBe(200_000);
  });

  test("Receive with no messages returns empty", async () => {
    const emptyQ = await sqs.send(new CreateQueueCommand({ QueueName: "empty-queue-" + Date.now() }));
    const recv = await sqs.send(new ReceiveMessageCommand({ QueueUrl: emptyQ.QueueUrl!, MaxNumberOfMessages: 10 }));
    expect(recv.Messages?.length ?? 0).toBe(0);
  });

  test("Visibility timeout hides message", async () => {
    const q = await sqs.send(new CreateQueueCommand({ QueueName: "vis-queue-" + Date.now() }));
    await sqs.send(new SendMessageCommand({ QueueUrl: q.QueueUrl!, MessageBody: "hidden" }));

    // Receive with 30s visibility timeout
    const recv1 = await sqs.send(new ReceiveMessageCommand({ QueueUrl: q.QueueUrl!, MaxNumberOfMessages: 1, VisibilityTimeout: 30 }));
    expect(recv1.Messages?.length).toBe(1);

    // Immediately try to receive again — message should be hidden
    const recv2 = await sqs.send(new ReceiveMessageCommand({ QueueUrl: q.QueueUrl!, MaxNumberOfMessages: 1 }));
    expect(recv2.Messages?.length ?? 0).toBe(0);
  });

  test("Delete message then receive returns empty", async () => {
    const q = await sqs.send(new CreateQueueCommand({ QueueName: "del-queue-" + Date.now() }));
    await sqs.send(new SendMessageCommand({ QueueUrl: q.QueueUrl!, MessageBody: "delete me" }));
    const recv = await sqs.send(new ReceiveMessageCommand({ QueueUrl: q.QueueUrl!, MaxNumberOfMessages: 1, VisibilityTimeout: 0 }));
    await sqs.send(new DeleteMessageCommand({ QueueUrl: q.QueueUrl!, ReceiptHandle: recv.Messages![0].ReceiptHandle! }));
    const recv2 = await sqs.send(new ReceiveMessageCommand({ QueueUrl: q.QueueUrl!, MaxNumberOfMessages: 1 }));
    expect(recv2.Messages?.length ?? 0).toBe(0);
  });

  test("GetQueueAttributes on non-existent queue throws", async () => {
    try {
      await sqs.send(new GetQueueAttributesCommand({ QueueUrl: "http://localhost:4566/000000000000/nonexistent", AttributeNames: ["All"] }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });
});

describe("DynamoDB edge cases", () => {
  const tableName = "edge-ddb-" + Date.now();

  beforeAll(async () => {
    await new DynamoDBClient(clientConfig).send(new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }, { AttributeName: "sk", KeyType: "RANGE" }],
      AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }, { AttributeName: "sk", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
  });

  afterAll(async () => {
    await new DynamoDBClient(clientConfig).send(new DeleteTableCommand({ TableName: tableName }));
  });

  test("GetItem for non-existent item returns empty", async () => {
    const res = await ddb.send(new GetCommand({ TableName: tableName, Key: { pk: "missing", sk: "missing" } }));
    expect(res.Item).toBeUndefined();
  });

  test("UpdateItem creates item if not exists (upsert)", async () => {
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: "upsert", sk: "test" },
      UpdateExpression: "SET #v = :val",
      ExpressionAttributeNames: { "#v": "value" },
      ExpressionAttributeValues: { ":val": "created" },
    }));
    const res = await ddb.send(new GetCommand({ TableName: tableName, Key: { pk: "upsert", sk: "test" } }));
    expect(res.Item?.value).toBe("created");
  });

  test("UpdateItem with if_not_exists", async () => {
    await ddb.send(new PutCommand({ TableName: tableName, Item: { pk: "ine", sk: "1", counter: 10 } }));
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: "ine", sk: "1" },
      UpdateExpression: "SET counter = if_not_exists(counter, :zero) + :inc",
      ExpressionAttributeValues: { ":zero": 0, ":inc": 1 },
    }));
    const res = await ddb.send(new GetCommand({ TableName: tableName, Key: { pk: "ine", sk: "1" } }));
    expect(res.Item?.counter).toBe(11); // 10 + 1, not 0 + 1
  });

  test("ConditionExpression attribute_exists fails on missing attr", async () => {
    await ddb.send(new PutCommand({ TableName: tableName, Item: { pk: "cond", sk: "1", name: "test" } }));
    try {
      await ddb.send(new PutCommand({
        TableName: tableName,
        Item: { pk: "cond", sk: "1", name: "new" },
        ConditionExpression: "attribute_exists(missing_field)",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ConditionalCheckFailedException");
    }
  });

  test("Query with begins_with on sort key", async () => {
    await ddb.send(new PutCommand({ TableName: tableName, Item: { pk: "qry", sk: "order#001", total: 10 } }));
    await ddb.send(new PutCommand({ TableName: tableName, Item: { pk: "qry", sk: "order#002", total: 20 } }));
    await ddb.send(new PutCommand({ TableName: tableName, Item: { pk: "qry", sk: "profile", name: "Alice" } }));

    const res = await ddb.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": "qry", ":prefix": "order#" },
    }));
    expect(res.Count).toBe(2);
  });

  test("Scan with multiple filters", async () => {
    await ddb.send(new PutCommand({ TableName: tableName, Item: { pk: "scan", sk: "1", age: 25, active: true } }));
    await ddb.send(new PutCommand({ TableName: tableName, Item: { pk: "scan", sk: "2", age: 35, active: false } }));
    await ddb.send(new PutCommand({ TableName: tableName, Item: { pk: "scan", sk: "3", age: 45, active: true } }));

    const res = await ddb.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: "age > :minAge AND active = :active",
      ExpressionAttributeValues: { ":minAge": 30, ":active": true },
    }));
    expect(res.Count).toBe(1);
    expect(res.Items?.[0].age).toBe(45);
  });

  test("Delete with condition", async () => {
    await ddb.send(new PutCommand({ TableName: tableName, Item: { pk: "delcond", sk: "1", status: "pending" } }));

    // This should fail — status is "pending" not "completed"
    try {
      await ddb.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk: "delcond", sk: "1" },
        ConditionExpression: "#s = :expected",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":expected": "completed" },
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ConditionalCheckFailedException");
    }

    // Verify item still exists
    const res = await ddb.send(new GetCommand({ TableName: tableName, Key: { pk: "delcond", sk: "1" } }));
    expect(res.Item?.status).toBe("pending");
  });
});

describe("Secrets Manager edge cases", () => {
  test("Create duplicate secret throws", async () => {
    const name = "edge-secret-" + Date.now();
    await sm.send(new CreateSecretCommand({ Name: name, SecretString: "v1" }));
    try {
      await sm.send(new CreateSecretCommand({ Name: name, SecretString: "v2" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceExistsException");
    }
    await sm.send(new DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }));
  });

  test("Get deleted secret throws", async () => {
    const name = "deleted-secret-" + Date.now();
    await sm.send(new CreateSecretCommand({ Name: name, SecretString: "temp" }));
    await sm.send(new DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }));
    try {
      await sm.send(new GetSecretValueCommand({ SecretId: name }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });
});

describe("Step Functions edge cases", () => {
  test("Retry with catch fallback", async () => {
    const def = JSON.stringify({
      StartAt: "TaskState",
      States: {
        TaskState: {
          Type: "Task",
          Resource: "arn:aws:lambda:us-east-1:000000000000:function:nonexistent-fn",
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "Fallback", ResultPath: "$.error" }],
          End: true,
        },
        Fallback: {
          Type: "Pass",
          Result: { recovered: true },
          End: true,
        },
      },
    });

    const create = await sfn.send(new CreateStateMachineCommand({
      name: "catch-machine-" + Date.now(),
      definition: def,
      roleArn: "arn:aws:iam::000000000000:role/role",
    }));

    const exec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: create.stateMachineArn!,
      input: JSON.stringify({ data: "test" }),
    }));
    await new Promise((r) => setTimeout(r, 200));

    const desc = await sfn.send(new DescribeExecutionCommand({ executionArn: exec.executionArn! }));
    expect(desc.status).toBe("SUCCEEDED");
    const output = JSON.parse(desc.output!);
    expect(output.recovered).toBe(true);

    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: create.stateMachineArn! }));
  });

  test("Nested Choice with And/Or", async () => {
    const def = JSON.stringify({
      StartAt: "Check",
      States: {
        Check: {
          Type: "Choice",
          Choices: [{
            And: [
              { Variable: "$.age", NumericGreaterThanEquals: 18 },
              { Variable: "$.verified", BooleanEquals: true },
            ],
            Next: "Approved",
          }],
          Default: "Denied",
        },
        Approved: { Type: "Pass", Result: "approved", End: true },
        Denied: { Type: "Pass", Result: "denied", End: true },
      },
    });

    const create = await sfn.send(new CreateStateMachineCommand({
      name: "and-or-" + Date.now(),
      definition: def,
      roleArn: "arn:aws:iam::000000000000:role/role",
    }));

    // Should be approved (age >= 18 AND verified)
    const exec1 = await sfn.send(new StartExecutionCommand({
      stateMachineArn: create.stateMachineArn!,
      input: JSON.stringify({ age: 25, verified: true }),
    }));
    await new Promise((r) => setTimeout(r, 100));
    const desc1 = await sfn.send(new DescribeExecutionCommand({ executionArn: exec1.executionArn! }));
    expect(JSON.parse(desc1.output!)).toBe("approved");

    // Should be denied (not verified)
    const exec2 = await sfn.send(new StartExecutionCommand({
      stateMachineArn: create.stateMachineArn!,
      input: JSON.stringify({ age: 25, verified: false }),
    }));
    await new Promise((r) => setTimeout(r, 100));
    const desc2 = await sfn.send(new DescribeExecutionCommand({ executionArn: exec2.executionArn! }));
    expect(JSON.parse(desc2.output!)).toBe("denied");

    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: create.stateMachineArn! }));
  });

  test("InputPath and ResultPath data flow", async () => {
    const def = JSON.stringify({
      StartAt: "Transform",
      States: {
        Transform: {
          Type: "Pass",
          InputPath: "$.data",
          ResultPath: "$.result",
          Result: { transformed: true },
          Next: "Output",
        },
        Output: {
          Type: "Pass",
          OutputPath: "$.result",
          End: true,
        },
      },
    });

    const create = await sfn.send(new CreateStateMachineCommand({
      name: "dataflow-" + Date.now(),
      definition: def,
      roleArn: "arn:aws:iam::000000000000:role/role",
    }));

    const exec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: create.stateMachineArn!,
      input: JSON.stringify({ data: { value: 42 }, other: "ignored" }),
    }));
    await new Promise((r) => setTimeout(r, 100));
    const desc = await sfn.send(new DescribeExecutionCommand({ executionArn: exec.executionArn! }));
    expect(desc.status).toBe("SUCCEEDED");
    const output = JSON.parse(desc.output!);
    expect(output.transformed).toBe(true);

    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: create.stateMachineArn! }));
  });
});
