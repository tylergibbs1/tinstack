/**
 * Cross-service integration tests: realistic AWS architectures that exercise
 * actual inter-service behavior — DLQ routing, filter policies, event pattern
 * matching, versioned object lifecycles, nested DynamoDB operations, CIDR
 * validation, password policies, IAM policy versions, and full end-to-end
 * workflows spanning 30+ services.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

// Core
import {
  S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand,
  DeleteObjectCommand, PutBucketVersioningCommand, ListObjectVersionsCommand,
  PutBucketLifecycleConfigurationCommand, GetBucketLifecycleConfigurationCommand,
  PutBucketEncryptionCommand, GetBucketEncryptionCommand,
} from "@aws-sdk/client-s3";
import {
  DynamoDBClient, CreateTableCommand, PutItemCommand, GetItemCommand,
  QueryCommand, UpdateItemCommand, BatchWriteItemCommand, ExecuteStatementCommand,
} from "@aws-sdk/client-dynamodb";
import {
  SQSClient, CreateQueueCommand, SendMessageCommand, ReceiveMessageCommand,
  GetQueueAttributesCommand, ChangeMessageVisibilityCommand,
} from "@aws-sdk/client-sqs";
import {
  SNSClient, CreateTopicCommand, SubscribeCommand, PublishCommand,
} from "@aws-sdk/client-sns";
import {
  LambdaClient, CreateFunctionCommand, InvokeCommand,
  PublishVersionCommand, CreateAliasCommand, GetAliasCommand,
} from "@aws-sdk/client-lambda";
import {
  EventBridgeClient, PutEventsCommand, PutRuleCommand, PutTargetsCommand,
  DescribeRuleCommand, EnableRuleCommand, DisableRuleCommand,
} from "@aws-sdk/client-eventbridge";
import {
  SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand,
  RotateSecretCommand, PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  SSMClient, PutParameterCommand, GetParameterCommand,
  GetParametersByPathCommand, CreateDocumentCommand,
} from "@aws-sdk/client-ssm";
import {
  KMSClient, CreateKeyCommand, EncryptCommand, DecryptCommand,
  GenerateDataKeyCommand, SignCommand, VerifyCommand,
} from "@aws-sdk/client-kms";
import {
  IAMClient, CreateRoleCommand, CreatePolicyCommand, AttachRolePolicyCommand,
  CreatePolicyVersionCommand, GetPolicyVersionCommand, ListPolicyVersionsCommand,
  CreateInstanceProfileCommand, AddRoleToInstanceProfileCommand,
  CreateGroupCommand, AddUserToGroupCommand, CreateUserCommand,
  CreateAccessKeyCommand,
} from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  KinesisClient, CreateStreamCommand, PutRecordCommand, DescribeStreamCommand,
  GetShardIteratorCommand, GetRecordsCommand, ListShardsCommand,
  RegisterStreamConsumerCommand, ListStreamConsumersCommand,
} from "@aws-sdk/client-kinesis";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  CloudWatchLogsClient, CreateLogGroupCommand, CreateLogStreamCommand,
  PutLogEventsCommand, FilterLogEventsCommand, PutMetricFilterCommand,
  DescribeMetricFiltersCommand, PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  CloudWatchClient, PutMetricDataCommand, GetMetricDataCommand,
  PutMetricAlarmCommand, SetAlarmStateCommand, DescribeAlarmsCommand,
  PutDashboardCommand, GetDashboardCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  SFNClient, CreateStateMachineCommand, StartExecutionCommand,
  DescribeExecutionCommand,
} from "@aws-sdk/client-sfn";

// Networking & Containers
import {
  EC2Client, CreateVpcCommand, CreateSubnetCommand, CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand, RunInstancesCommand,
  DescribeInstancesCommand, TerminateInstancesCommand,
  CreateVolumeCommand, AttachVolumeCommand, CreateKeyPairCommand,
  CreateInternetGatewayCommand, AttachInternetGatewayCommand,
} from "@aws-sdk/client-ec2";
import {
  ElasticLoadBalancingV2Client, CreateLoadBalancerCommand,
  CreateTargetGroupCommand, CreateListenerCommand,
  RegisterTargetsCommand, DescribeTargetHealthCommand, CreateRuleCommand as CreateLBRuleCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  ECSClient, CreateClusterCommand, RegisterTaskDefinitionCommand,
  CreateServiceCommand as CreateECSServiceCommand, RunTaskCommand,
  DescribeTasksCommand, StopTaskCommand,
} from "@aws-sdk/client-ecs";
import {
  ECRClient, CreateRepositoryCommand, PutImageCommand,
  GetAuthorizationTokenCommand,
} from "@aws-sdk/client-ecr";

// DNS, Email, Certs, Auth, API
import { Route53Client, CreateHostedZoneCommand, ChangeResourceRecordSetsCommand } from "@aws-sdk/client-route-53";
import {
  SESv2Client, CreateEmailIdentityCommand, SendEmailCommand,
  CreateEmailTemplateCommand, GetEmailTemplateCommand,
  CreateConfigurationSetCommand,
} from "@aws-sdk/client-sesv2";
import { ACMClient, RequestCertificateCommand, DescribeCertificateCommand } from "@aws-sdk/client-acm";
import {
  CognitoIdentityProviderClient, CreateUserPoolCommand,
  CreateUserPoolClientCommand, AdminCreateUserCommand, AdminGetUserCommand,
  CreateGroupCommand as CreateCognitoGroupCommand,
  AdminAddUserToGroupCommand, AdminListGroupsForUserCommand,
  SignUpCommand, AdminConfirmSignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  ApiGatewayV2Client, CreateApiCommand,
  CreateRouteCommand as CreateApiRouteCommand,
  CreateIntegrationCommand, CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";

// New services
import {
  CloudFormationClient, CreateStackCommand, DescribeStacksCommand,
  GetTemplateCommand, CreateChangeSetCommand, ExecuteChangeSetCommand,
} from "@aws-sdk/client-cloudformation";
import {
  CloudFrontClient, CreateDistributionCommand, CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import {
  FirehoseClient, CreateDeliveryStreamCommand, PutRecordCommand as FirehosePutRecordCommand,
  PutRecordBatchCommand,
} from "@aws-sdk/client-firehose";
import {
  WAFV2Client, CreateWebACLCommand, CreateIPSetCommand, AssociateWebACLCommand,
} from "@aws-sdk/client-wafv2";
import {
  AppSyncClient, CreateGraphqlApiCommand, CreateDataSourceCommand,
  CreateResolverCommand, StartSchemaCreationCommand,
} from "@aws-sdk/client-appsync";
import {
  AthenaClient, CreateWorkGroupCommand, StartQueryExecutionCommand,
  GetQueryExecutionCommand, GetQueryResultsCommand,
  CreateNamedQueryCommand,
} from "@aws-sdk/client-athena";
import {
  GlueClient, CreateDatabaseCommand as CreateGlueDatabaseCommand,
  CreateTableCommand as CreateGlueTableCommand,
  CreateCrawlerCommand, StartCrawlerCommand,
  CreateJobCommand, StartJobRunCommand, GetJobRunCommand,
  CreateTriggerCommand,
} from "@aws-sdk/client-glue";
import {
  RDSClient, CreateDBSubnetGroupCommand, CreateDBInstanceCommand,
  CreateDBClusterCommand, DescribeDBInstancesCommand,
  CreateDBSnapshotCommand, DescribeDBSnapshotsCommand,
} from "@aws-sdk/client-rds";
import {
  SchedulerClient, CreateScheduleCommand, CreateScheduleGroupCommand,
} from "@aws-sdk/client-scheduler";
import {
  AppConfigClient, CreateApplicationCommand, CreateEnvironmentCommand,
  CreateConfigurationProfileCommand, CreateHostedConfigurationVersionCommand,
  StartDeploymentCommand,
} from "@aws-sdk/client-appconfig";
import {
  EFSClient, CreateFileSystemCommand, CreateMountTargetCommand,
  DescribeFileSystemsCommand, CreateAccessPointCommand,
} from "@aws-sdk/client-efs";
import {
  BedrockRuntimeClient, InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  TextractClient, DetectDocumentTextCommand,
} from "@aws-sdk/client-textract";
import {
  MediaConvertClient, CreateJobCommand as CreateMediaJobCommand,
  DescribeEndpointsCommand,
} from "@aws-sdk/client-mediaconvert";

import { startServer, stopServer, clientConfig, ENDPOINT } from "./helpers";

beforeAll(() => startServer());
afterAll(() => stopServer());

// ─────────────────────────────────────────────────────────────────────
// Scenario 1: S3 versioned object lifecycle with KMS envelope encryption
// Tests: delete markers, versionId retrieval, KMS encrypt/decrypt, lifecycle
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 1: S3 versioned lifecycle + KMS envelope encryption", () => {
  test("full lifecycle: version, encrypt, delete marker, recover", async () => {
    const s3 = new S3Client(clientConfig);
    const kms = new KMSClient(clientConfig);

    // Create KMS key for envelope encryption
    const key = await kms.send(new CreateKeyCommand({ Description: "xsvc-envelope-key" }));
    const keyId = key.KeyMetadata!.KeyId!;

    // Generate data key for client-side encryption
    const dataKey = await kms.send(new GenerateDataKeyCommand({ KeyId: keyId, KeySpec: "AES_256" }));
    expect(dataKey.Plaintext).toBeDefined();
    expect(dataKey.CiphertextBlob).toBeDefined();

    // Create versioned bucket with encryption config
    await s3.send(new CreateBucketCommand({ Bucket: "xsvc-versioned" }));
    await s3.send(new PutBucketVersioningCommand({
      Bucket: "xsvc-versioned",
      VersioningConfiguration: { Status: "Enabled" },
    }));
    await s3.send(new PutBucketEncryptionCommand({
      Bucket: "xsvc-versioned",
      ServerSideEncryptionConfiguration: {
        Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms", KMSMasterKeyID: keyId } }],
      },
    }));

    // Put v1 of the secret config
    const secretData = JSON.stringify({ dbHost: "prod-db.internal", dbPort: 5432 });
    const encrypted = await kms.send(new EncryptCommand({ KeyId: keyId, Plaintext: new TextEncoder().encode(secretData) }));
    await s3.send(new PutObjectCommand({
      Bucket: "xsvc-versioned", Key: "config/secrets.enc",
      Body: encrypted.CiphertextBlob, ContentType: "application/octet-stream",
      Metadata: { "x-amz-key-id": keyId },
    }));

    // Put v2 (rotated secrets)
    const newSecretData = JSON.stringify({ dbHost: "prod-db-v2.internal", dbPort: 5433 });
    const encrypted2 = await kms.send(new EncryptCommand({ KeyId: keyId, Plaintext: new TextEncoder().encode(newSecretData) }));
    await s3.send(new PutObjectCommand({
      Bucket: "xsvc-versioned", Key: "config/secrets.enc",
      Body: encrypted2.CiphertextBlob,
    }));

    // List versions — should have 2
    const versions = await s3.send(new ListObjectVersionsCommand({ Bucket: "xsvc-versioned", Prefix: "config/secrets.enc" }));
    expect(versions.Versions!.length).toBe(2);
    const v1Id = versions.Versions!.find(v => !v.IsLatest)?.VersionId;
    const v2Id = versions.Versions!.find(v => v.IsLatest)?.VersionId;
    expect(v1Id).toBeDefined();
    expect(v2Id).toBeDefined();

    // Get v1 by versionId and decrypt it
    const v1Obj = await s3.send(new GetObjectCommand({
      Bucket: "xsvc-versioned", Key: "config/secrets.enc", VersionId: v1Id,
    }));
    const v1Bytes = await v1Obj.Body!.transformToByteArray();
    const decrypted1 = await kms.send(new DecryptCommand({ CiphertextBlob: v1Bytes }));
    expect(new TextDecoder().decode(decrypted1.Plaintext!)).toBe(secretData);

    // Delete the object (creates delete marker)
    await s3.send(new DeleteObjectCommand({ Bucket: "xsvc-versioned", Key: "config/secrets.enc" }));

    // GET should now 404
    try {
      await s3.send(new GetObjectCommand({ Bucket: "xsvc-versioned", Key: "config/secrets.enc" }));
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.name).toContain("NoSuchKey");
    }

    // But v1 and v2 are still accessible by versionId
    const v2Obj = await s3.send(new GetObjectCommand({
      Bucket: "xsvc-versioned", Key: "config/secrets.enc", VersionId: v2Id,
    }));
    const v2Bytes = await v2Obj.Body!.transformToByteArray();
    const decrypted2 = await kms.send(new DecryptCommand({ CiphertextBlob: v2Bytes }));
    expect(new TextDecoder().decode(decrypted2.Plaintext!)).toBe(newSecretData);

    // KMS sign/verify for audit trail
    const auditMsg = new TextEncoder().encode(`deleted config/secrets.enc at ${Date.now()}`);
    const sig = await kms.send(new SignCommand({
      KeyId: keyId, Message: auditMsg, SigningAlgorithm: "RSASSA_PKCS1_V1_5_SHA_256",
      MessageType: "RAW",
    }));
    const verify = await kms.send(new VerifyCommand({
      KeyId: keyId, Message: auditMsg, Signature: sig.Signature!,
      SigningAlgorithm: "RSASSA_PKCS1_V1_5_SHA_256", MessageType: "RAW",
    }));
    expect(verify.SignatureValid).toBe(true);

    // Verify encryption config
    const encConfig = await s3.send(new GetBucketEncryptionCommand({ Bucket: "xsvc-versioned" }));
    expect(encConfig.ServerSideEncryptionConfiguration!.Rules![0]
      .ApplyServerSideEncryptionByDefault!.SSEAlgorithm).toBe("aws:kms");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 2: Message pipeline with DLQ, filter policies, and event matching
// Tests: SQS DLQ (RedrivePolicy), SNS FilterPolicy evaluation, EventBridge pattern matching
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 2: Event-driven pipeline with DLQ + filters + pattern matching", () => {
  test("full pipeline: SNS → filtered SQS → DLQ + EventBridge matching", async () => {
    const sns = new SNSClient(clientConfig);
    const sqs = new SQSClient(clientConfig);
    const eb = new EventBridgeClient(clientConfig);

    // Create DLQ
    const dlq = await sqs.send(new CreateQueueCommand({ QueueName: "xsvc-dlq" }));
    const dlqAttrs = await sqs.send(new GetQueueAttributesCommand({
      QueueUrl: dlq.QueueUrl!, AttributeNames: ["QueueArn"],
    }));

    // Create processing queue with RedrivePolicy (max 2 receives before DLQ)
    const procQueue = await sqs.send(new CreateQueueCommand({
      QueueName: "xsvc-processing",
      Attributes: {
        VisibilityTimeout: "1",
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: dlqAttrs.Attributes!.QueueArn!,
          maxReceiveCount: "2",
        }),
      },
    }));

    // Create SNS topic for order events
    const topic = await sns.send(new CreateTopicCommand({ Name: "xsvc-orders" }));

    // Subscribe queue with filter: only "electronics" category
    await sns.send(new SubscribeCommand({
      TopicArn: topic.TopicArn!,
      Protocol: "sqs",
      Endpoint: procQueue.QueueUrl!,
      Attributes: {
        FilterPolicy: JSON.stringify({ category: ["electronics"] }),
      },
    }));

    // Publish matching event (electronics)
    await sns.send(new PublishCommand({
      TopicArn: topic.TopicArn!,
      Message: JSON.stringify({ orderId: "ORD-001", item: "Laptop" }),
      MessageAttributes: {
        category: { DataType: "String", StringValue: "electronics" },
      },
    }));

    // Publish non-matching event (clothing) — should be filtered out
    await sns.send(new PublishCommand({
      TopicArn: topic.TopicArn!,
      Message: JSON.stringify({ orderId: "ORD-002", item: "T-Shirt" }),
      MessageAttributes: {
        category: { DataType: "String", StringValue: "clothing" },
      },
    }));

    // Create a separate DLQ test queue to avoid interference from SNS messages
    const dlqTestQueue = await sqs.send(new CreateQueueCommand({
      QueueName: "xsvc-dlq-test",
      Attributes: {
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: dlqAttrs.Attributes!.QueueArn!,
          maxReceiveCount: "2",
        }),
      },
    }));

    // Send a "poison pill" message
    await sqs.send(new SendMessageCommand({
      QueueUrl: dlqTestQueue.QueueUrl!,
      MessageBody: JSON.stringify({ orderId: "POISON", error: "will fail processing" }),
    }));

    // Receive the poison pill twice (simulating failed processing)
    // Each receive increments the count. Use ChangeMessageVisibility to make it visible again.
    for (let i = 0; i < 2; i++) {
      const recv = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: dlqTestQueue.QueueUrl!, MaxNumberOfMessages: 1, VisibilityTimeout: 0,
      }));
      if (!recv.Messages?.length) break;
      // Make it immediately visible again for re-receive
      await sqs.send(new ChangeMessageVisibilityCommand({
        QueueUrl: dlqTestQueue.QueueUrl!,
        ReceiptHandle: recv.Messages[0].ReceiptHandle!,
        VisibilityTimeout: 0,
      }));
    }

    // Third receive triggers DLQ — poison pill should be gone from main queue
    const recv3 = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: dlqTestQueue.QueueUrl!, MaxNumberOfMessages: 10,
    }));
    // Either empty or the message was already moved
    const poisonStillInMain = recv3.Messages?.find(m =>
      JSON.parse(m.Body!).orderId === "POISON"
    );

    // Verify poison pill arrived in DLQ
    const dlqRecv = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: dlq.QueueUrl!, MaxNumberOfMessages: 10,
    }));
    const poisonInDlq = dlqRecv.Messages?.find(m =>
      JSON.parse(m.Body!).orderId === "POISON"
    );
    expect(poisonInDlq).toBeDefined();

    // EventBridge: create rule matching order events
    await eb.send(new PutRuleCommand({
      Name: "xsvc-order-rule",
      EventPattern: JSON.stringify({
        source: ["xsvc.orders"],
        "detail-type": ["OrderPlaced"],
      }),
      State: "ENABLED",
    }));
    await eb.send(new PutTargetsCommand({
      Rule: "xsvc-order-rule",
      Targets: [{ Id: "audit-log", Arn: "arn:aws:logs:us-east-1:000000000000:log-group:/xsvc/audit" }],
    }));

    // Put matching event
    const matched = await eb.send(new PutEventsCommand({
      Entries: [{
        Source: "xsvc.orders",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "ORD-001", total: 999.99 }),
      }],
    }));
    expect(matched.FailedEntryCount).toBe(0);

    // Put non-matching event
    await eb.send(new PutEventsCommand({
      Entries: [{
        Source: "xsvc.shipping",
        DetailType: "PackageShipped",
        Detail: JSON.stringify({ trackingId: "TRK-001" }),
      }],
    }));

    // Disable rule and verify it stops matching
    await eb.send(new DisableRuleCommand({ Name: "xsvc-order-rule" }));
    await eb.send(new PutEventsCommand({
      Entries: [{
        Source: "xsvc.orders",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "ORD-003" }),
      }],
    }));

    // Re-enable
    await eb.send(new EnableRuleCommand({ Name: "xsvc-order-rule" }));
    const rule = await eb.send(new DescribeRuleCommand({ Name: "xsvc-order-rule" }));
    expect(rule.State).toBe("ENABLED");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 3: DynamoDB nested operations + PartiQL + Step Functions orchestration
// Tests: nested paths in UpdateExpression/ProjectionExpression, PartiQL, ASL engine
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 3: DynamoDB nested ops + PartiQL + Step Functions", () => {
  test("product catalog with nested attributes and state machine", async () => {
    const ddb = new DynamoDBClient(clientConfig);
    const sfn = new SFNClient(clientConfig);
    const iam = new IAMClient(clientConfig);

    // Create product table
    await ddb.send(new CreateTableCommand({
      TableName: "xsvc-products",
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }, { AttributeName: "sk", KeyType: "RANGE" }],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // Insert product with deeply nested attributes
    await ddb.send(new PutItemCommand({
      TableName: "xsvc-products",
      Item: {
        pk: { S: "PROD#laptop-001" },
        sk: { S: "METADATA" },
        name: { S: "Pro Laptop 16" },
        pricing: { M: {
          base: { N: "1999" },
          discounts: { M: {
            student: { N: "15" },
            employee: { N: "25" },
          }},
          currency: { S: "USD" },
        }},
        specs: { M: {
          cpu: { S: "M3 Max" },
          ram: { N: "64" },
          storage: { L: [{ S: "1TB SSD" }, { S: "512GB SSD" }] },
        }},
        tags: { L: [{ S: "electronics" }, { S: "premium" }] },
        inventory: { N: "50" },
      },
    }));

    // Update nested attribute: change student discount
    await ddb.send(new UpdateItemCommand({
      TableName: "xsvc-products",
      Key: { pk: { S: "PROD#laptop-001" }, sk: { S: "METADATA" } },
      UpdateExpression: "SET pricing.discounts.student = :newDiscount, specs.storage[0] = :newStorage",
      ExpressionAttributeValues: {
        ":newDiscount": { N: "20" },
        ":newStorage": { S: "2TB SSD" },
      },
    }));

    // Query with nested projection
    const projected = await ddb.send(new QueryCommand({
      TableName: "xsvc-products",
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": { S: "PROD#laptop-001" } },
      ProjectionExpression: "pricing.discounts.student, specs.storage",
    }));
    expect(projected.Items![0].pricing.M!.discounts.M!.student.N).toBe("20");
    expect(projected.Items![0].specs.M!.storage.L![0].S).toBe("2TB SSD");

    // PartiQL: query the product
    const partiql = await ddb.send(new ExecuteStatementCommand({
      Statement: `SELECT * FROM "xsvc-products" WHERE pk = ?`,
      Parameters: [{ S: "PROD#laptop-001" }],
    }));
    expect(partiql.Items!.length).toBe(1);
    expect(partiql.Items![0].name.S).toBe("Pro Laptop 16");

    // Step Functions: order fulfillment workflow using the product data
    const role = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc-sfn-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "states.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    const orderWorkflow = {
      StartAt: "CheckInventory",
      States: {
        CheckInventory: {
          Type: "Pass",
          Result: { available: true, quantity: 50 },
          ResultPath: "$.inventory",
          Next: "CalculatePrice",
        },
        CalculatePrice: {
          Type: "Pass",
          Result: { basePrice: 1999, discount: 20, finalPrice: 1599.20 },
          ResultPath: "$.pricing",
          Next: "DecideShipping",
        },
        DecideShipping: {
          Type: "Choice",
          Choices: [
            {
              Variable: "$.pricing.finalPrice",
              NumericGreaterThan: 1000,
              Next: "FreeShipping",
            },
          ],
          Default: "StandardShipping",
        },
        FreeShipping: {
          Type: "Pass",
          Result: { method: "express", cost: 0 },
          ResultPath: "$.shipping",
          Next: "ProcessPayment",
        },
        StandardShipping: {
          Type: "Pass",
          Result: { method: "standard", cost: 9.99 },
          ResultPath: "$.shipping",
          Next: "ProcessPayment",
        },
        ProcessPayment: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "ChargeCard",
              States: {
                ChargeCard: {
                  Type: "Pass",
                  Result: { chargeId: "ch_xsvc001", status: "succeeded" },
                  End: true,
                },
              },
            },
            {
              StartAt: "SendReceipt",
              States: {
                SendReceipt: {
                  Type: "Pass",
                  Result: { emailSent: true, receiptId: "rcpt_001" },
                  End: true,
                },
              },
            },
          ],
          ResultPath: "$.payment",
          Next: "OrderComplete",
        },
        OrderComplete: { Type: "Succeed" },
      },
    };

    const sm = await sfn.send(new CreateStateMachineCommand({
      name: "xsvc-order-workflow",
      definition: JSON.stringify(orderWorkflow),
      roleArn: role.Role!.Arn!,
    }));

    const exec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: sm.stateMachineArn!,
      input: JSON.stringify({ productId: "laptop-001", customerId: "cust-001", quantity: 1 }),
    }));

    const result = await sfn.send(new DescribeExecutionCommand({ executionArn: exec.executionArn! }));
    expect(result.status).toBe("SUCCEEDED");

    const output = JSON.parse(result.output!);
    expect(output.inventory.available).toBe(true);
    expect(output.shipping.method).toBe("express"); // >$1000 = free express
    expect(output.shipping.cost).toBe(0);
    expect(output.payment).toHaveLength(2); // parallel branches
    expect(output.payment[0].chargeId).toBe("ch_xsvc001");
    expect(output.payment[1].emailSent).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 4: Production infrastructure with CIDR validation, IAM policy
// versions, Cognito auth with password policy, and full networking stack
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 4: Secure infrastructure with IAM + Cognito + VPC", () => {
  test("production-grade identity, networking, and compute", async () => {
    const iam = new IAMClient(clientConfig);
    const sts = new STSClient(clientConfig);
    const cognito = new CognitoIdentityProviderClient(clientConfig);
    const ec2 = new EC2Client(clientConfig);
    const rds = new RDSClient(clientConfig);

    // ── IAM: policy version management ──
    const policy = await iam.send(new CreatePolicyCommand({
      PolicyName: "xsvc-db-access",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Action: ["rds:DescribeDBInstances"], Resource: "*" }],
      }),
    }));

    // Create v2 with broader permissions
    const v2 = await iam.send(new CreatePolicyVersionCommand({
      PolicyArn: policy.Policy!.Arn!,
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Action: ["rds:*"], Resource: "*" }],
      }),
      SetAsDefault: true,
    }));
    expect(v2.PolicyVersion!.VersionId).toBe("v2");
    expect(v2.PolicyVersion!.IsDefaultVersion).toBe(true);

    // Verify v1 is no longer default
    const v1Check = await iam.send(new GetPolicyVersionCommand({
      PolicyArn: policy.Policy!.Arn!, VersionId: "v1",
    }));
    expect(v1Check.PolicyVersion!.IsDefaultVersion).toBe(false);

    // List versions
    const versions = await iam.send(new ListPolicyVersionsCommand({ PolicyArn: policy.Policy!.Arn! }));
    expect(versions.Versions!.length).toBe(2);

    // Full IAM role chain: role → instance profile → access key
    const role = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc-app-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));
    await iam.send(new AttachRolePolicyCommand({ RoleName: "xsvc-app-role", PolicyArn: policy.Policy!.Arn! }));

    const profile = await iam.send(new CreateInstanceProfileCommand({ InstanceProfileName: "xsvc-app-profile" }));
    await iam.send(new AddRoleToInstanceProfileCommand({
      InstanceProfileName: "xsvc-app-profile", RoleName: "xsvc-app-role",
    }));

    // IAM group with user and access key
    await iam.send(new CreateGroupCommand({ GroupName: "xsvc-developers" }));
    await iam.send(new CreateUserCommand({ UserName: "xsvc-dev-alice" }));
    await iam.send(new AddUserToGroupCommand({ GroupName: "xsvc-developers", UserName: "xsvc-dev-alice" }));
    const accessKey = await iam.send(new CreateAccessKeyCommand({ UserName: "xsvc-dev-alice" }));
    expect(accessKey.AccessKey!.AccessKeyId).toBeDefined();
    expect(accessKey.AccessKey!.SecretAccessKey).toBeDefined();

    // STS: assume the role
    const assumed = await sts.send(new AssumeRoleCommand({
      RoleArn: role.Role!.Arn!, RoleSessionName: "xsvc-session",
    }));
    expect(assumed.Credentials!.AccessKeyId).toMatch(/^ASIA/);
    expect(assumed.Credentials!.SessionToken).toBeDefined();

    // ── Cognito: user pool with password policy enforcement ──
    const pool = await cognito.send(new CreateUserPoolCommand({
      PoolName: "xsvc-auth",
      Policies: {
        PasswordPolicy: {
          MinimumLength: 10,
          RequireUppercase: true,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
    }));
    const poolId = pool.UserPool!.Id!;

    const client = await cognito.send(new CreateUserPoolClientCommand({
      UserPoolId: poolId, ClientName: "xsvc-web",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    }));

    // Weak password should be rejected
    try {
      await cognito.send(new SignUpCommand({
        ClientId: client.UserPoolClient!.ClientId!,
        Username: "alice@xsvc.com",
        Password: "weak",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toContain("InvalidPasswordException");
    }

    // Strong password should work
    await cognito.send(new SignUpCommand({
      ClientId: client.UserPoolClient!.ClientId!,
      Username: "alice@xsvc.com",
      Password: "Str0ng!Pass@2024",
    }));
    await cognito.send(new AdminConfirmSignUpCommand({ UserPoolId: poolId, Username: "alice@xsvc.com" }));

    // Create group and assign user
    await cognito.send(new CreateCognitoGroupCommand({
      UserPoolId: poolId, GroupName: "admins", Description: "Platform admins",
    }));
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: poolId, Username: "alice@xsvc.com", GroupName: "admins",
    }));
    const groups = await cognito.send(new AdminListGroupsForUserCommand({
      UserPoolId: poolId, Username: "alice@xsvc.com",
    }));
    expect(groups.Groups![0].GroupName).toBe("admins");

    // ── VPC with CIDR validation ──
    const vpc = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.100.0.0/16" }));
    const vpcId = vpc.Vpc!.VpcId!;

    const sub1 = await ec2.send(new CreateSubnetCommand({
      VpcId: vpcId, CidrBlock: "10.100.1.0/24", AvailabilityZone: "us-east-1a",
    }));
    const sub2 = await ec2.send(new CreateSubnetCommand({
      VpcId: vpcId, CidrBlock: "10.100.2.0/24", AvailabilityZone: "us-east-1b",
    }));

    // Overlapping CIDR should fail
    try {
      await ec2.send(new CreateSubnetCommand({
        VpcId: vpcId, CidrBlock: "10.100.1.128/25", // overlaps with 10.100.1.0/24
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("conflicts");
    }

    // Security group
    const sg = await ec2.send(new CreateSecurityGroupCommand({
      GroupName: "xsvc-db-sg", Description: "DB security group", VpcId: vpcId,
    }));
    await ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: sg.GroupId!,
      IpPermissions: [{ IpProtocol: "tcp", FromPort: 5432, ToPort: 5432, IpRanges: [{ CidrIp: "10.100.0.0/16" }] }],
    }));

    // RDS in the VPC
    await rds.send(new CreateDBSubnetGroupCommand({
      DBSubnetGroupName: "xsvc-db-subnets",
      DBSubnetGroupDescription: "DB subnet group",
      SubnetIds: [sub1.Subnet!.SubnetId!, sub2.Subnet!.SubnetId!],
    }));

    const db = await rds.send(new CreateDBInstanceCommand({
      DBInstanceIdentifier: "xsvc-prod-db",
      DBInstanceClass: "db.r6g.large",
      Engine: "postgres",
      MasterUsername: "admin",
      MasterUserPassword: "Str0ng!DbPass@2024",
      AllocatedStorage: 100,
      DBSubnetGroupName: "xsvc-db-subnets",
    }));
    expect(db.DBInstance!.DBInstanceStatus).toBe("available");

    // Snapshot for backup
    const snap = await rds.send(new CreateDBSnapshotCommand({
      DBSnapshotIdentifier: "xsvc-prod-snap-1",
      DBInstanceIdentifier: "xsvc-prod-db",
    }));
    expect(snap.DBSnapshot!.Status).toBe("available");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 5: Container platform — ECR → ECS → ALB → Route 53 → CloudFront → WAF
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 5: Container platform with full networking", () => {
  test("ECR push → ECS deploy → ALB → DNS → CDN → WAF", async () => {
    const ecr = new ECRClient(clientConfig);
    const ecs = new ECSClient(clientConfig);
    const ec2 = new EC2Client(clientConfig);
    const elb = new ElasticLoadBalancingV2Client(clientConfig);
    const r53 = new Route53Client(clientConfig);
    const cf = new CloudFrontClient(clientConfig);
    const waf = new WAFV2Client(clientConfig);
    const acm = new ACMClient(clientConfig);
    const iam = new IAMClient(clientConfig);

    // ECR: push container image
    const repo = await ecr.send(new CreateRepositoryCommand({ repositoryName: "xsvc/api" }));
    await ecr.send(new PutImageCommand({
      repositoryName: "xsvc/api",
      imageManifest: JSON.stringify({ schemaVersion: 2, config: { digest: "sha256:abc" } }),
      imageTag: "v1.2.3",
    }));
    const auth = await ecr.send(new GetAuthorizationTokenCommand({}));
    expect(auth.authorizationData![0].authorizationToken).toBeDefined();

    // VPC + subnets
    const vpc = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.200.0.0/16" }));
    const pubSub1 = await ec2.send(new CreateSubnetCommand({
      VpcId: vpc.Vpc!.VpcId!, CidrBlock: "10.200.1.0/24", AvailabilityZone: "us-east-1a",
    }));
    const pubSub2 = await ec2.send(new CreateSubnetCommand({
      VpcId: vpc.Vpc!.VpcId!, CidrBlock: "10.200.2.0/24", AvailabilityZone: "us-east-1b",
    }));

    // ECS cluster + task definition + service
    const cluster = await ecs.send(new CreateClusterCommand({ clusterName: "xsvc-cluster" }));
    const role = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc-ecs-task-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "ecs-tasks.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    const taskDef = await ecs.send(new RegisterTaskDefinitionCommand({
      family: "xsvc-api",
      requiresCompatibilities: ["FARGATE"],
      networkMode: "awsvpc",
      cpu: "256", memory: "512",
      executionRoleArn: role.Role!.Arn!,
      containerDefinitions: [{
        name: "api",
        image: `${repo.repository!.repositoryUri}:v1.2.3`,
        portMappings: [{ containerPort: 8080, protocol: "tcp" }],
        essential: true,
        environment: [
          { name: "NODE_ENV", value: "production" },
          { name: "PORT", value: "8080" },
        ],
      }],
    }));

    // ALB with target group and listener
    const alb = await elb.send(new CreateLoadBalancerCommand({
      Name: "xsvc-api-alb",
      Subnets: [pubSub1.Subnet!.SubnetId!, pubSub2.Subnet!.SubnetId!],
      Type: "application",
      Scheme: "internet-facing",
    }));
    const tg = await elb.send(new CreateTargetGroupCommand({
      Name: "xsvc-api-tg", Protocol: "HTTP", Port: 8080,
      VpcId: vpc.Vpc!.VpcId!, TargetType: "ip", HealthCheckPath: "/health",
    }));
    await elb.send(new CreateListenerCommand({
      LoadBalancerArn: alb.LoadBalancers![0].LoadBalancerArn!,
      Protocol: "HTTP", Port: 80,
      DefaultActions: [{ Type: "forward", TargetGroupArn: tg.TargetGroups![0].TargetGroupArn! }],
    }));

    // Register mock targets
    await elb.send(new RegisterTargetsCommand({
      TargetGroupArn: tg.TargetGroups![0].TargetGroupArn!,
      Targets: [{ Id: "10.200.1.10", Port: 8080 }, { Id: "10.200.1.11", Port: 8080 }],
    }));
    const health = await elb.send(new DescribeTargetHealthCommand({
      TargetGroupArn: tg.TargetGroups![0].TargetGroupArn!,
    }));
    expect(health.TargetHealthDescriptions!.length).toBe(2);

    // ECS service
    await ecs.send(new CreateECSServiceCommand({
      cluster: "xsvc-cluster",
      serviceName: "xsvc-api-service",
      taskDefinition: taskDef.taskDefinition!.taskDefinitionArn!,
      desiredCount: 2,
      launchType: "FARGATE",
    }));

    // Run a task and verify
    const task = await ecs.send(new RunTaskCommand({
      cluster: "xsvc-cluster",
      taskDefinition: taskDef.taskDefinition!.taskDefinitionArn!,
      count: 1, launchType: "FARGATE",
    }));
    expect(task.tasks![0].lastStatus).toBe("RUNNING");

    // ACM certificate
    const cert = await acm.send(new RequestCertificateCommand({
      DomainName: "api.xsvc-platform.com",
      SubjectAlternativeNames: ["*.xsvc-platform.com"],
    }));

    // Route 53 hosted zone + DNS record
    const zone = await r53.send(new CreateHostedZoneCommand({
      Name: "xsvc-platform.com", CallerReference: `xsvc-${Date.now()}`,
    }));
    await r53.send(new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone.HostedZone!.Id!,
      ChangeBatch: {
        Changes: [{
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "api.xsvc-platform.com", Type: "A", TTL: 60,
            ResourceRecords: [{ Value: "10.200.1.1" }],
          },
        }],
      },
    }));

    // CloudFront distribution
    const dist = await cf.send(new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: `xsvc-cf-${Date.now()}`,
        Origins: { Quantity: 1, Items: [{
          Id: "alb-origin", DomainName: "xsvc-api-alb.us-east-1.elb.amazonaws.com",
          CustomOriginConfig: { HTTPPort: 80, HTTPSPort: 443, OriginProtocolPolicy: "http-only" },
        }]},
        DefaultCacheBehavior: {
          TargetOriginId: "alb-origin", ViewerProtocolPolicy: "redirect-to-https",
          ForwardedValues: { QueryString: true, Cookies: { Forward: "none" } },
          MinTTL: 0,
        },
        Enabled: true, Comment: "xsvc API CDN",
      },
    }));
    expect(dist.Distribution!.DomainName).toBeDefined();

    // Invalidate cache
    const inv = await cf.send(new CreateInvalidationCommand({
      DistributionId: dist.Distribution!.Id!,
      InvalidationBatch: { CallerReference: `inv-${Date.now()}`, Paths: { Quantity: 1, Items: ["/api/*"] } },
    }));
    expect(inv.Invalidation!.Status).toBe("Completed");

    // WAF: protect the ALB
    const ipSet = await waf.send(new CreateIPSetCommand({
      Name: "xsvc-blocked-ips", Scope: "REGIONAL",
      IPAddressVersion: "IPV4", Addresses: ["192.168.1.0/24", "10.0.0.0/8"],
    }));
    const webAcl = await waf.send(new CreateWebACLCommand({
      Name: "xsvc-api-acl", Scope: "REGIONAL",
      DefaultAction: { Allow: {} },
      Rules: [{
        Name: "block-bad-ips", Priority: 1,
        Statement: { IPSetReferenceStatement: { ARN: ipSet.Summary!.ARN! } },
        Action: { Block: {} },
        VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: "blocked" },
      }],
      VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: "xsvc-acl" },
    }));
    await waf.send(new AssociateWebACLCommand({
      WebACLArn: webAcl.Summary!.ARN!,
      ResourceArn: alb.LoadBalancers![0].LoadBalancerArn!,
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 6: Data platform — Glue ETL → Athena → Firehose → S3
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 6: Data analytics platform", () => {
  test("Glue catalog + crawlers + ETL jobs → Athena queries → Firehose delivery", async () => {
    const glue = new GlueClient(clientConfig);
    const athena = new AthenaClient(clientConfig);
    const firehose = new FirehoseClient(clientConfig);
    const s3 = new S3Client(clientConfig);
    const kinesis = new KinesisClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });

    // S3 buckets for data lake
    await s3.send(new CreateBucketCommand({ Bucket: "xsvc-raw-data" }));
    await s3.send(new CreateBucketCommand({ Bucket: "xsvc-processed-data" }));
    await s3.send(new CreateBucketCommand({ Bucket: "xsvc-athena-results" }));

    // Upload raw data
    const csvData = "user_id,event,timestamp\n1,click,2024-01-01\n2,purchase,2024-01-01\n3,click,2024-01-02";
    await s3.send(new PutObjectCommand({
      Bucket: "xsvc-raw-data", Key: "events/2024/01/events.csv", Body: csvData,
    }));

    // Glue: create catalog database + table
    await glue.send(new CreateGlueDatabaseCommand({
      DatabaseInput: { Name: "xsvc_analytics", Description: "Analytics data lake" },
    }));
    await glue.send(new CreateGlueTableCommand({
      DatabaseName: "xsvc_analytics",
      TableInput: {
        Name: "events",
        StorageDescriptor: {
          Columns: [
            { Name: "user_id", Type: "int" },
            { Name: "event", Type: "string" },
            { Name: "timestamp", Type: "string" },
          ],
          Location: "s3://xsvc-raw-data/events/",
          InputFormat: "org.apache.hadoop.mapred.TextInputFormat",
          OutputFormat: "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
          SerdeInfo: { SerializationLibrary: "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe" },
        },
        PartitionKeys: [{ Name: "year", Type: "string" }, { Name: "month", Type: "string" }],
      },
    }));

    // Glue crawler
    await glue.send(new CreateCrawlerCommand({
      Name: "xsvc-event-crawler",
      Role: "arn:aws:iam::000000000000:role/GlueCrawlerRole",
      DatabaseName: "xsvc_analytics",
      Targets: { S3Targets: [{ Path: "s3://xsvc-raw-data/events/" }] },
    }));
    await glue.send(new StartCrawlerCommand({ Name: "xsvc-event-crawler" }));

    // Glue ETL job
    const job = await glue.send(new CreateJobCommand({
      Name: "xsvc-transform-events",
      Role: "arn:aws:iam::000000000000:role/GlueJobRole",
      Command: {
        Name: "glueetl",
        ScriptLocation: "s3://xsvc-scripts/transform.py",
        PythonVersion: "3",
      },
      DefaultArguments: {
        "--source_database": "xsvc_analytics",
        "--source_table": "events",
        "--output_path": "s3://xsvc-processed-data/",
      },
    }));
    const jobRun = await glue.send(new StartJobRunCommand({ JobName: "xsvc-transform-events" }));
    const runResult = await glue.send(new GetJobRunCommand({
      JobName: "xsvc-transform-events", RunId: jobRun.JobRunId!,
    }));
    expect(runResult.JobRun!.JobRunState).toBe("SUCCEEDED");

    // Glue trigger for scheduled runs
    await glue.send(new CreateTriggerCommand({
      Name: "xsvc-nightly-etl",
      Type: "SCHEDULED",
      Schedule: "cron(0 2 * * ? *)",
      Actions: [{ JobName: "xsvc-transform-events" }],
    }));

    // Athena: query the catalog
    const wg = await athena.send(new CreateWorkGroupCommand({
      Name: "xsvc-analytics-wg",
      Configuration: {
        ResultConfiguration: { OutputLocation: "s3://xsvc-athena-results/" },
      },
    }));

    const queryExec = await athena.send(new StartQueryExecutionCommand({
      QueryString: "SELECT event, COUNT(*) as cnt FROM xsvc_analytics.events GROUP BY event",
      WorkGroup: "xsvc-analytics-wg",
    }));
    const queryStatus = await athena.send(new GetQueryExecutionCommand({
      QueryExecutionId: queryExec.QueryExecutionId!,
    }));
    expect(queryStatus.QueryExecution!.Status!.State).toBe("SUCCEEDED");

    const queryResults = await athena.send(new GetQueryResultsCommand({
      QueryExecutionId: queryExec.QueryExecutionId!,
    }));
    expect(queryResults.ResultSet!.Rows!.length).toBeGreaterThan(0);

    // Named query for reuse
    await athena.send(new CreateNamedQueryCommand({
      Name: "daily-event-counts",
      Database: "xsvc_analytics",
      QueryString: "SELECT event, COUNT(*) FROM events WHERE timestamp = current_date GROUP BY event",
      WorkGroup: "xsvc-analytics-wg",
    }));

    // Firehose: real-time event delivery to S3
    await firehose.send(new CreateDeliveryStreamCommand({
      DeliveryStreamName: "xsvc-realtime-events",
      DeliveryStreamType: "DirectPut",
      S3DestinationConfiguration: {
        RoleARN: "arn:aws:iam::000000000000:role/FirehoseRole",
        BucketARN: "arn:aws:s3:::xsvc-raw-data",
        Prefix: "realtime/",
      },
    }));

    // Send batch of events through Firehose
    await firehose.send(new PutRecordBatchCommand({
      DeliveryStreamName: "xsvc-realtime-events",
      Records: [
        { Data: Buffer.from(JSON.stringify({ userId: 4, event: "signup", ts: Date.now() }) + "\n") },
        { Data: Buffer.from(JSON.stringify({ userId: 5, event: "purchase", ts: Date.now() }) + "\n") },
        { Data: Buffer.from(JSON.stringify({ userId: 6, event: "click", ts: Date.now() }) + "\n") },
      ],
    }));

    // Kinesis stream with consumers for real-time processing
    await kinesis.send(new CreateStreamCommand({ StreamName: "xsvc-clickstream", ShardCount: 2 }));
    const shards = await kinesis.send(new ListShardsCommand({ StreamName: "xsvc-clickstream" }));
    expect(shards.Shards!.length).toBe(2);

    // Register a consumer
    const consumer = await kinesis.send(new RegisterStreamConsumerCommand({
      StreamARN: `arn:aws:kinesis:us-east-1:000000000000:stream/xsvc-clickstream`,
      ConsumerName: "xsvc-analytics-consumer",
    }));
    expect(consumer.Consumer!.ConsumerStatus).toBe("ACTIVE");

    const consumers = await kinesis.send(new ListStreamConsumersCommand({
      StreamARN: `arn:aws:kinesis:us-east-1:000000000000:stream/xsvc-clickstream`,
    }));
    expect(consumers.Consumers!.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 7: Full observability stack
// CloudWatch Logs (metric filters, subscription filters) → Metrics → Alarms → Dashboard
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 7: Observability stack", () => {
  test("logs → metric filters → alarms → dashboard", async () => {
    const logs = new CloudWatchLogsClient(clientConfig);
    const cw = new CloudWatchClient(clientConfig);

    // Create log infrastructure
    await logs.send(new CreateLogGroupCommand({ logGroupName: "/xsvc/api" }));
    await logs.send(new CreateLogStreamCommand({ logGroupName: "/xsvc/api", logStreamName: "pod-1" }));
    await logs.send(new CreateLogStreamCommand({ logGroupName: "/xsvc/api", logStreamName: "pod-2" }));

    // Emit structured logs
    const now = Date.now();
    await logs.send(new PutLogEventsCommand({
      logGroupName: "/xsvc/api", logStreamName: "pod-1",
      logEvents: [
        { timestamp: now, message: JSON.stringify({ level: "INFO", msg: "Request started", path: "/api/users", latency: 45 }) },
        { timestamp: now + 100, message: JSON.stringify({ level: "ERROR", msg: "Database timeout", path: "/api/orders", latency: 5000 }) },
        { timestamp: now + 200, message: JSON.stringify({ level: "INFO", msg: "Request completed", path: "/api/users", latency: 52 }) },
        { timestamp: now + 300, message: JSON.stringify({ level: "ERROR", msg: "Connection refused", path: "/api/payments", latency: 3000 }) },
      ],
    }));

    // Metric filter: extract error count from logs
    await logs.send(new PutMetricFilterCommand({
      logGroupName: "/xsvc/api",
      filterName: "xsvc-error-count",
      filterPattern: "ERROR",
      metricTransformations: [{
        metricNamespace: "XSVC/API",
        metricName: "ErrorCount",
        metricValue: "1",
      }],
    }));

    // Subscription filter: forward errors to a Lambda (conceptual)
    await logs.send(new PutSubscriptionFilterCommand({
      logGroupName: "/xsvc/api",
      filterName: "xsvc-error-forwarder",
      filterPattern: "ERROR",
      destinationArn: "arn:aws:lambda:us-east-1:000000000000:function:error-handler",
    }));

    // Verify filters
    const metricFilters = await logs.send(new DescribeMetricFiltersCommand({ logGroupName: "/xsvc/api" }));
    expect(metricFilters.metricFilters!.length).toBe(1);
    expect(metricFilters.metricFilters![0].filterName).toBe("xsvc-error-count");

    // Search logs
    const errors = await logs.send(new FilterLogEventsCommand({
      logGroupName: "/xsvc/api", filterPattern: "ERROR",
    }));
    expect(errors.events!.length).toBe(2);

    // Push custom metrics
    await cw.send(new PutMetricDataCommand({
      Namespace: "XSVC/API",
      MetricData: [
        { MetricName: "RequestLatency", Value: 45, Unit: "Milliseconds", Timestamp: new Date() },
        { MetricName: "RequestLatency", Value: 5000, Unit: "Milliseconds", Timestamp: new Date() },
        { MetricName: "RequestLatency", Value: 52, Unit: "Milliseconds", Timestamp: new Date() },
        { MetricName: "ErrorCount", Value: 2, Unit: "Count", Timestamp: new Date() },
        { MetricName: "RequestCount", Value: 4, Unit: "Count", Timestamp: new Date() },
      ],
    }));

    // Create alarm on error rate
    await cw.send(new PutMetricAlarmCommand({
      AlarmName: "xsvc-high-error-rate",
      Namespace: "XSVC/API",
      MetricName: "ErrorCount",
      Statistic: "Sum",
      Period: 60,
      EvaluationPeriods: 1,
      Threshold: 5,
      ComparisonOperator: "GreaterThanThreshold",
      ActionsEnabled: true,
    }));

    // Manually trigger alarm
    await cw.send(new SetAlarmStateCommand({
      AlarmName: "xsvc-high-error-rate",
      StateValue: "ALARM",
      StateReason: "Error threshold exceeded in test",
    }));

    const alarms = await cw.send(new DescribeAlarmsCommand({ AlarmNames: ["xsvc-high-error-rate"] }));
    expect(alarms.MetricAlarms![0].StateValue).toBe("ALARM");

    // Create operations dashboard
    await cw.send(new PutDashboardCommand({
      DashboardName: "xsvc-ops",
      DashboardBody: JSON.stringify({
        widgets: [
          { type: "metric", properties: { metrics: [["XSVC/API", "RequestLatency"]], period: 60, stat: "p99", title: "P99 Latency" } },
          { type: "metric", properties: { metrics: [["XSVC/API", "ErrorCount"]], period: 60, stat: "Sum", title: "Errors" } },
          { type: "metric", properties: { metrics: [["XSVC/API", "RequestCount"]], period: 60, stat: "Sum", title: "Throughput" } },
        ],
      }),
    }));

    const dashboard = await cw.send(new GetDashboardCommand({ DashboardName: "xsvc-ops" }));
    const body = JSON.parse(dashboard.DashboardBody!);
    expect(body.widgets.length).toBe(3);

    // Query metrics
    const latencyData = await cw.send(new GetMetricDataCommand({
      StartTime: new Date(Date.now() - 3600000),
      EndTime: new Date(Date.now() + 3600000),
      MetricDataQueries: [{
        Id: "p99",
        MetricStat: {
          Metric: { Namespace: "XSVC/API", MetricName: "RequestLatency" },
          Period: 60, Stat: "Average",
        },
      }],
    }));
    expect(latencyData.MetricDataResults![0].Values!.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 8: AI/ML document processing pipeline
// S3 upload → Textract → Bedrock → DynamoDB → SES notification
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 8: AI document processing pipeline", () => {
  test("upload → OCR → AI analysis → store → notify", async () => {
    const s3 = new S3Client(clientConfig);
    const textract = new TextractClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    const bedrock = new BedrockRuntimeClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    const ddb = new DynamoDBClient(clientConfig);
    const ses = new SESv2Client(clientConfig);
    const ssm = new SSMClient(clientConfig);
    const sm = new SecretsManagerClient(clientConfig);

    // Config via SSM + Secrets Manager
    await ssm.send(new PutParameterCommand({
      Name: "/xsvc/docproc/output-bucket", Value: "xsvc-doc-results", Type: "String",
    }));
    await sm.send(new CreateSecretCommand({
      Name: "xsvc/docproc/api-key", SecretString: "sk-doc-processor-key",
    }));

    // SSM Document for the processing workflow
    await ssm.send(new CreateDocumentCommand({
      Name: "xsvc-doc-processor",
      Content: JSON.stringify({
        schemaVersion: "2.2",
        description: "Document processing automation",
        mainSteps: [{ action: "aws:executeScript", name: "processDoc", inputs: {} }],
      }),
      DocumentType: "Command",
      DocumentFormat: "JSON",
    }));

    // Upload document to S3
    await s3.send(new CreateBucketCommand({ Bucket: "xsvc-doc-inbox" }));
    await s3.send(new CreateBucketCommand({ Bucket: "xsvc-doc-results" }));
    await s3.send(new PutObjectCommand({
      Bucket: "xsvc-doc-inbox", Key: "invoices/inv-2024-001.pdf",
      Body: Buffer.from("fake-pdf-content"), ContentType: "application/pdf",
    }));

    // Textract: extract text from document
    const textractResult = await textract.send(new DetectDocumentTextCommand({
      Document: { S3Object: { Bucket: "xsvc-doc-inbox", Name: "invoices/inv-2024-001.pdf" } },
    }));
    expect(textractResult.Blocks!.length).toBeGreaterThan(0);
    const extractedText = textractResult.Blocks!
      .filter(b => b.BlockType === "LINE")
      .map(b => b.Text)
      .join("\n");

    // Bedrock: analyze the extracted text
    const aiResponse = await bedrock.send(new InvokeModelCommand({
      modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        messages: [{ role: "user", content: `Analyze this invoice text: ${extractedText}` }],
      }),
    }));
    const aiResult = JSON.parse(new TextDecoder().decode(aiResponse.body));
    expect(aiResult.content).toBeDefined();

    // Store results in DynamoDB
    await ddb.send(new CreateTableCommand({
      TableName: "xsvc-documents",
      KeySchema: [{ AttributeName: "docId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "docId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));

    await ddb.send(new PutItemCommand({
      TableName: "xsvc-documents",
      Item: {
        docId: { S: "inv-2024-001" },
        sourceKey: { S: "invoices/inv-2024-001.pdf" },
        status: { S: "processed" },
        textract: { M: {
          blockCount: { N: String(textractResult.Blocks!.length) },
          extractedText: { S: extractedText },
        }},
        aiAnalysis: { M: {
          model: { S: "claude-3-sonnet" },
          summary: { S: "Invoice analysis complete" },
        }},
        processedAt: { N: String(Date.now()) },
      },
    }));

    // Verify nested projection
    const doc = await ddb.send(new QueryCommand({
      TableName: "xsvc-documents",
      KeyConditionExpression: "docId = :id",
      ExpressionAttributeValues: { ":id": { S: "inv-2024-001" } },
      ProjectionExpression: "textract.blockCount, aiAnalysis.model, #s",
      ExpressionAttributeNames: { "#s": "status" },
    }));
    expect(doc.Items![0].status.S).toBe("processed");
    expect(doc.Items![0].textract.M!.blockCount.N).toBe(String(textractResult.Blocks!.length));
    expect(doc.Items![0].aiAnalysis.M!.model.S).toBe("claude-3-sonnet");

    // SES: send notification
    await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: "docs@xsvc-platform.com" }));
    await ses.send(new CreateEmailTemplateCommand({
      TemplateName: "doc-processed",
      TemplateContent: {
        Subject: "Document Processed: {{docId}}",
        Html: "<h1>Document {{docId}} has been processed</h1>",
        Text: "Document {{docId}} has been processed",
      },
    }));

    const template = await ses.send(new GetEmailTemplateCommand({ TemplateName: "doc-processed" }));
    expect(template.TemplateName).toBe("doc-processed");

    await ses.send(new SendEmailCommand({
      FromEmailAddress: "docs@xsvc-platform.com",
      Destination: { ToAddresses: ["user@example.com"] },
      Content: {
        Simple: {
          Subject: { Data: "Document inv-2024-001 processed" },
          Body: { Text: { Data: `Your document has been analyzed. ${textractResult.Blocks!.length} text blocks extracted.` } },
        },
      },
    }));

    // Secret rotation for the API key
    await sm.send(new PutSecretValueCommand({
      SecretId: "xsvc/docproc/api-key",
      SecretString: "sk-doc-processor-key-v2",
      VersionStages: ["AWSCURRENT"],
    }));
    const rotated = await sm.send(new GetSecretValueCommand({ SecretId: "xsvc/docproc/api-key" }));
    expect(rotated.SecretString).toBe("sk-doc-processor-key-v2");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 9: Multi-service deployment pipeline
// CloudFormation → AppConfig → Scheduler → Lambda versions/aliases → EFS
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 9: Deployment pipeline with config management", () => {
  test("CloudFormation stack → AppConfig deploy → Lambda alias flip → scheduled tasks", async () => {
    const cfn = new CloudFormationClient(clientConfig);
    const appconfig = new AppConfigClient(clientConfig);
    const scheduler = new SchedulerClient(clientConfig);
    const lambda = new LambdaClient(clientConfig);
    const efs = new EFSClient(clientConfig);
    const iam = new IAMClient(clientConfig);
    const ec2 = new EC2Client(clientConfig);

    // CloudFormation: deploy infrastructure
    const template = {
      AWSTemplateFormatVersion: "2010-09-09",
      Description: "XSVC deployment infrastructure",
      Parameters: {
        Environment: { Type: "String", Default: "staging" },
        InstanceType: { Type: "String", Default: "t3.medium" },
      },
      Resources: {
        AppFunction: { Type: "AWS::Lambda::Function", Properties: { Runtime: "nodejs20.x" } },
        ConfigTable: { Type: "AWS::DynamoDB::Table", Properties: { BillingMode: "PAY_PER_REQUEST" } },
        DataBucket: { Type: "AWS::S3::Bucket", Properties: {} },
      },
      Outputs: {
        FunctionArn: { Value: "arn:aws:lambda:us-east-1:000000000000:function:xsvc-app" },
        TableName: { Value: "xsvc-config" },
      },
    };

    const stack = await cfn.send(new CreateStackCommand({
      StackName: "xsvc-infra",
      TemplateBody: JSON.stringify(template),
      Parameters: [
        { ParameterKey: "Environment", ParameterValue: "production" },
        { ParameterKey: "InstanceType", ParameterValue: "m5.large" },
      ],
      Tags: [{ Key: "team", Value: "platform" }],
    }));
    expect(stack.StackId).toBeDefined();

    const stackDesc = await cfn.send(new DescribeStacksCommand({ StackName: "xsvc-infra" }));
    expect(stackDesc.Stacks![0].StackStatus).toBe("CREATE_COMPLETE");
    expect(stackDesc.Stacks![0].Outputs!.length).toBe(2);

    const tmpl = await cfn.send(new GetTemplateCommand({ StackName: "xsvc-infra" }));
    expect(tmpl.TemplateBody).toContain("XSVC deployment");

    // Change set for update
    const changeSet = await cfn.send(new CreateChangeSetCommand({
      StackName: "xsvc-infra",
      ChangeSetName: "add-monitoring",
      TemplateBody: JSON.stringify({
        ...template,
        Resources: {
          ...template.Resources,
          AlarmTopic: { Type: "AWS::SNS::Topic", Properties: { TopicName: "xsvc-alarms" } },
        },
      }),
    }));
    expect(changeSet.Id).toBeDefined();
    await cfn.send(new ExecuteChangeSetCommand({ ChangeSetName: "add-monitoring", StackName: "xsvc-infra" }));

    // AppConfig: feature flags
    const app = await appconfig.send(new CreateApplicationCommand({ Name: "xsvc-app" }));
    const env = await appconfig.send(new CreateEnvironmentCommand({
      ApplicationId: app.Id!, Name: "production",
    }));
    const profile = await appconfig.send(new CreateConfigurationProfileCommand({
      ApplicationId: app.Id!, Name: "feature-flags",
      LocationUri: "hosted",
    }));

    // Create config version
    const configContent = JSON.stringify({
      darkMode: { enabled: true, rolloutPercentage: 50 },
      newCheckout: { enabled: false },
      aiAssistant: { enabled: true, model: "claude-3-sonnet" },
    });
    await appconfig.send(new CreateHostedConfigurationVersionCommand({
      ApplicationId: app.Id!,
      ConfigurationProfileId: profile.Id!,
      Content: new TextEncoder().encode(configContent),
      ContentType: "application/json",
    }));

    // Deploy config
    const deployment = await appconfig.send(new StartDeploymentCommand({
      ApplicationId: app.Id!,
      EnvironmentId: env.Id!,
      ConfigurationProfileId: profile.Id!,
      ConfigurationVersion: "1",
      DeploymentStrategyId: "AppConfig.AllAtOnce",
    }));
    expect(deployment.State).toBe("COMPLETE");

    // Lambda: version and alias for blue/green
    const role = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc-deploy-lambda-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    const fn = await lambda.send(new CreateFunctionCommand({
      FunctionName: "xsvc-api-handler",
      Runtime: "nodejs20.x", Handler: "index.handler",
      Role: role.Role!.Arn!, Code: { ZipFile: Buffer.from("v1-code") },
      Environment: { Variables: { VERSION: "1.0.0" } },
    }));

    // Publish version 1
    const v1 = await lambda.send(new PublishVersionCommand({ FunctionName: "xsvc-api-handler" }));
    expect(v1.Version).toBe("1");

    // Create "live" alias pointing to v1
    const alias = await lambda.send(new CreateAliasCommand({
      FunctionName: "xsvc-api-handler",
      Name: "live", FunctionVersion: "1",
    }));
    expect(alias.AliasArn).toContain(":live");

    // Verify alias
    const liveAlias = await lambda.send(new GetAliasCommand({
      FunctionName: "xsvc-api-handler", Name: "live",
    }));
    expect(liveAlias.FunctionVersion).toBe("1");

    // Invoke via alias
    const invokeResult = await lambda.send(new InvokeCommand({
      FunctionName: "xsvc-api-handler", Qualifier: "live",
      Payload: Buffer.from(JSON.stringify({ path: "/health" })),
    }));
    expect(invokeResult.StatusCode).toBe(200);

    // EFS for shared storage
    const fs = await efs.send(new CreateFileSystemCommand({
      CreationToken: "xsvc-shared-fs",
      PerformanceMode: "generalPurpose",
      ThroughputMode: "bursting",
      Encrypted: true,
    }));
    expect(fs.FileSystemId).toMatch(/^fs-/);

    const filesystems = await efs.send(new DescribeFileSystemsCommand({}));
    expect(filesystems.FileSystems!.some(f => f.CreationToken === "xsvc-shared-fs")).toBe(true);

    // Access point for the Lambda function
    const ap = await efs.send(new CreateAccessPointCommand({
      FileSystemId: fs.FileSystemId!,
      PosixUser: { Uid: 1000, Gid: 1000 },
      RootDirectory: {
        Path: "/lambda-data",
        CreationInfo: { OwnerUid: 1000, OwnerGid: 1000, Permissions: "755" },
      },
    }));
    expect(ap.AccessPointId).toBeDefined();

    // Scheduler: maintenance tasks
    await scheduler.send(new CreateScheduleGroupCommand({ Name: "xsvc-maintenance" }));
    await scheduler.send(new CreateScheduleCommand({
      Name: "xsvc-nightly-cleanup",
      GroupName: "xsvc-maintenance",
      ScheduleExpression: "rate(1 day)",
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: {
        Arn: fn.FunctionArn!,
        RoleArn: role.Role!.Arn!,
        Input: JSON.stringify({ action: "cleanup", maxAge: 30 }),
      },
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 10: Full platform smoke — every service in one workflow
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 10: Full 38-service smoke test", () => {
  test("every service responds in a single workflow", async () => {
    const results: Record<string, boolean> = {};

    // 1. STS identity
    const sts = new STSClient(clientConfig);
    const id = await sts.send(new GetCallerIdentityCommand({}));
    results.sts = !!id.Account;

    // 2. IAM role + policy
    const iam = new IAMClient(clientConfig);
    const r = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc-smoke-role",
      AssumeRolePolicyDocument: JSON.stringify({ Version: "2012-10-17", Statement: [] }),
    }));
    results.iam = !!r.Role?.Arn;

    // 3. KMS key
    const kms = new KMSClient(clientConfig);
    const k = await kms.send(new CreateKeyCommand({ Description: "smoke" }));
    results.kms = !!k.KeyMetadata?.KeyId;

    // 4. S3
    const s3 = new S3Client(clientConfig);
    await s3.send(new CreateBucketCommand({ Bucket: "xsvc-smoke" }));
    await s3.send(new PutObjectCommand({ Bucket: "xsvc-smoke", Key: "t", Body: "ok" }));
    results.s3 = (await (await s3.send(new GetObjectCommand({ Bucket: "xsvc-smoke", Key: "t" }))).Body?.transformToString()) === "ok";

    // 5. DynamoDB
    const ddb = new DynamoDBClient(clientConfig);
    await ddb.send(new CreateTableCommand({
      TableName: "xsvc-smoke", KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }], BillingMode: "PAY_PER_REQUEST",
    }));
    await ddb.send(new PutItemCommand({ TableName: "xsvc-smoke", Item: { id: { S: "1" }, v: { S: "ok" } } }));
    results.dynamodb = (await ddb.send(new GetItemCommand({ TableName: "xsvc-smoke", Key: { id: { S: "1" } } }))).Item?.v?.S === "ok";

    // 6. SQS
    const sqs = new SQSClient(clientConfig);
    const q = await sqs.send(new CreateQueueCommand({ QueueName: "xsvc-smoke" }));
    await sqs.send(new SendMessageCommand({ QueueUrl: q.QueueUrl!, MessageBody: "ok" }));
    results.sqs = (await sqs.send(new ReceiveMessageCommand({ QueueUrl: q.QueueUrl!, MaxNumberOfMessages: 1 }))).Messages?.[0]?.Body === "ok";

    // 7. SNS
    const sns = new SNSClient(clientConfig);
    const t = await sns.send(new CreateTopicCommand({ Name: "xsvc-smoke" }));
    results.sns = !!(await sns.send(new PublishCommand({ TopicArn: t.TopicArn!, Message: "ok" }))).MessageId;

    // 8-38: remaining services (quick create + verify)
    const ssm = new SSMClient(clientConfig);
    await ssm.send(new PutParameterCommand({ Name: "/xsvc/smoke", Value: "ok", Type: "String" }));
    results.ssm = (await ssm.send(new GetParameterCommand({ Name: "/xsvc/smoke" }))).Parameter?.Value === "ok";

    const sm = new SecretsManagerClient(clientConfig);
    await sm.send(new CreateSecretCommand({ Name: "xsvc-smoke-secret", SecretString: "ok" }));
    results.secretsManager = (await sm.send(new GetSecretValueCommand({ SecretId: "xsvc-smoke-secret" }))).SecretString === "ok";

    const eb = new EventBridgeClient(clientConfig);
    results.eventbridge = (await eb.send(new PutEventsCommand({
      Entries: [{ Source: "xsvc", DetailType: "Smoke", Detail: "{}" }],
    }))).FailedEntryCount === 0;

    const kinesis = new KinesisClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    await kinesis.send(new CreateStreamCommand({ StreamName: "xsvc-smoke", ShardCount: 1 }));
    results.kinesis = (await kinesis.send(new DescribeStreamCommand({ StreamName: "xsvc-smoke" }))).StreamDescription!.StreamStatus === "ACTIVE";

    const logs = new CloudWatchLogsClient(clientConfig);
    await logs.send(new CreateLogGroupCommand({ logGroupName: "/xsvc/smoke" }));
    await logs.send(new CreateLogStreamCommand({ logGroupName: "/xsvc/smoke", logStreamName: "s" }));
    await logs.send(new PutLogEventsCommand({ logGroupName: "/xsvc/smoke", logStreamName: "s", logEvents: [{ timestamp: Date.now(), message: "ok" }] }));
    results.cloudwatchLogs = (await logs.send(new FilterLogEventsCommand({ logGroupName: "/xsvc/smoke", filterPattern: "ok" }))).events!.length > 0;

    const cw = new CloudWatchClient(clientConfig);
    await cw.send(new PutMetricDataCommand({ Namespace: "XSVC/Smoke", MetricData: [{ MetricName: "T", Value: 1, Unit: "Count", Timestamp: new Date() }] }));
    results.cloudwatchMetrics = (await cw.send(new GetMetricDataCommand({
      StartTime: new Date(Date.now() - 3600000), EndTime: new Date(Date.now() + 3600000),
      MetricDataQueries: [{ Id: "t", MetricStat: { Metric: { Namespace: "XSVC/Smoke", MetricName: "T" }, Period: 60, Stat: "Sum" } }],
    }))).MetricDataResults![0].Values!.length > 0;

    const lambda = new LambdaClient(clientConfig);
    await lambda.send(new CreateFunctionCommand({
      FunctionName: "xsvc-smoke-fn", Runtime: "nodejs20.x", Handler: "index.handler",
      Role: r.Role!.Arn!, Code: { ZipFile: Buffer.from("x") },
    }));
    results.lambda = (await lambda.send(new InvokeCommand({ FunctionName: "xsvc-smoke-fn", Payload: Buffer.from("{}") }))).StatusCode === 200;

    const sfn = new SFNClient(clientConfig);
    const sfnSm = await sfn.send(new CreateStateMachineCommand({
      name: "xsvc-smoke-sfn", roleArn: r.Role!.Arn!,
      definition: JSON.stringify({ StartAt: "D", States: { D: { Type: "Succeed" } } }),
    }));
    const sfnE = await sfn.send(new StartExecutionCommand({ stateMachineArn: sfnSm.stateMachineArn!, input: "{}" }));
    results.stepFunctions = (await sfn.send(new DescribeExecutionCommand({ executionArn: sfnE.executionArn! }))).status === "SUCCEEDED";

    const cognito = new CognitoIdentityProviderClient(clientConfig);
    results.cognito = !!(await cognito.send(new CreateUserPoolCommand({ PoolName: "xsvc-smoke" }))).UserPool?.Id;

    const ec2 = new EC2Client(clientConfig);
    results.ec2 = !!(await ec2.send(new CreateVpcCommand({ CidrBlock: "10.250.0.0/16" }))).Vpc?.VpcId;

    const elb = new ElasticLoadBalancingV2Client(clientConfig);
    const vpc = (await ec2.send(new CreateVpcCommand({ CidrBlock: "10.251.0.0/16" }))).Vpc!;
    const s1 = (await ec2.send(new CreateSubnetCommand({ VpcId: vpc.VpcId!, CidrBlock: "10.251.1.0/24" }))).Subnet!;
    const s2 = (await ec2.send(new CreateSubnetCommand({ VpcId: vpc.VpcId!, CidrBlock: "10.251.2.0/24" }))).Subnet!;
    results.elbv2 = !!(await elb.send(new CreateLoadBalancerCommand({ Name: "xsvc-smoke-alb", Subnets: [s1.SubnetId!, s2.SubnetId!], Type: "application" }))).LoadBalancers?.[0]?.LoadBalancerArn;

    const ecr = new ECRClient(clientConfig);
    results.ecr = !!(await ecr.send(new CreateRepositoryCommand({ repositoryName: "xsvc/smoke" }))).repository?.repositoryUri;

    const ecs = new ECSClient(clientConfig);
    results.ecs = !!(await ecs.send(new CreateClusterCommand({ clusterName: "xsvc-smoke" }))).cluster?.clusterArn;

    const r53 = new Route53Client(clientConfig);
    results.route53 = !!(await r53.send(new CreateHostedZoneCommand({ Name: "xsvc-smoke.test", CallerReference: `s-${Date.now()}` }))).HostedZone?.Id;

    const ses = new SESv2Client(clientConfig);
    await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: "smoke@xsvc.test" }));
    results.ses = !!(await ses.send(new SendEmailCommand({
      FromEmailAddress: "smoke@xsvc.test", Destination: { ToAddresses: ["x@x.test"] },
      Content: { Simple: { Subject: { Data: "s" }, Body: { Text: { Data: "ok" } } } },
    }))).MessageId;

    const acm = new ACMClient(clientConfig);
    results.acm = !!(await acm.send(new RequestCertificateCommand({ DomainName: "xsvc-smoke.test" }))).CertificateArn;

    const apigw = new ApiGatewayV2Client(clientConfig);
    results.apiGateway = !!(await apigw.send(new CreateApiCommand({ Name: "xsvc-smoke", ProtocolType: "HTTP" }))).ApiId;

    const cfn = new CloudFormationClient(clientConfig);
    results.cloudformation = !!(await cfn.send(new CreateStackCommand({
      StackName: "xsvc-smoke-stack",
      TemplateBody: JSON.stringify({ AWSTemplateFormatVersion: "2010-09-09", Resources: { B: { Type: "AWS::S3::Bucket" } } }),
    }))).StackId;

    const cf = new CloudFrontClient(clientConfig);
    results.cloudfront = !!(await cf.send(new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: `s-${Date.now()}`, Enabled: true, Comment: "smoke",
        Origins: { Quantity: 1, Items: [{ Id: "o", DomainName: "example.com", CustomOriginConfig: { HTTPPort: 80, HTTPSPort: 443, OriginProtocolPolicy: "http-only" } }] },
        DefaultCacheBehavior: { TargetOriginId: "o", ViewerProtocolPolicy: "allow-all", ForwardedValues: { QueryString: false, Cookies: { Forward: "none" } }, MinTTL: 0 },
      },
    }))).Distribution?.Id;

    const firehose = new FirehoseClient(clientConfig);
    await firehose.send(new CreateDeliveryStreamCommand({ DeliveryStreamName: "xsvc-smoke-fh", DeliveryStreamType: "DirectPut" }));
    results.firehose = !!(await firehose.send(new FirehosePutRecordCommand({ DeliveryStreamName: "xsvc-smoke-fh", Record: { Data: Buffer.from("ok") } }))).RecordId;

    const waf = new WAFV2Client(clientConfig);
    results.wafv2 = !!(await waf.send(new CreateWebACLCommand({
      Name: "xsvc-smoke-acl", Scope: "REGIONAL", DefaultAction: { Allow: {} }, Rules: [],
      VisibilityConfig: { SampledRequestsEnabled: false, CloudWatchMetricsEnabled: false, MetricName: "s" },
    }))).Summary?.Id;

    const appsync = new AppSyncClient(clientConfig);
    results.appsync = !!(await appsync.send(new CreateGraphqlApiCommand({ name: "xsvc-smoke", authenticationType: "API_KEY" }))).graphqlApi?.apiId;

    const athena = new AthenaClient(clientConfig);
    results.athena = !!(await athena.send(new StartQueryExecutionCommand({ QueryString: "SELECT 1", WorkGroup: "primary" }))).QueryExecutionId;

    const glue = new GlueClient(clientConfig);
    await glue.send(new CreateGlueDatabaseCommand({ DatabaseInput: { Name: "xsvc_smoke" } }));
    results.glue = true;

    const rds = new RDSClient(clientConfig);
    results.rds = !!(await rds.send(new CreateDBInstanceCommand({
      DBInstanceIdentifier: "xsvc-smoke-db", DBInstanceClass: "db.t3.micro", Engine: "postgres",
      MasterUsername: "admin", AllocatedStorage: 20,
    }))).DBInstance?.DBInstanceIdentifier;

    const scheduler = new SchedulerClient(clientConfig);
    results.scheduler = !!(await scheduler.send(new CreateScheduleCommand({
      Name: "xsvc-smoke-sched", ScheduleExpression: "rate(1 hour)", FlexibleTimeWindow: { Mode: "OFF" },
      Target: { Arn: r.Role!.Arn!, RoleArn: r.Role!.Arn! },
    }))).ScheduleArn;

    const appconfig = new AppConfigClient(clientConfig);
    results.appconfig = !!(await appconfig.send(new CreateApplicationCommand({ Name: "xsvc-smoke-app" }))).Id;

    const efs = new EFSClient(clientConfig);
    results.efs = !!(await efs.send(new CreateFileSystemCommand({ CreationToken: "xsvc-smoke-fs" }))).FileSystemId;

    const bedrock = new BedrockRuntimeClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    const br = await bedrock.send(new InvokeModelCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0", contentType: "application/json", accept: "application/json",
      body: JSON.stringify({ anthropic_version: "bedrock-2023-05-31", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }),
    }));
    results.bedrock = !!JSON.parse(new TextDecoder().decode(br.body)).content;

    const textract = new TextractClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    results.textract = (await textract.send(new DetectDocumentTextCommand({
      Document: { Bytes: Buffer.from("test") },
    }))).Blocks!.length > 0;

    const mc = new MediaConvertClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    const ep = await mc.send(new DescribeEndpointsCommand({ MaxResults: 1 }));
    results.mediaconvert = !!ep.Endpoints?.[0]?.Url;

    // Verify all services passed
    const failed = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
    expect(failed).toEqual([]);
    expect(Object.keys(results).length).toBeGreaterThanOrEqual(35);
  });
});
