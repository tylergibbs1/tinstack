/**
 * End-to-end architecture tests: real AWS SDK v3 clients against tinstack.
 * Tests progressively complex multi-service architectures.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, CreateTableCommand, PutItemCommand, GetItemCommand, QueryCommand, DeleteTableCommand, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";
import { SQSClient, CreateQueueCommand, SendMessageCommand, ReceiveMessageCommand, DeleteQueueCommand, GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import { SNSClient, CreateTopicCommand, SubscribeCommand, PublishCommand, ListSubscriptionsCommand } from "@aws-sdk/client-sns";
import { LambdaClient, CreateFunctionCommand, InvokeCommand, DeleteFunctionCommand } from "@aws-sdk/client-lambda";
import { EventBridgeClient, PutEventsCommand, PutRuleCommand, PutTargetsCommand, ListRulesCommand } from "@aws-sdk/client-eventbridge";
import { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand, UpdateSecretCommand, DeleteSecretCommand } from "@aws-sdk/client-secrets-manager";
import { SSMClient, PutParameterCommand, GetParameterCommand, GetParametersByPathCommand } from "@aws-sdk/client-ssm";
import { KMSClient, CreateKeyCommand, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";
import { IAMClient, CreateRoleCommand, CreatePolicyCommand, AttachRolePolicyCommand, GetRoleCommand } from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { KinesisClient, CreateStreamCommand, PutRecordCommand, DescribeStreamCommand, GetShardIteratorCommand, GetRecordsCommand, DeleteStreamCommand } from "@aws-sdk/client-kinesis";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { CloudWatchLogsClient, CreateLogGroupCommand, CreateLogStreamCommand, PutLogEventsCommand, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CloudWatchClient, PutMetricDataCommand, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { SFNClient, CreateStateMachineCommand, StartExecutionCommand, DescribeExecutionCommand, DeleteStateMachineCommand } from "@aws-sdk/client-sfn";
import { startServer, stopServer, clientConfig, ENDPOINT } from "./helpers";

beforeAll(() => startServer());
afterAll(() => stopServer());

// ─────────────────────────────────────────────────────
// Level 1: Single-service basics
// ─────────────────────────────────────────────────────
describe("Level 1: Single-service basics", () => {

  test("S3: full object lifecycle", async () => {
    const s3 = new S3Client(clientConfig);
    await s3.send(new CreateBucketCommand({ Bucket: "e2e-bucket" }));
    await s3.send(new PutObjectCommand({ Bucket: "e2e-bucket", Key: "readme.txt", Body: "Hello tinstack", ContentType: "text/plain" }));
    const get = await s3.send(new GetObjectCommand({ Bucket: "e2e-bucket", Key: "readme.txt" }));
    expect(await get.Body?.transformToString()).toBe("Hello tinstack");
    expect(get.ContentType).toBe("text/plain");
    await s3.send(new DeleteObjectCommand({ Bucket: "e2e-bucket", Key: "readme.txt" }));
  });

  test("DynamoDB: CRUD + query", async () => {
    const ddb = new DynamoDBClient(clientConfig);
    await ddb.send(new CreateTableCommand({
      TableName: "e2e-users",
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }, { AttributeName: "sk", KeyType: "RANGE" }],
      AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }, { AttributeName: "sk", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
    await ddb.send(new PutItemCommand({ TableName: "e2e-users", Item: { pk: { S: "user#1" }, sk: { S: "profile" }, name: { S: "Alice" } } }));
    await ddb.send(new PutItemCommand({ TableName: "e2e-users", Item: { pk: { S: "user#1" }, sk: { S: "email#1" }, addr: { S: "alice@test.com" } } }));
    await ddb.send(new PutItemCommand({ TableName: "e2e-users", Item: { pk: { S: "user#1" }, sk: { S: "email#2" }, addr: { S: "alice2@test.com" } } }));

    const get = await ddb.send(new GetItemCommand({ TableName: "e2e-users", Key: { pk: { S: "user#1" }, sk: { S: "profile" } } }));
    expect(get.Item?.name?.S).toBe("Alice");

    // Query all items for user#1, sorted by sk
    const query = await ddb.send(new QueryCommand({
      TableName: "e2e-users",
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": { S: "user#1" } },
    }));
    expect(query.Items?.length).toBe(3);
    expect(query.Items![0].sk.S).toBe("email#1");
    expect(query.Items![1].sk.S).toBe("email#2");
    expect(query.Items![2].sk.S).toBe("profile");
  });

  test("SQS: send, receive, visibility", async () => {
    const sqs = new SQSClient(clientConfig);
    const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: "e2e-queue" }));
    await sqs.send(new SendMessageCommand({ QueueUrl, MessageBody: JSON.stringify({ orderId: "123" }) }));
    const recv = await sqs.send(new ReceiveMessageCommand({ QueueUrl, MaxNumberOfMessages: 10 }));
    expect(recv.Messages?.length).toBe(1);
    expect(JSON.parse(recv.Messages![0].Body!).orderId).toBe("123");
  });
});

// ─────────────────────────────────────────────────────
// Level 2: Two-service integrations
// ─────────────────────────────────────────────────────
describe("Level 2: Two-service integrations", () => {

  test("Config store: SSM parameters + KMS encryption", async () => {
    const kms = new KMSClient(clientConfig);
    const ssm = new SSMClient(clientConfig);

    // Create a KMS key
    const key = await kms.send(new CreateKeyCommand({ Description: "e2e config key" }));
    expect(key.KeyMetadata?.KeyId).toBeDefined();

    // Encrypt a value
    const encrypted = await kms.send(new EncryptCommand({
      KeyId: key.KeyMetadata!.KeyId!,
      Plaintext: new TextEncoder().encode("super-secret-db-password"),
    }));
    expect(encrypted.CiphertextBlob).toBeDefined();

    // Decrypt it back
    const decrypted = await kms.send(new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }));
    expect(new TextDecoder().decode(decrypted.Plaintext!)).toBe("super-secret-db-password");

    // Store config in SSM parameter hierarchy
    await ssm.send(new PutParameterCommand({ Name: "/e2e/app/db-host", Value: "localhost", Type: "String" }));
    await ssm.send(new PutParameterCommand({ Name: "/e2e/app/db-port", Value: "5432", Type: "String" }));
    await ssm.send(new PutParameterCommand({ Name: "/e2e/app/db-password", Value: "encrypted-pw", Type: "SecureString" }));

    // Fetch all params by path
    const params = await ssm.send(new GetParametersByPathCommand({ Path: "/e2e/app", Recursive: true }));
    expect(params.Parameters?.length).toBe(3);
  });

  test("Secrets rotation: Secrets Manager + DynamoDB audit", async () => {
    const sm = new SecretsManagerClient(clientConfig);
    const ddb = new DynamoDBClient(clientConfig);

    // Create audit table
    await ddb.send(new CreateTableCommand({
      TableName: "e2e-audit",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // Create a secret
    const secret = await sm.send(new CreateSecretCommand({ Name: "e2e/api-key", SecretString: "key-v1" }));
    expect(secret.ARN).toBeDefined();

    // Read it
    const val = await sm.send(new GetSecretValueCommand({ SecretId: "e2e/api-key" }));
    expect(val.SecretString).toBe("key-v1");

    // Rotate (update)
    await sm.send(new UpdateSecretCommand({ SecretId: "e2e/api-key", SecretString: "key-v2" }));

    // Log rotation to DynamoDB
    await ddb.send(new PutItemCommand({
      TableName: "e2e-audit",
      Item: { id: { S: `rotation-${Date.now()}` }, secret: { S: "e2e/api-key" }, action: { S: "rotated" } },
    }));

    // Verify new value
    const val2 = await sm.send(new GetSecretValueCommand({ SecretId: "e2e/api-key" }));
    expect(val2.SecretString).toBe("key-v2");
  });

  test("Event-driven: SNS → SQS fan-out", async () => {
    const sns = new SNSClient(clientConfig);
    const sqs = new SQSClient(clientConfig);

    // Create an SNS topic
    const topic = await sns.send(new CreateTopicCommand({ Name: "e2e-orders" }));
    expect(topic.TopicArn).toBeDefined();

    // Create two SQS queues (fan-out targets)
    const q1 = await sqs.send(new CreateQueueCommand({ QueueName: "e2e-billing" }));
    const q2 = await sqs.send(new CreateQueueCommand({ QueueName: "e2e-shipping" }));

    // Subscribe both queues to the topic
    await sns.send(new SubscribeCommand({ TopicArn: topic.TopicArn, Protocol: "sqs", Endpoint: q1.QueueUrl }));
    await sns.send(new SubscribeCommand({ TopicArn: topic.TopicArn, Protocol: "sqs", Endpoint: q2.QueueUrl }));

    const subs = await sns.send(new ListSubscriptionsCommand({}));
    expect(subs.Subscriptions?.filter(s => s.TopicArn === topic.TopicArn).length).toBe(2);

    // Publish an event
    const pub = await sns.send(new PublishCommand({ TopicArn: topic.TopicArn, Message: JSON.stringify({ orderId: "456" }) }));
    expect(pub.MessageId).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────
// Level 3: Multi-service workflows
// ─────────────────────────────────────────────────────
describe("Level 3: Multi-service workflows", () => {

  test("Microservice backend: IAM + STS + Lambda + DynamoDB", async () => {
    const iam = new IAMClient(clientConfig);
    const sts = new STSClient(clientConfig);
    const lambda = new LambdaClient(clientConfig);
    const ddb = new DynamoDBClient(clientConfig);

    // Verify identity
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    expect(identity.Account).toBeDefined();

    // Create IAM role for Lambda
    const role = await iam.send(new CreateRoleCommand({
      RoleName: "e2e-lambda-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));
    expect(role.Role?.Arn).toBeDefined();

    // Create a policy and attach it
    const policy = await iam.send(new CreatePolicyCommand({
      PolicyName: "e2e-dynamo-access",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Action: "dynamodb:*", Resource: "*" }],
      }),
    }));
    await iam.send(new AttachRolePolicyCommand({ RoleName: "e2e-lambda-role", PolicyArn: policy.Policy?.Arn }));

    // Verify role
    const getRole = await iam.send(new GetRoleCommand({ RoleName: "e2e-lambda-role" }));
    expect(getRole.Role?.RoleName).toBe("e2e-lambda-role");

    // Create a DynamoDB table for the service
    await ddb.send(new CreateTableCommand({
      TableName: "e2e-orders",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // Create Lambda function
    const fn = await lambda.send(new CreateFunctionCommand({
      FunctionName: "e2e-order-processor",
      Runtime: "nodejs20.x",
      Handler: "index.handler",
      Role: role.Role!.Arn!,
      Code: { ZipFile: Buffer.from("fake") },
    }));
    expect(fn.FunctionArn).toBeDefined();

    // Invoke Lambda
    const invoke = await lambda.send(new InvokeCommand({
      FunctionName: "e2e-order-processor",
      Payload: Buffer.from(JSON.stringify({ orderId: "ord-789" })),
    }));
    expect(invoke.StatusCode).toBe(200);

    // Simulate: Lambda writes order to DynamoDB
    await ddb.send(new PutItemCommand({
      TableName: "e2e-orders",
      Item: { orderId: { S: "ord-789" }, status: { S: "processing" }, total: { N: "99.99" } },
    }));

    const order = await ddb.send(new GetItemCommand({ TableName: "e2e-orders", Key: { orderId: { S: "ord-789" } } }));
    expect(order.Item?.status?.S).toBe("processing");
  });

  test("Observability stack: CloudWatch Logs + Metrics + EventBridge", async () => {
    const logs = new CloudWatchLogsClient(clientConfig);
    const cw = new CloudWatchClient(clientConfig);
    const eb = new EventBridgeClient(clientConfig);

    // Create log group and stream
    await logs.send(new CreateLogGroupCommand({ logGroupName: "/e2e/app" }));
    await logs.send(new CreateLogStreamCommand({ logGroupName: "/e2e/app", logStreamName: "instance-1" }));

    // Write structured logs
    const now = Date.now();
    await logs.send(new PutLogEventsCommand({
      logGroupName: "/e2e/app",
      logStreamName: "instance-1",
      logEvents: [
        { timestamp: now, message: JSON.stringify({ level: "INFO", msg: "Request started", traceId: "abc123" }) },
        { timestamp: now + 100, message: JSON.stringify({ level: "ERROR", msg: "DB connection failed", traceId: "abc123" }) },
        { timestamp: now + 200, message: JSON.stringify({ level: "INFO", msg: "Request completed", traceId: "def456" }) },
      ],
    }));

    // Filter logs for errors
    const errors = await logs.send(new FilterLogEventsCommand({ logGroupName: "/e2e/app", filterPattern: "ERROR" }));
    expect(errors.events?.length).toBe(1);
    expect(errors.events![0].message).toContain("DB connection failed");

    // Push custom metrics
    await cw.send(new PutMetricDataCommand({
      Namespace: "E2E/App",
      MetricData: [
        { MetricName: "RequestLatency", Value: 150, Unit: "Milliseconds", Timestamp: new Date() },
        { MetricName: "RequestLatency", Value: 300, Unit: "Milliseconds", Timestamp: new Date() },
        { MetricName: "ErrorCount", Value: 1, Unit: "Count", Timestamp: new Date() },
      ],
    }));

    // Query metrics
    const metrics = await cw.send(new GetMetricDataCommand({
      StartTime: new Date(Date.now() - 3600000),
      EndTime: new Date(Date.now() + 3600000),
      MetricDataQueries: [{
        Id: "latency",
        MetricStat: {
          Metric: { Namespace: "E2E/App", MetricName: "RequestLatency" },
          Period: 60,
          Stat: "Average",
        },
      }],
    }));
    expect(metrics.MetricDataResults?.length).toBe(1);
    expect(metrics.MetricDataResults![0].Values?.length).toBeGreaterThan(0);

    // Set up EventBridge rule for high-error alerts
    await eb.send(new PutRuleCommand({
      Name: "e2e-high-errors",
      EventPattern: JSON.stringify({ source: ["e2e.app"], "detail-type": ["ErrorThreshold"] }),
    }));
    await eb.send(new PutTargetsCommand({
      Rule: "e2e-high-errors",
      Targets: [{ Id: "log-target", Arn: "arn:aws:logs:us-east-1:000000000000:log-group:/e2e/alerts" }],
    }));

    // Emit event
    const events = await eb.send(new PutEventsCommand({
      Entries: [{ Source: "e2e.app", DetailType: "ErrorThreshold", Detail: JSON.stringify({ errorRate: 0.15 }) }],
    }));
    expect(events.FailedEntryCount).toBe(0);

    const rules = await eb.send(new ListRulesCommand({}));
    expect(rules.Rules?.some(r => r.Name === "e2e-high-errors")).toBe(true);
  });

  test("Data pipeline: Kinesis → DynamoDB + S3 archival", async () => {
    const kinesis = new KinesisClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    const ddb = new DynamoDBClient(clientConfig);
    const s3 = new S3Client(clientConfig);

    // Create stream
    await kinesis.send(new CreateStreamCommand({ StreamName: "e2e-clickstream", ShardCount: 1 }));

    // Create analytics table
    await ddb.send(new CreateTableCommand({
      TableName: "e2e-clicks",
      KeySchema: [{ AttributeName: "sessionId", KeyType: "HASH" }, { AttributeName: "ts", KeyType: "RANGE" }],
      AttributeDefinitions: [{ AttributeName: "sessionId", AttributeType: "S" }, { AttributeName: "ts", AttributeType: "N" }],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // Create archive bucket
    await s3.send(new CreateBucketCommand({ Bucket: "e2e-archive" }));

    // Produce events to Kinesis
    const events = [
      { sessionId: "sess-1", page: "/home", ts: Date.now() },
      { sessionId: "sess-1", page: "/products", ts: Date.now() + 1000 },
      { sessionId: "sess-2", page: "/checkout", ts: Date.now() + 2000 },
    ];

    for (const evt of events) {
      await kinesis.send(new PutRecordCommand({
        StreamName: "e2e-clickstream",
        Data: Buffer.from(JSON.stringify(evt)),
        PartitionKey: evt.sessionId,
      }));
    }

    // Consume from Kinesis
    const desc = await kinesis.send(new DescribeStreamCommand({ StreamName: "e2e-clickstream" }));
    const shardId = desc.StreamDescription!.Shards![0].ShardId!;
    const iter = await kinesis.send(new GetShardIteratorCommand({
      StreamName: "e2e-clickstream",
      ShardId: shardId,
      ShardIteratorType: "TRIM_HORIZON",
    }));
    const records = await kinesis.send(new GetRecordsCommand({ ShardIterator: iter.ShardIterator }));
    expect(records.Records?.length).toBe(3);

    // Simulate consumer: write to DynamoDB + archive raw to S3
    for (const record of records.Records!) {
      const data = JSON.parse(new TextDecoder().decode(record.Data!));
      await ddb.send(new PutItemCommand({
        TableName: "e2e-clicks",
        Item: { sessionId: { S: data.sessionId }, ts: { N: String(data.ts) }, page: { S: data.page } },
      }));
    }

    // Archive batch to S3
    const batch = records.Records!.map(r => new TextDecoder().decode(r.Data!)).join("\n");
    await s3.send(new PutObjectCommand({ Bucket: "e2e-archive", Key: `clicks/${Date.now()}.jsonl`, Body: batch }));

    // Verify DynamoDB has the data
    const q = await ddb.send(new QueryCommand({
      TableName: "e2e-clicks",
      KeyConditionExpression: "sessionId = :s",
      ExpressionAttributeValues: { ":s": { S: "sess-1" } },
    }));
    expect(q.Items?.length).toBe(2);

    // Cleanup
    await kinesis.send(new DeleteStreamCommand({ StreamName: "e2e-clickstream" }));
  });
});

// ─────────────────────────────────────────────────────
// Level 4: Complex multi-service architecture
// ─────────────────────────────────────────────────────
describe("Level 4: Full serverless architecture", () => {

  test("E-commerce backend: API GW → Lambda → DynamoDB + SQS + SNS + S3 + Secrets + SSM + EventBridge + Logs", async () => {
    const ddb = new DynamoDBClient(clientConfig);
    const sqs = new SQSClient(clientConfig);
    const sns = new SNSClient(clientConfig);
    const s3 = new S3Client(clientConfig);
    const sm = new SecretsManagerClient(clientConfig);
    const ssm = new SSMClient(clientConfig);
    const lambda = new LambdaClient(clientConfig);
    const eb = new EventBridgeClient(clientConfig);
    const logs = new CloudWatchLogsClient(clientConfig);
    const iam = new IAMClient(clientConfig);

    // ── Infrastructure setup ──

    // SSM: app config
    await ssm.send(new PutParameterCommand({ Name: "/ecommerce/stripe-key-name", Value: "stripe-api-key", Type: "String" }));
    const configParam = await ssm.send(new GetParameterCommand({ Name: "/ecommerce/stripe-key-name" }));
    expect(configParam.Parameter?.Value).toBe("stripe-api-key");

    // Secrets: API keys
    await sm.send(new CreateSecretCommand({ Name: "ecommerce/stripe-api-key", SecretString: "sk_test_abc123" }));
    const secret = await sm.send(new GetSecretValueCommand({ SecretId: "ecommerce/stripe-api-key" }));
    expect(secret.SecretString).toBe("sk_test_abc123");

    // S3: product images
    await s3.send(new CreateBucketCommand({ Bucket: "ecommerce-images" }));
    await s3.send(new PutObjectCommand({ Bucket: "ecommerce-images", Key: "products/widget.jpg", Body: Buffer.from("fake-image-data") }));

    // DynamoDB tables
    await ddb.send(new CreateTableCommand({
      TableName: "ecommerce-products",
      KeySchema: [{ AttributeName: "productId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "productId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
    await ddb.send(new CreateTableCommand({
      TableName: "ecommerce-orders",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // SQS queues
    const orderQueue = await sqs.send(new CreateQueueCommand({ QueueName: "ecommerce-order-processing" }));
    const dlq = await sqs.send(new CreateQueueCommand({ QueueName: "ecommerce-dlq" }));
    expect(orderQueue.QueueUrl).toBeDefined();
    expect(dlq.QueueUrl).toBeDefined();

    // SNS topic for notifications
    const notifTopic = await sns.send(new CreateTopicCommand({ Name: "ecommerce-notifications" }));
    await sns.send(new SubscribeCommand({ TopicArn: notifTopic.TopicArn, Protocol: "email", Endpoint: "admin@shop.test" }));

    // EventBridge for domain events
    await eb.send(new PutRuleCommand({
      Name: "order-placed",
      EventPattern: JSON.stringify({ source: ["ecommerce"], "detail-type": ["OrderPlaced"] }),
    }));
    await eb.send(new PutTargetsCommand({
      Rule: "order-placed",
      Targets: [
        { Id: "order-queue", Arn: "arn:aws:sqs:us-east-1:000000000000:ecommerce-order-processing" },
        { Id: "notification", Arn: notifTopic.TopicArn! },
      ],
    }));

    // IAM role
    const lambdaRole = await iam.send(new CreateRoleCommand({
      RoleName: "ecommerce-lambda-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    // Lambda functions
    const createOrderFn = await lambda.send(new CreateFunctionCommand({
      FunctionName: "ecommerce-create-order",
      Runtime: "nodejs20.x",
      Handler: "index.handler",
      Role: lambdaRole.Role!.Arn!,
      Code: { ZipFile: Buffer.from("fake") },
      Environment: { Variables: { TABLE_NAME: "ecommerce-orders", QUEUE_URL: orderQueue.QueueUrl! } },
    }));

    // CloudWatch Logs
    await logs.send(new CreateLogGroupCommand({ logGroupName: "/aws/lambda/ecommerce-create-order" }));
    await logs.send(new CreateLogStreamCommand({ logGroupName: "/aws/lambda/ecommerce-create-order", logStreamName: "2024/01/01/[$LATEST]abc123" }));

    // ── Simulate request flow ──

    // 1. Add product to catalog
    await ddb.send(new PutItemCommand({
      TableName: "ecommerce-products",
      Item: {
        productId: { S: "widget-001" },
        name: { S: "Premium Widget" },
        price: { N: "29.99" },
        imageUrl: { S: "s3://ecommerce-images/products/widget.jpg" },
        inventory: { N: "100" },
      },
    }));

    // 2. Invoke create-order Lambda
    const invokeResult = await lambda.send(new InvokeCommand({
      FunctionName: "ecommerce-create-order",
      Payload: Buffer.from(JSON.stringify({
        customerId: "cust-1",
        items: [{ productId: "widget-001", qty: 2 }],
      })),
    }));
    expect(invokeResult.StatusCode).toBe(200);

    // 3. Simulate what Lambda would do: write order to DDB
    const orderId = `ord-${Date.now()}`;
    await ddb.send(new PutItemCommand({
      TableName: "ecommerce-orders",
      Item: {
        orderId: { S: orderId },
        customerId: { S: "cust-1" },
        status: { S: "pending" },
        total: { N: "59.98" },
        createdAt: { N: String(Date.now()) },
      },
    }));

    // 4. Send to processing queue
    await sqs.send(new SendMessageCommand({
      QueueUrl: orderQueue.QueueUrl!,
      MessageBody: JSON.stringify({ orderId, action: "process" }),
    }));

    // 5. Emit domain event
    await eb.send(new PutEventsCommand({
      Entries: [{
        Source: "ecommerce",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId, total: 59.98 }),
      }],
    }));

    // 6. Publish notification
    await sns.send(new PublishCommand({
      TopicArn: notifTopic.TopicArn!,
      Subject: "New Order",
      Message: JSON.stringify({ orderId, total: 59.98 }),
    }));

    // 7. Log the request
    await logs.send(new PutLogEventsCommand({
      logGroupName: "/aws/lambda/ecommerce-create-order",
      logStreamName: "2024/01/01/[$LATEST]abc123",
      logEvents: [
        { timestamp: Date.now(), message: JSON.stringify({ level: "INFO", orderId, msg: "Order created successfully" }) },
      ],
    }));

    // ── Verify everything ──

    // Verify order in DynamoDB
    const order = await ddb.send(new GetItemCommand({ TableName: "ecommerce-orders", Key: { orderId: { S: orderId } } }));
    expect(order.Item?.status?.S).toBe("pending");
    expect(order.Item?.total?.N).toBe("59.98");

    // Verify message in SQS
    const msgs = await sqs.send(new ReceiveMessageCommand({ QueueUrl: orderQueue.QueueUrl!, MaxNumberOfMessages: 10 }));
    expect(msgs.Messages?.length).toBeGreaterThan(0);
    const queueMsg = JSON.parse(msgs.Messages![0].Body!);
    expect(queueMsg.orderId).toBe(orderId);

    // Verify product image in S3
    const img = await s3.send(new GetObjectCommand({ Bucket: "ecommerce-images", Key: "products/widget.jpg" }));
    expect(await img.Body?.transformToString()).toBe("fake-image-data");

    // Verify product in catalog
    const product = await ddb.send(new GetItemCommand({ TableName: "ecommerce-products", Key: { productId: { S: "widget-001" } } }));
    expect(product.Item?.name?.S).toBe("Premium Widget");

    // Verify logs
    const logEvents = await logs.send(new FilterLogEventsCommand({
      logGroupName: "/aws/lambda/ecommerce-create-order",
      filterPattern: "Order created",
    }));
    expect(logEvents.events?.length).toBe(1);

    // Verify secret is still accessible
    const key = await sm.send(new GetSecretValueCommand({ SecretId: "ecommerce/stripe-api-key" }));
    expect(key.SecretString).toBe("sk_test_abc123");

    // Verify SSM config
    const appConfig = await ssm.send(new GetParametersByPathCommand({ Path: "/ecommerce", Recursive: true }));
    expect(appConfig.Parameters?.length).toBeGreaterThan(0);

    // Verify EventBridge rules
    const ebRules = await eb.send(new ListRulesCommand({}));
    expect(ebRules.Rules?.some(r => r.Name === "order-placed")).toBe(true);

    // Verify SQS queue has attributes
    const attrs = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: orderQueue.QueueUrl!, AttributeNames: ["All"] }));
    expect(attrs.Attributes?.QueueArn).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────
// Level 5: Step Functions orchestration
// ─────────────────────────────────────────────────────
describe("Level 5: Step Functions orchestration", () => {

  test("Order fulfillment state machine", async () => {
    const sfn = new SFNClient(clientConfig);
    const iam = new IAMClient(clientConfig);

    const role = await iam.send(new CreateRoleCommand({
      RoleName: "e2e-sfn-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "states.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    // Create state machine with Choice, Pass, Wait, Succeed, Fail states
    const definition = {
      StartAt: "ValidateOrder",
      States: {
        ValidateOrder: {
          Type: "Pass",
          Result: { valid: true, orderId: "test-order" },
          Next: "CheckInventory",
        },
        CheckInventory: {
          Type: "Pass",
          Result: { inStock: true },
          ResultPath: "$.inventory",
          Next: "RouteOrder",
        },
        RouteOrder: {
          Type: "Choice",
          Choices: [
            {
              Variable: "$.inventory.inStock",
              BooleanEquals: true,
              Next: "ProcessPayment",
            },
          ],
          Default: "OrderFailed",
        },
        ProcessPayment: {
          Type: "Pass",
          Result: { paymentId: "pay-123", status: "charged" },
          ResultPath: "$.payment",
          Next: "ShipOrder",
        },
        ShipOrder: {
          Type: "Pass",
          Result: { trackingNumber: "TRACK-789" },
          ResultPath: "$.shipping",
          Next: "OrderComplete",
        },
        OrderComplete: {
          Type: "Succeed",
        },
        OrderFailed: {
          Type: "Fail",
          Error: "OutOfStock",
          Cause: "Item is not available",
        },
      },
    };

    const sm = await sfn.send(new CreateStateMachineCommand({
      name: "e2e-order-fulfillment",
      definition: JSON.stringify(definition),
      roleArn: role.Role!.Arn!,
    }));
    expect(sm.stateMachineArn).toBeDefined();

    // Execute it synchronously
    const exec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: sm.stateMachineArn!,
      input: JSON.stringify({ orderId: "order-999", customerId: "cust-1" }),
    }));
    expect(exec.executionArn).toBeDefined();

    // Check execution
    const desc = await sfn.send(new DescribeExecutionCommand({ executionArn: exec.executionArn! }));
    expect(desc.status).toBe("SUCCEEDED");

    // Verify output has all the accumulated state
    const output = JSON.parse(desc.output!);
    expect(output.inventory.inStock).toBe(true);
    expect(output.payment.paymentId).toBe("pay-123");
    expect(output.shipping.trackingNumber).toBe("TRACK-789");

    // Cleanup
    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: sm.stateMachineArn! }));
  });

  test("DynamoDB batch operations across tables", async () => {
    const ddb = new DynamoDBClient(clientConfig);

    await ddb.send(new CreateTableCommand({
      TableName: "e2e-batch-1",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
    await ddb.send(new CreateTableCommand({
      TableName: "e2e-batch-2",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // Batch write across two tables
    await ddb.send(new BatchWriteItemCommand({
      RequestItems: {
        "e2e-batch-1": [
          { PutRequest: { Item: { id: { S: "a1" }, val: { S: "hello" } } } },
          { PutRequest: { Item: { id: { S: "a2" }, val: { S: "world" } } } },
        ],
        "e2e-batch-2": [
          { PutRequest: { Item: { id: { S: "b1" }, data: { N: "42" } } } },
        ],
      },
    }));

    const r1 = await ddb.send(new GetItemCommand({ TableName: "e2e-batch-1", Key: { id: { S: "a1" } } }));
    expect(r1.Item?.val?.S).toBe("hello");

    const r2 = await ddb.send(new GetItemCommand({ TableName: "e2e-batch-2", Key: { id: { S: "b1" } } }));
    expect(r2.Item?.data?.N).toBe("42");
  });
});
