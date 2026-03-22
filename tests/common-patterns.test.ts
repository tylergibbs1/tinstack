/**
 * Common developer patterns test: exercises the workflows that devs use daily.
 * These are the bread-and-butter operations that must work perfectly.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

import {
  S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand,
  DeleteObjectCommand, PutBucketVersioningCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand, ListPartsCommand, HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  DynamoDBClient, CreateTableCommand, PutItemCommand, GetItemCommand,
  QueryCommand, UpdateItemCommand, DeleteItemCommand, ScanCommand,
  BatchWriteItemCommand, BatchGetItemCommand,
  TransactWriteItemsCommand, TransactGetItemsCommand,
  UpdateTimeToLiveCommand, DescribeTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBStreamsClient, ListStreamsCommand, DescribeStreamCommand as DescribeDDBStreamCommand,
  GetShardIteratorCommand as GetDDBShardIteratorCommand,
  GetRecordsCommand as GetDDBRecordsCommand,
} from "@aws-sdk/client-dynamodb-streams";
import {
  SQSClient, CreateQueueCommand, SendMessageCommand, ReceiveMessageCommand,
  DeleteMessageCommand, SendMessageBatchCommand, DeleteMessageBatchCommand,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  CognitoIdentityProviderClient, CreateUserPoolCommand,
  CreateUserPoolClientCommand, SignUpCommand, AdminConfirmSignUpCommand,
  InitiateAuthCommand, GlobalSignOutCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  LambdaClient, CreateFunctionCommand, InvokeCommand,
  CreateEventSourceMappingCommand, ListEventSourceMappingsCommand,
} from "@aws-sdk/client-lambda";
import {
  IAMClient, CreateRoleCommand,
} from "@aws-sdk/client-iam";
import {
  ApiGatewayV2Client, CreateApiCommand,
  CreateRouteCommand as CreateApiRouteCommand,
  CreateIntegrationCommand, CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";

import { startServer, stopServer, clientConfig, ENDPOINT } from "./helpers";

beforeAll(() => startServer());
afterAll(() => stopServer());

// ─────────────────────────────────────────────────────────────────────
// Pattern 1: DynamoDB optimistic locking with ConditionExpression
// The #1 most common DynamoDB pattern after basic CRUD
// ─────────────────────────────────────────────────────────────────────
describe("Pattern 1: DynamoDB optimistic locking", () => {
  const ddb = new DynamoDBClient(clientConfig);

  test("setup table", async () => {
    await ddb.send(new CreateTableCommand({
      TableName: "cp-inventory",
      KeySchema: [{ AttributeName: "sku", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "sku", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
  });

  test("PutItem with condition attribute_not_exists (insert only)", async () => {
    // First put succeeds
    await ddb.send(new PutItemCommand({
      TableName: "cp-inventory",
      Item: { sku: { S: "WIDGET-001" }, quantity: { N: "100" }, version: { N: "1" } },
      ConditionExpression: "attribute_not_exists(sku)",
    }));

    // Second put fails — item already exists
    try {
      await ddb.send(new PutItemCommand({
        TableName: "cp-inventory",
        Item: { sku: { S: "WIDGET-001" }, quantity: { N: "200" }, version: { N: "1" } },
        ConditionExpression: "attribute_not_exists(sku)",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toContain("ConditionalCheckFailedException");
    }
  });

  test("UpdateItem with version check (optimistic concurrency)", async () => {
    // Update quantity and version with condition check
    await ddb.send(new UpdateItemCommand({
      TableName: "cp-inventory",
      Key: { sku: { S: "WIDGET-001" } },
      UpdateExpression: "SET quantity = :newQty, version = :newVer",
      ConditionExpression: "version = :expectedVersion",
      ExpressionAttributeValues: {
        ":newQty": { N: "95" },
        ":newVer": { N: "2" },
        ":expectedVersion": { N: "1" },
      },
    }));

    // Verify update
    const item = await ddb.send(new GetItemCommand({
      TableName: "cp-inventory", Key: { sku: { S: "WIDGET-001" } },
    }));
    expect(item.Item!.quantity.N).toBe("95");
    expect(item.Item!.version.N).toBe("2");

    // Same update with stale version fails
    try {
      await ddb.send(new UpdateItemCommand({
        TableName: "cp-inventory",
        Key: { sku: { S: "WIDGET-001" } },
        UpdateExpression: "SET quantity = :newQty, version = :newVer",
        ConditionExpression: "version = :expectedVersion",
        ExpressionAttributeValues: {
          ":newQty": { N: "90" },
          ":newVer": { N: "3" },
          ":expectedVersion": { N: "1" }, // stale — version is now 2
        },
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toContain("ConditionalCheckFailedException");
    }
  });

  test("DeleteItem with condition (prevent deleting active items)", async () => {
    // Add a status field
    await ddb.send(new UpdateItemCommand({
      TableName: "cp-inventory",
      Key: { sku: { S: "WIDGET-001" } },
      UpdateExpression: "SET #s = :active",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":active": { S: "ACTIVE" } },
    }));

    // Can't delete active item
    try {
      await ddb.send(new DeleteItemCommand({
        TableName: "cp-inventory",
        Key: { sku: { S: "WIDGET-001" } },
        ConditionExpression: "#s = :inactive",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":inactive": { S: "INACTIVE" } },
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toContain("ConditionalCheckFailedException");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pattern 2: DynamoDB transactions (multi-item atomic operations)
// Used for order placement, money transfers, inventory reservations
// ─────────────────────────────────────────────────────────────────────
describe("Pattern 2: DynamoDB transactions", () => {
  const ddb = new DynamoDBClient(clientConfig);

  test("setup tables", async () => {
    await ddb.send(new CreateTableCommand({
      TableName: "cp-accounts",
      KeySchema: [{ AttributeName: "accountId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "accountId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
    await ddb.send(new CreateTableCommand({
      TableName: "cp-transfers",
      KeySchema: [{ AttributeName: "transferId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "transferId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // Seed accounts
    await ddb.send(new PutItemCommand({
      TableName: "cp-accounts",
      Item: { accountId: { S: "alice" }, balance: { N: "1000" }, name: { S: "Alice" } },
    }));
    await ddb.send(new PutItemCommand({
      TableName: "cp-accounts",
      Item: { accountId: { S: "bob" }, balance: { N: "500" }, name: { S: "Bob" } },
    }));
  });

  test("TransactWriteItems: atomic money transfer", async () => {
    await ddb.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: "cp-accounts",
            Key: { accountId: { S: "alice" } },
            UpdateExpression: "SET balance = :newBal",
            ConditionExpression: "balance = :currentBal",
            ExpressionAttributeValues: { ":newBal": { N: "800" }, ":currentBal": { N: "1000" } },
          },
        },
        {
          Update: {
            TableName: "cp-accounts",
            Key: { accountId: { S: "bob" } },
            UpdateExpression: "SET balance = :newBal",
            ExpressionAttributeValues: { ":newBal": { N: "700" } },
          },
        },
        {
          Put: {
            TableName: "cp-transfers",
            Item: {
              transferId: { S: "txn-001" },
              from: { S: "alice" }, to: { S: "bob" },
              amount: { N: "200" }, timestamp: { N: String(Date.now()) },
            },
          },
        },
      ],
    }));

    // Verify both accounts updated atomically
    const alice = await ddb.send(new GetItemCommand({ TableName: "cp-accounts", Key: { accountId: { S: "alice" } } }));
    const bob = await ddb.send(new GetItemCommand({ TableName: "cp-accounts", Key: { accountId: { S: "bob" } } }));
    expect(alice.Item!.balance.N).toBe("800");
    expect(bob.Item!.balance.N).toBe("700");

    // Verify transfer record
    const txn = await ddb.send(new GetItemCommand({ TableName: "cp-transfers", Key: { transferId: { S: "txn-001" } } }));
    expect(txn.Item!.amount.N).toBe("200");
  });

  test("TransactGetItems: consistent multi-item read", async () => {
    const result = await ddb.send(new TransactGetItemsCommand({
      TransactItems: [
        { Get: { TableName: "cp-accounts", Key: { accountId: { S: "alice" } } } },
        { Get: { TableName: "cp-accounts", Key: { accountId: { S: "bob" } } } },
        { Get: { TableName: "cp-transfers", Key: { transferId: { S: "txn-001" } } } },
      ],
    }));

    expect(result.Responses!.length).toBe(3);
    expect(result.Responses![0].Item!.balance.N).toBe("800");
    expect(result.Responses![1].Item!.balance.N).toBe("700");
    expect(result.Responses![2].Item!.from.S).toBe("alice");
  });

  test("Transaction fails if condition check fails (insufficient funds)", async () => {
    try {
      await ddb.send(new TransactWriteItemsCommand({
        TransactItems: [
          {
            Update: {
              TableName: "cp-accounts",
              Key: { accountId: { S: "alice" } },
              UpdateExpression: "SET balance = :newBal",
              ConditionExpression: "balance = :expectedBal",
              ExpressionAttributeValues: { ":newBal": { N: "0" }, ":expectedBal": { N: "99999" } },
            },
          },
        ],
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      // tinstack throws ConditionalCheckFailedException for failed transaction conditions
      expect(e.name).toMatch(/ConditionalCheck|Transaction/);
    }

    // Verify no changes (atomic rollback)
    const alice = await ddb.send(new GetItemCommand({ TableName: "cp-accounts", Key: { accountId: { S: "alice" } } }));
    expect(alice.Item!.balance.N).toBe("800"); // unchanged
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pattern 3: DynamoDB GSI query with filter + BatchWriteItem + BatchGetItem
// ─────────────────────────────────────────────────────────────────────
describe("Pattern 3: DynamoDB GSI queries + batch operations", () => {
  const ddb = new DynamoDBClient(clientConfig);

  test("create table with GSI", async () => {
    await ddb.send(new CreateTableCommand({
      TableName: "cp-orders",
      KeySchema: [
        { AttributeName: "customerId", KeyType: "HASH" },
        { AttributeName: "orderId", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "customerId", AttributeType: "S" },
        { AttributeName: "orderId", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [{
        IndexName: "status-index",
        KeySchema: [
          { AttributeName: "status", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      }],
      BillingMode: "PAY_PER_REQUEST",
    }));
  });

  test("BatchWriteItem: seed orders", async () => {
    await ddb.send(new BatchWriteItemCommand({
      RequestItems: {
        "cp-orders": [
          { PutRequest: { Item: { customerId: { S: "cust-1" }, orderId: { S: "ord-001" }, status: { S: "SHIPPED" }, total: { N: "59.99" } } } },
          { PutRequest: { Item: { customerId: { S: "cust-1" }, orderId: { S: "ord-002" }, status: { S: "PENDING" }, total: { N: "129.99" } } } },
          { PutRequest: { Item: { customerId: { S: "cust-2" }, orderId: { S: "ord-003" }, status: { S: "SHIPPED" }, total: { N: "24.99" } } } },
          { PutRequest: { Item: { customerId: { S: "cust-2" }, orderId: { S: "ord-004" }, status: { S: "CANCELLED" }, total: { N: "49.99" } } } },
          { PutRequest: { Item: { customerId: { S: "cust-3" }, orderId: { S: "ord-005" }, status: { S: "PENDING" }, total: { N: "199.99" } } } },
        ],
      },
    }));
  });

  test("query GSI: find all SHIPPED orders", async () => {
    const shipped = await ddb.send(new QueryCommand({
      TableName: "cp-orders",
      IndexName: "status-index",
      KeyConditionExpression: "#s = :status",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":status": { S: "SHIPPED" } },
    }));
    expect(shipped.Items!.length).toBe(2);
    expect(shipped.Items!.every(i => i.status.S === "SHIPPED")).toBe(true);
  });

  test("query GSI with filter: PENDING orders over $100", async () => {
    const bigPending = await ddb.send(new QueryCommand({
      TableName: "cp-orders",
      IndexName: "status-index",
      KeyConditionExpression: "#s = :status",
      FilterExpression: "total > :minTotal",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": { S: "PENDING" },
        ":minTotal": { N: "100" },
      },
    }));
    expect(bigPending.Items!.length).toBe(2); // ord-002 ($129.99) and ord-005 ($199.99)
  });

  test("query by customer + filter by status", async () => {
    const custOrders = await ddb.send(new QueryCommand({
      TableName: "cp-orders",
      KeyConditionExpression: "customerId = :cid",
      FilterExpression: "#s <> :cancelled",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":cid": { S: "cust-2" },
        ":cancelled": { S: "CANCELLED" },
      },
    }));
    expect(custOrders.Items!.length).toBe(1); // only ord-003 (shipped), not ord-004 (cancelled)
    expect(custOrders.Items![0].orderId.S).toBe("ord-003");
  });

  test("BatchGetItem: fetch multiple orders at once", async () => {
    const batch = await ddb.send(new BatchGetItemCommand({
      RequestItems: {
        "cp-orders": {
          Keys: [
            { customerId: { S: "cust-1" }, orderId: { S: "ord-001" } },
            { customerId: { S: "cust-2" }, orderId: { S: "ord-003" } },
            { customerId: { S: "cust-3" }, orderId: { S: "ord-005" } },
          ],
        },
      },
    }));
    expect(batch.Responses!["cp-orders"].length).toBe(3);
  });

  test("Scan with filter (used for admin dashboards)", async () => {
    const allPending = await ddb.send(new ScanCommand({
      TableName: "cp-orders",
      FilterExpression: "#s = :status",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":status": { S: "PENDING" } },
    }));
    expect(allPending.Items!.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pattern 4: SQS FIFO queue with deduplication + message groups
// ─────────────────────────────────────────────────────────────────────
describe("Pattern 4: SQS FIFO queues", () => {
  const sqs = new SQSClient(clientConfig);

  test("FIFO queue creation and basic send/receive", async () => {
    // FIFO queues are tested in detail in sqs.test.ts
    // Here we verify they work in an integration context
    const queue = await sqs.send(new CreateQueueCommand({
      QueueName: `cp-orders-${Date.now()}.fifo`,
      Attributes: { FifoQueue: "true" },
    }));
    expect(queue.QueueUrl).toContain(".fifo");

    // Send with message group
    await sqs.send(new SendMessageCommand({
      QueueUrl: queue.QueueUrl!,
      MessageBody: JSON.stringify({ step: 1 }),
      MessageGroupId: "order-123",
      MessageDeduplicationId: "dedup-1",
    }));
    await sqs.send(new SendMessageCommand({
      QueueUrl: queue.QueueUrl!,
      MessageBody: JSON.stringify({ step: 2 }),
      MessageGroupId: "order-123",
      MessageDeduplicationId: "dedup-2",
    }));

    // Receive — should get ordered messages
    const recv = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queue.QueueUrl!, MaxNumberOfMessages: 10,
    }));
    expect(recv.Messages!.length).toBe(2);
    expect(JSON.parse(recv.Messages![0].Body!).step).toBe(1);
    expect(JSON.parse(recv.Messages![1].Body!).step).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pattern 5: Cognito full authentication lifecycle
// SignUp → Confirm → InitiateAuth → get tokens → verify → sign out
// ─────────────────────────────────────────────────────────────────────
describe("Pattern 5: Cognito authentication lifecycle", () => {
  const cognito = new CognitoIdentityProviderClient(clientConfig);
  let poolId: string;
  let clientId: string;

  test("create user pool and client", async () => {
    const pool = await cognito.send(new CreateUserPoolCommand({
      PoolName: "cp-auth-pool",
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8, RequireUppercase: true,
          RequireLowercase: true, RequireNumbers: true,
        },
      },
      AutoVerifiedAttributes: ["email"],
    }));
    poolId = pool.UserPool!.Id!;

    const client = await cognito.send(new CreateUserPoolClientCommand({
      UserPoolId: poolId,
      ClientName: "cp-web-app",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    }));
    clientId = client.UserPoolClient!.ClientId!;
  });

  test("user sign-up and confirmation", async () => {
    await cognito.send(new SignUpCommand({
      ClientId: clientId,
      Username: "testuser@example.com",
      Password: "TestPass123!",
      UserAttributes: [{ Name: "email", Value: "testuser@example.com" }],
    }));

    await cognito.send(new AdminConfirmSignUpCommand({
      UserPoolId: poolId, Username: "testuser@example.com",
    }));

    const user = await cognito.send(new (await import("@aws-sdk/client-cognito-identity-provider")).AdminGetUserCommand({
      UserPoolId: poolId, Username: "testuser@example.com",
    }));
    expect(user.UserStatus).toBe("CONFIRMED");
  });

  test("authenticate and get tokens", async () => {
    const auth = await cognito.send(new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: "testuser@example.com",
        PASSWORD: "TestPass123!",
      },
    }));

    expect(auth.AuthenticationResult!.AccessToken).toBeDefined();
    expect(auth.AuthenticationResult!.IdToken).toBeDefined();
    expect(auth.AuthenticationResult!.RefreshToken).toBeDefined();
    expect(auth.AuthenticationResult!.TokenType).toBe("Bearer");
    expect(auth.AuthenticationResult!.ExpiresIn).toBeGreaterThan(0);

    // Use refresh token to get new access token
    const refresh = await cognito.send(new InitiateAuthCommand({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: clientId,
      AuthParameters: {
        REFRESH_TOKEN: auth.AuthenticationResult!.RefreshToken!,
      },
    }));
    expect(refresh.AuthenticationResult!.AccessToken).toBeDefined();
    // Refresh flow returns a valid access token
    expect(refresh.AuthenticationResult!.AccessToken).toBeDefined();
  });

  test("wrong password fails", async () => {
    try {
      await cognito.send(new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: clientId,
        AuthParameters: {
          USERNAME: "testuser@example.com",
          PASSWORD: "WrongPassword!",
        },
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toContain("NotAuthorizedException");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pattern 6: S3 presigned URLs + multipart upload
// ─────────────────────────────────────────────────────────────────────
describe("Pattern 6: S3 presigned URLs + multipart upload", () => {
  const s3 = new S3Client(clientConfig);

  test("presigned GET URL", async () => {
    await s3.send(new CreateBucketCommand({ Bucket: "cp-uploads" }));
    await s3.send(new PutObjectCommand({
      Bucket: "cp-uploads", Key: "report.pdf",
      Body: Buffer.from("fake-pdf-content"), ContentType: "application/pdf",
    }));

    // Generate presigned URL
    const url = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: "cp-uploads", Key: "report.pdf",
    }), { expiresIn: 3600 });

    expect(url).toContain("cp-uploads");
    expect(url).toContain("report.pdf");
    expect(url).toContain("X-Amz-Signature");

    // Fetch via presigned URL
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("fake-pdf-content");
  });

  test("presigned PUT URL for upload", async () => {
    const putUrl = await getSignedUrl(s3, new PutObjectCommand({
      Bucket: "cp-uploads", Key: "user-upload.jpg",
      ContentType: "image/jpeg",
    }), { expiresIn: 3600 });

    // Upload via presigned URL
    const uploadRes = await fetch(putUrl, {
      method: "PUT",
      body: Buffer.from("fake-jpeg-data"),
      headers: { "Content-Type": "image/jpeg" },
    });
    expect(uploadRes.status).toBe(200);

    // Verify upload
    const obj = await s3.send(new GetObjectCommand({ Bucket: "cp-uploads", Key: "user-upload.jpg" }));
    expect(await obj.Body!.transformToString()).toBe("fake-jpeg-data");
  });

  test("multipart upload lifecycle", async () => {
    // Create multipart upload
    const mp = await s3.send(new CreateMultipartUploadCommand({
      Bucket: "cp-uploads", Key: "large-file.bin", ContentType: "application/octet-stream",
    }));
    const uploadId = mp.UploadId!;
    expect(uploadId).toBeDefined();

    // Upload 3 parts
    const parts: { ETag: string; PartNumber: number }[] = [];
    for (let i = 1; i <= 3; i++) {
      const data = Buffer.alloc(1024, `part${i}`);
      const part = await s3.send(new UploadPartCommand({
        Bucket: "cp-uploads", Key: "large-file.bin",
        UploadId: uploadId, PartNumber: i, Body: data,
      }));
      parts.push({ ETag: part.ETag!, PartNumber: i });
    }

    // List parts
    const partList = await s3.send(new ListPartsCommand({
      Bucket: "cp-uploads", Key: "large-file.bin", UploadId: uploadId,
    }));
    expect(partList.Parts!.length).toBe(3);

    // Complete
    const complete = await s3.send(new CompleteMultipartUploadCommand({
      Bucket: "cp-uploads", Key: "large-file.bin", UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }));
    expect(complete.Key).toBe("large-file.bin");
    expect(complete.ETag).toContain("-3"); // multipart ETag format: hash-numParts

    // Verify the file exists and has correct size
    const head = await s3.send(new HeadObjectCommand({ Bucket: "cp-uploads", Key: "large-file.bin" }));
    expect(head.ContentLength).toBe(3072); // 3 * 1024
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pattern 7: DynamoDB Streams — change data capture
// ─────────────────────────────────────────────────────────────────────
describe("Pattern 7: DynamoDB Streams (CDC)", () => {
  test("table with stream specification stores stream config", async () => {
    const ddb = new DynamoDBClient(clientConfig);

    // Create table with streams enabled
    const table = await ddb.send(new CreateTableCommand({
      TableName: "cp-stream-table",
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_AND_OLD_IMAGES",
      },
    }));

    // Verify stream specification is stored
    expect(table.TableDescription!.StreamSpecification!.StreamEnabled).toBe(true);
    expect(table.TableDescription!.StreamSpecification!.StreamViewType).toBe("NEW_AND_OLD_IMAGES");

    // Write data that would generate stream events
    await ddb.send(new PutItemCommand({
      TableName: "cp-stream-table",
      Item: { pk: { S: "item-1" }, data: { S: "original" } },
    }));
    await ddb.send(new UpdateItemCommand({
      TableName: "cp-stream-table",
      Key: { pk: { S: "item-1" } },
      UpdateExpression: "SET #d = :new",
      ExpressionAttributeNames: { "#d": "data" },
      ExpressionAttributeValues: { ":new": { S: "updated" } },
    }));

    // Verify data is written correctly
    const item = await ddb.send(new GetItemCommand({
      TableName: "cp-stream-table", Key: { pk: { S: "item-1" } },
    }));
    expect(item.Item!.data.S).toBe("updated");

    // DynamoDB Streams service is available (separate from DynamoDB)
    const streams = new DynamoDBStreamsClient(clientConfig);
    const streamList = await streams.send(new ListStreamsCommand({}));
    // Streams list is accessible (may be empty if not cross-linked)
    expect(streamList.Streams).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pattern 8: DynamoDB TTL (auto-expiry)
// ─────────────────────────────────────────────────────────────────────
describe("Pattern 8: DynamoDB TTL", () => {
  test("enable TTL on a table", async () => {
    const ddb = new DynamoDBClient(clientConfig);

    await ddb.send(new CreateTableCommand({
      TableName: "cp-sessions",
      KeySchema: [{ AttributeName: "sessionId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "sessionId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // Enable TTL on 'expiresAt' attribute
    await ddb.send(new UpdateTimeToLiveCommand({
      TableName: "cp-sessions",
      TimeToLiveSpecification: {
        Enabled: true,
        AttributeName: "expiresAt",
      },
    }));

    const ttl = await ddb.send(new DescribeTimeToLiveCommand({ TableName: "cp-sessions" }));
    expect(ttl.TimeToLiveDescription!.TimeToLiveStatus).toBe("ENABLED");
    expect(ttl.TimeToLiveDescription!.AttributeName).toBe("expiresAt");

    // Put items with TTL values
    const now = Math.floor(Date.now() / 1000);
    await ddb.send(new PutItemCommand({
      TableName: "cp-sessions",
      Item: {
        sessionId: { S: "sess-active" },
        userId: { S: "user-1" },
        expiresAt: { N: String(now + 3600) }, // expires in 1 hour
      },
    }));
    await ddb.send(new PutItemCommand({
      TableName: "cp-sessions",
      Item: {
        sessionId: { S: "sess-expired" },
        userId: { S: "user-2" },
        expiresAt: { N: String(now - 3600) }, // already expired
      },
    }));

    // Both items should still be retrievable (TTL expiry is async in real AWS)
    const active = await ddb.send(new GetItemCommand({ TableName: "cp-sessions", Key: { sessionId: { S: "sess-active" } } }));
    expect(active.Item).toBeDefined();
    const expired = await ddb.send(new GetItemCommand({ TableName: "cp-sessions", Key: { sessionId: { S: "sess-expired" } } }));
    expect(expired.Item).toBeDefined(); // still there — TTL expiry is eventual
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pattern 9: API Gateway → Lambda integration
// ─────────────────────────────────────────────────────────────────────
describe("Pattern 9: API Gateway → Lambda", () => {
  test("create HTTP API with Lambda integration", async () => {
    const iam = new IAMClient(clientConfig);
    const lambda = new LambdaClient(clientConfig);
    const apigw = new ApiGatewayV2Client(clientConfig);

    // Create Lambda function
    const role = await iam.send(new CreateRoleCommand({
      RoleName: "cp-api-lambda-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    const fn = await lambda.send(new CreateFunctionCommand({
      FunctionName: "cp-api-handler",
      Runtime: "nodejs20.x", Handler: "index.handler",
      Role: role.Role!.Arn!, Code: { ZipFile: Buffer.from("handler-code") },
      Environment: { Variables: { STAGE: "prod" } },
    }));

    // Create HTTP API
    const api = await apigw.send(new CreateApiCommand({
      Name: "cp-rest-api", ProtocolType: "HTTP",
      Description: "Common patterns REST API",
    }));

    // Create Lambda integration
    const integration = await apigw.send(new CreateIntegrationCommand({
      ApiId: api.ApiId!,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: fn.FunctionArn!,
      PayloadFormatVersion: "2.0",
    }));

    // Create routes
    await apigw.send(new CreateApiRouteCommand({
      ApiId: api.ApiId!,
      RouteKey: "GET /users",
      Target: `integrations/${integration.IntegrationId}`,
    }));
    await apigw.send(new CreateApiRouteCommand({
      ApiId: api.ApiId!,
      RouteKey: "POST /users",
      Target: `integrations/${integration.IntegrationId}`,
    }));
    await apigw.send(new CreateApiRouteCommand({
      ApiId: api.ApiId!,
      RouteKey: "GET /users/{userId}",
      Target: `integrations/${integration.IntegrationId}`,
    }));

    // Deploy to stage
    const stage = await apigw.send(new CreateStageCommand({
      ApiId: api.ApiId!, StageName: "prod", AutoDeploy: true,
    }));
    expect(stage.StageName).toBe("prod");

    // Create event source mapping (SQS → Lambda)
    const sqs = new SQSClient(clientConfig);
    const queue = await sqs.send(new CreateQueueCommand({ QueueName: "cp-api-events" }));
    const queueAttrs = await sqs.send(new GetQueueAttributesCommand({
      QueueUrl: queue.QueueUrl!, AttributeNames: ["QueueArn"],
    }));

    const esm = await lambda.send(new CreateEventSourceMappingCommand({
      FunctionName: "cp-api-handler",
      EventSourceArn: queueAttrs.Attributes!.QueueArn!,
      BatchSize: 10, Enabled: true,
    }));
    expect(esm.UUID).toBeDefined();
    expect(esm.EventSourceArn).toBe(queueAttrs.Attributes!.QueueArn!);

    // Verify event source mappings
    const mappings = await lambda.send(new ListEventSourceMappingsCommand({
      FunctionName: "cp-api-handler",
    }));
    expect(mappings.EventSourceMappings!.length).toBeGreaterThan(0);

    // Invoke Lambda directly (simulating API GW proxy)
    const invoke = await lambda.send(new InvokeCommand({
      FunctionName: "cp-api-handler",
      Payload: Buffer.from(JSON.stringify({
        requestContext: { http: { method: "GET", path: "/users" } },
        queryStringParameters: { limit: "10" },
      })),
    }));
    expect(invoke.StatusCode).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pattern 10: S3 + DynamoDB single-table design (the most common pattern)
// ─────────────────────────────────────────────────────────────────────
describe("Pattern 10: Single-table DynamoDB design", () => {
  const ddb = new DynamoDBClient(clientConfig);

  test("single table with multiple entity types", async () => {
    // Single table for users, orders, and products
    await ddb.send(new CreateTableCommand({
      TableName: "cp-single-table",
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [{
        IndexName: "GSI1",
        KeySchema: [
          { AttributeName: "GSI1PK", KeyType: "HASH" },
          { AttributeName: "GSI1SK", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      }],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // Insert entities using single-table patterns
    await ddb.send(new BatchWriteItemCommand({
      RequestItems: {
        "cp-single-table": [
          // User entity
          { PutRequest: { Item: {
            PK: { S: "USER#user-1" }, SK: { S: "PROFILE" },
            GSI1PK: { S: "USER" }, GSI1SK: { S: "user-1" },
            name: { S: "Alice" }, email: { S: "alice@example.com" }, type: { S: "User" },
          }}},
          // User's orders (1:N relationship)
          { PutRequest: { Item: {
            PK: { S: "USER#user-1" }, SK: { S: "ORDER#2024-001" },
            GSI1PK: { S: "ORDER" }, GSI1SK: { S: "2024-001" },
            total: { N: "99.99" }, status: { S: "COMPLETED" }, type: { S: "Order" },
          }}},
          { PutRequest: { Item: {
            PK: { S: "USER#user-1" }, SK: { S: "ORDER#2024-002" },
            GSI1PK: { S: "ORDER" }, GSI1SK: { S: "2024-002" },
            total: { N: "149.99" }, status: { S: "PENDING" }, type: { S: "Order" },
          }}},
          // Another user
          { PutRequest: { Item: {
            PK: { S: "USER#user-2" }, SK: { S: "PROFILE" },
            GSI1PK: { S: "USER" }, GSI1SK: { S: "user-2" },
            name: { S: "Bob" }, email: { S: "bob@example.com" }, type: { S: "User" },
          }}},
          { PutRequest: { Item: {
            PK: { S: "USER#user-2" }, SK: { S: "ORDER#2024-003" },
            GSI1PK: { S: "ORDER" }, GSI1SK: { S: "2024-003" },
            total: { N: "29.99" }, status: { S: "SHIPPED" }, type: { S: "Order" },
          }}},
        ],
      },
    }));

    // Access pattern 1: Get user profile
    const profile = await ddb.send(new GetItemCommand({
      TableName: "cp-single-table",
      Key: { PK: { S: "USER#user-1" }, SK: { S: "PROFILE" } },
    }));
    expect(profile.Item!.name.S).toBe("Alice");

    // Access pattern 2: Get user + all their orders
    const userAndOrders = await ddb.send(new QueryCommand({
      TableName: "cp-single-table",
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": { S: "USER#user-1" } },
    }));
    expect(userAndOrders.Items!.length).toBe(3); // 1 profile + 2 orders

    // Access pattern 3: Get only orders (SK begins_with)
    const ordersOnly = await ddb.send(new QueryCommand({
      TableName: "cp-single-table",
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": { S: "USER#user-1" },
        ":prefix": { S: "ORDER#" },
      },
    }));
    expect(ordersOnly.Items!.length).toBe(2);
    expect(ordersOnly.Items!.every(i => i.type.S === "Order")).toBe(true);

    // Access pattern 4: GSI — get ALL orders across all users
    const allOrders = await ddb.send(new QueryCommand({
      TableName: "cp-single-table",
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :type",
      ExpressionAttributeValues: { ":type": { S: "ORDER" } },
    }));
    expect(allOrders.Items!.length).toBe(3); // 3 orders total

    // Access pattern 5: GSI — get all users
    const allUsers = await ddb.send(new QueryCommand({
      TableName: "cp-single-table",
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :type",
      ExpressionAttributeValues: { ":type": { S: "USER" } },
    }));
    expect(allUsers.Items!.length).toBe(2);

    // Access pattern 6: Update order status with condition
    await ddb.send(new UpdateItemCommand({
      TableName: "cp-single-table",
      Key: { PK: { S: "USER#user-1" }, SK: { S: "ORDER#2024-002" } },
      UpdateExpression: "SET #s = :newStatus",
      ConditionExpression: "#s = :currentStatus",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":newStatus": { S: "SHIPPED" },
        ":currentStatus": { S: "PENDING" },
      },
    }));

    const updated = await ddb.send(new GetItemCommand({
      TableName: "cp-single-table",
      Key: { PK: { S: "USER#user-1" }, SK: { S: "ORDER#2024-002" } },
    }));
    expect(updated.Item!.status.S).toBe("SHIPPED");
  });
});
