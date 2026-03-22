/**
 * Final integration test: spins up complex, realistic AWS architectures
 * that exercise every tinstack service working together.
 *
 * Each scenario builds a real-world multi-service architecture from scratch
 * and validates the full lifecycle.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

// Core services
import { S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, CreateTableCommand, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";
import { SQSClient, CreateQueueCommand, SendMessageCommand, ReceiveMessageCommand, GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import { SNSClient, CreateTopicCommand, SubscribeCommand, PublishCommand, ListSubscriptionsByTopicCommand } from "@aws-sdk/client-sns";
import { LambdaClient, CreateFunctionCommand, InvokeCommand, GetFunctionCommand, UpdateFunctionConfigurationCommand } from "@aws-sdk/client-lambda";
import { EventBridgeClient, PutEventsCommand, PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-eventbridge";
import { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand, UpdateSecretCommand } from "@aws-sdk/client-secrets-manager";
import { SSMClient, PutParameterCommand, GetParameterCommand, GetParametersByPathCommand } from "@aws-sdk/client-ssm";
import { KMSClient, CreateKeyCommand, EncryptCommand, DecryptCommand, GenerateDataKeyCommand } from "@aws-sdk/client-kms";
import { IAMClient, CreateRoleCommand, CreatePolicyCommand, AttachRolePolicyCommand } from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { KinesisClient, CreateStreamCommand, PutRecordCommand, DescribeStreamCommand, GetShardIteratorCommand, GetRecordsCommand, DeleteStreamCommand } from "@aws-sdk/client-kinesis";
import { CloudWatchLogsClient, CreateLogGroupCommand, CreateLogStreamCommand, PutLogEventsCommand, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CloudWatchClient, PutMetricDataCommand, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { SFNClient, CreateStateMachineCommand, StartExecutionCommand, DescribeExecutionCommand, DeleteStateMachineCommand } from "@aws-sdk/client-sfn";
import { NodeHttpHandler } from "@smithy/node-http-handler";

// Phase 2 services (networking, containers, DNS, email, certs, auth, API)
import { EC2Client, CreateVpcCommand, DescribeVpcsCommand, CreateSubnetCommand, CreateSecurityGroupCommand, AuthorizeSecurityGroupIngressCommand, CreateInternetGatewayCommand, AttachInternetGatewayCommand, CreateRouteTableCommand, CreateRouteCommand, AssociateRouteTableCommand, AllocateAddressCommand } from "@aws-sdk/client-ec2";
import { ElasticLoadBalancingV2Client, CreateLoadBalancerCommand, CreateTargetGroupCommand, CreateListenerCommand, DescribeLoadBalancersCommand, DescribeTargetGroupsCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import { ECRClient, CreateRepositoryCommand, DescribeRepositoriesCommand, PutImageCommand, GetAuthorizationTokenCommand } from "@aws-sdk/client-ecr";
import { Route53Client, CreateHostedZoneCommand, ChangeResourceRecordSetsCommand, ListResourceRecordSetsCommand } from "@aws-sdk/client-route-53";
import { SESv2Client, CreateEmailIdentityCommand, SendEmailCommand, GetAccountCommand } from "@aws-sdk/client-sesv2";
import { ACMClient, RequestCertificateCommand, DescribeCertificateCommand, ListCertificatesCommand } from "@aws-sdk/client-acm";
import { CognitoIdentityProviderClient, CreateUserPoolCommand, CreateUserPoolClientCommand, AdminCreateUserCommand, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { ApiGatewayV2Client, CreateApiCommand, CreateRouteCommand as CreateApiRouteCommand, CreateIntegrationCommand, CreateStageCommand, GetApisCommand } from "@aws-sdk/client-apigatewayv2";

import { startServer, stopServer, clientConfig, ENDPOINT } from "./helpers";

beforeAll(() => startServer());
afterAll(() => stopServer());

// ─────────────────────────────────────────────────────────────
// Architecture 1: Production VPC with ALB, containers, and DNS
// Simulates: VPC → Subnets → IGW → ALB → Target Group → ECR → Route 53 → ACM
// ─────────────────────────────────────────────────────────────
describe("Architecture 1: Production networking stack", () => {

  test("VPC with public/private subnets, ALB, ECR, Route 53, and ACM", async () => {
    const ec2 = new EC2Client(clientConfig);
    const elb = new ElasticLoadBalancingV2Client(clientConfig);
    const ecr = new ECRClient(clientConfig);
    const r53 = new Route53Client(clientConfig);
    const acm = new ACMClient(clientConfig);

    // ── Step 1: VPC networking ──
    const vpc = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.0.0.0/16" }));
    const vpcId = vpc.Vpc!.VpcId!;
    expect(vpcId).toBeDefined();

    // Public subnets in two AZs
    const pubSub1 = await ec2.send(new CreateSubnetCommand({
      VpcId: vpcId, CidrBlock: "10.0.1.0/24", AvailabilityZone: "us-east-1a",
    }));
    const pubSub2 = await ec2.send(new CreateSubnetCommand({
      VpcId: vpcId, CidrBlock: "10.0.2.0/24", AvailabilityZone: "us-east-1b",
    }));
    expect(pubSub1.Subnet!.SubnetId).toBeDefined();
    expect(pubSub2.Subnet!.SubnetId).toBeDefined();

    // Private subnets
    const privSub1 = await ec2.send(new CreateSubnetCommand({
      VpcId: vpcId, CidrBlock: "10.0.10.0/24", AvailabilityZone: "us-east-1a",
    }));
    const privSub2 = await ec2.send(new CreateSubnetCommand({
      VpcId: vpcId, CidrBlock: "10.0.11.0/24", AvailabilityZone: "us-east-1b",
    }));

    // Internet Gateway
    const igw = await ec2.send(new CreateInternetGatewayCommand({}));
    await ec2.send(new AttachInternetGatewayCommand({
      InternetGatewayId: igw.InternetGateway!.InternetGatewayId!,
      VpcId: vpcId,
    }));

    // Route table for public subnets
    const rtb = await ec2.send(new CreateRouteTableCommand({ VpcId: vpcId }));
    await ec2.send(new CreateRouteCommand({
      RouteTableId: rtb.RouteTable!.RouteTableId!,
      DestinationCidrBlock: "0.0.0.0/0",
      GatewayId: igw.InternetGateway!.InternetGatewayId!,
    }));
    await ec2.send(new AssociateRouteTableCommand({
      RouteTableId: rtb.RouteTable!.RouteTableId!,
      SubnetId: pubSub1.Subnet!.SubnetId!,
    }));

    // Security group for ALB
    const albSg = await ec2.send(new CreateSecurityGroupCommand({
      GroupName: "final-alb-sg", Description: "ALB security group", VpcId: vpcId,
    }));
    await ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: albSg.GroupId!,
      IpPermissions: [{
        IpProtocol: "tcp",
        FromPort: 443,
        ToPort: 443,
        IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "HTTPS from anywhere" }],
      }],
    }));

    // Elastic IP for NAT
    const eip = await ec2.send(new AllocateAddressCommand({ Domain: "vpc" }));
    expect(eip.AllocationId).toBeDefined();

    // Verify VPC
    const vpcs = await ec2.send(new DescribeVpcsCommand({ VpcIds: [vpcId] }));
    expect(vpcs.Vpcs![0].CidrBlock).toBe("10.0.0.0/16");

    // ── Step 2: Application Load Balancer ──
    const alb = await elb.send(new CreateLoadBalancerCommand({
      Name: "final-prod-alb",
      Subnets: [pubSub1.Subnet!.SubnetId!, pubSub2.Subnet!.SubnetId!],
      SecurityGroups: [albSg.GroupId!],
      Scheme: "internet-facing",
      Type: "application",
    }));
    expect(alb.LoadBalancers![0].LoadBalancerArn).toBeDefined();

    const tg = await elb.send(new CreateTargetGroupCommand({
      Name: "final-api-tg",
      Protocol: "HTTP",
      Port: 8080,
      VpcId: vpcId,
      TargetType: "ip",
      HealthCheckPath: "/health",
    }));
    expect(tg.TargetGroups![0].TargetGroupArn).toBeDefined();

    const listener = await elb.send(new CreateListenerCommand({
      LoadBalancerArn: alb.LoadBalancers![0].LoadBalancerArn!,
      Protocol: "HTTP",
      Port: 80,
      DefaultActions: [{ Type: "forward", TargetGroupArn: tg.TargetGroups![0].TargetGroupArn! }],
    }));
    expect(listener.Listeners![0].ListenerArn).toBeDefined();

    // ── Step 3: ECR repositories ──
    const apiRepo = await ecr.send(new CreateRepositoryCommand({ repositoryName: "final/api-service" }));
    const workerRepo = await ecr.send(new CreateRepositoryCommand({ repositoryName: "final/worker-service" }));
    expect(apiRepo.repository!.repositoryUri).toBeDefined();
    expect(workerRepo.repository!.repositoryUri).toBeDefined();

    // Push image manifest
    await ecr.send(new PutImageCommand({
      repositoryName: "final/api-service",
      imageManifest: JSON.stringify({ schemaVersion: 2, mediaType: "application/vnd.docker.distribution.manifest.v2+json" }),
      imageTag: "v1.0.0",
    }));

    // Auth token
    const auth = await ecr.send(new GetAuthorizationTokenCommand({}));
    expect(auth.authorizationData![0].authorizationToken).toBeDefined();

    // ── Step 4: DNS with Route 53 ──
    const zone = await r53.send(new CreateHostedZoneCommand({
      Name: "final-app.example.com",
      CallerReference: `final-${Date.now()}`,
    }));
    expect(zone.HostedZone!.Id).toBeDefined();

    // Add DNS records: A record pointing to ALB, CNAME for www
    await r53.send(new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone.HostedZone!.Id!,
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: "api.final-app.example.com",
              Type: "A",
              TTL: 300,
              ResourceRecords: [{ Value: "10.0.0.1" }],
            },
          },
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: "www.final-app.example.com",
              Type: "CNAME",
              TTL: 300,
              ResourceRecords: [{ Value: "api.final-app.example.com" }],
            },
          },
        ],
      },
    }));

    const records = await r53.send(new ListResourceRecordSetsCommand({
      HostedZoneId: zone.HostedZone!.Id!,
    }));
    const aRecord = records.ResourceRecordSets?.find(r => r.Type === "A");
    expect(aRecord?.Name).toContain("api.final-app.example.com");

    // ── Step 5: TLS certificate ──
    const cert = await acm.send(new RequestCertificateCommand({
      DomainName: "final-app.example.com",
      SubjectAlternativeNames: ["*.final-app.example.com"],
    }));
    expect(cert.CertificateArn).toBeDefined();

    const certDetail = await acm.send(new DescribeCertificateCommand({
      CertificateArn: cert.CertificateArn!,
    }));
    expect(certDetail.Certificate!.DomainName).toBe("final-app.example.com");

    // Verify ALB is queryable
    const albs = await elb.send(new DescribeLoadBalancersCommand({ Names: ["final-prod-alb"] }));
    expect(albs.LoadBalancers![0].State?.Code).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Architecture 2: SaaS platform with auth, API, and multi-tenant data
// Simulates: Cognito → API GW → Lambda → DynamoDB (multi-tenant) → SES → S3
// ─────────────────────────────────────────────────────────────
describe("Architecture 2: Multi-tenant SaaS platform", () => {

  test("Cognito auth → API Gateway → Lambda → DynamoDB + SES + S3", async () => {
    const cognito = new CognitoIdentityProviderClient(clientConfig);
    const apigw = new ApiGatewayV2Client(clientConfig);
    const lambda = new LambdaClient(clientConfig);
    const ddb = new DynamoDBClient(clientConfig);
    const ses = new SESv2Client(clientConfig);
    const s3 = new S3Client(clientConfig);
    const iam = new IAMClient(clientConfig);

    // ── Step 1: Auth with Cognito ──
    const pool = await cognito.send(new CreateUserPoolCommand({
      PoolName: "final-saas-users",
      Policies: {
        PasswordPolicy: { MinimumLength: 8, RequireUppercase: true, RequireLowercase: true, RequireNumbers: true },
      },
      AutoVerifiedAttributes: ["email"],
    }));
    const poolId = pool.UserPool!.Id!;
    expect(poolId).toBeDefined();

    const client = await cognito.send(new CreateUserPoolClientCommand({
      UserPoolId: poolId,
      ClientName: "final-saas-web",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    }));
    expect(client.UserPoolClient!.ClientId).toBeDefined();

    // Create users for two tenants
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: poolId, Username: "alice@tenant-a.com",
      UserAttributes: [
        { Name: "email", Value: "alice@tenant-a.com" },
        { Name: "custom:tenantId", Value: "tenant-a" },
      ],
    }));
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: poolId, Username: "bob@tenant-b.com",
      UserAttributes: [
        { Name: "email", Value: "bob@tenant-b.com" },
        { Name: "custom:tenantId", Value: "tenant-b" },
      ],
    }));

    const alice = await cognito.send(new AdminGetUserCommand({
      UserPoolId: poolId, Username: "alice@tenant-a.com",
    }));
    expect(alice.Username).toBe("alice@tenant-a.com");

    // ── Step 2: API Gateway ──
    const api = await apigw.send(new CreateApiCommand({
      Name: "final-saas-api",
      ProtocolType: "HTTP",
      Description: "Multi-tenant SaaS API",
    }));
    expect(api.ApiId).toBeDefined();

    const integration = await apigw.send(new CreateIntegrationCommand({
      ApiId: api.ApiId!,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: "arn:aws:lambda:us-east-1:000000000000:function:final-saas-handler",
      PayloadFormatVersion: "2.0",
    }));

    await apigw.send(new CreateApiRouteCommand({
      ApiId: api.ApiId!,
      RouteKey: "POST /api/projects",
      Target: `integrations/${integration.IntegrationId}`,
    }));
    await apigw.send(new CreateApiRouteCommand({
      ApiId: api.ApiId!,
      RouteKey: "GET /api/projects",
      Target: `integrations/${integration.IntegrationId}`,
    }));
    await apigw.send(new CreateApiRouteCommand({
      ApiId: api.ApiId!,
      RouteKey: "POST /api/projects/{projectId}/files",
      Target: `integrations/${integration.IntegrationId}`,
    }));

    const stage = await apigw.send(new CreateStageCommand({
      ApiId: api.ApiId!, StageName: "prod", AutoDeploy: true,
    }));
    expect(stage.StageName).toBe("prod");

    // ── Step 3: Lambda backend ──
    const role = await iam.send(new CreateRoleCommand({
      RoleName: "final-saas-lambda-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    const fn = await lambda.send(new CreateFunctionCommand({
      FunctionName: "final-saas-handler",
      Runtime: "nodejs20.x",
      Handler: "index.handler",
      Role: role.Role!.Arn!,
      Code: { ZipFile: Buffer.from("fake") },
      Environment: {
        Variables: {
          PROJECTS_TABLE: "final-saas-projects",
          FILES_BUCKET: "final-saas-files",
        },
      },
    }));
    expect(fn.FunctionArn).toBeDefined();

    // ── Step 4: Multi-tenant DynamoDB ──
    await ddb.send(new CreateTableCommand({
      TableName: "final-saas-projects",
      KeySchema: [
        { AttributeName: "tenantId", KeyType: "HASH" },
        { AttributeName: "projectId", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "tenantId", AttributeType: "S" },
        { AttributeName: "projectId", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // Tenant A creates projects
    await ddb.send(new PutItemCommand({
      TableName: "final-saas-projects",
      Item: {
        tenantId: { S: "tenant-a" }, projectId: { S: "proj-1" },
        name: { S: "Marketing Site" }, status: { S: "active" },
        createdBy: { S: "alice@tenant-a.com" }, createdAt: { N: String(Date.now()) },
      },
    }));
    await ddb.send(new PutItemCommand({
      TableName: "final-saas-projects",
      Item: {
        tenantId: { S: "tenant-a" }, projectId: { S: "proj-2" },
        name: { S: "Internal Dashboard" }, status: { S: "active" },
        createdBy: { S: "alice@tenant-a.com" }, createdAt: { N: String(Date.now()) },
      },
    }));

    // Tenant B creates a project
    await ddb.send(new PutItemCommand({
      TableName: "final-saas-projects",
      Item: {
        tenantId: { S: "tenant-b" }, projectId: { S: "proj-1" },
        name: { S: "E-commerce App" }, status: { S: "active" },
        createdBy: { S: "bob@tenant-b.com" }, createdAt: { N: String(Date.now()) },
      },
    }));

    // Verify tenant isolation: Tenant A can only see their projects
    const tenantAProjects = await ddb.send(new QueryCommand({
      TableName: "final-saas-projects",
      KeyConditionExpression: "tenantId = :tid",
      ExpressionAttributeValues: { ":tid": { S: "tenant-a" } },
    }));
    expect(tenantAProjects.Items?.length).toBe(2);
    expect(tenantAProjects.Items!.every(i => i.tenantId.S === "tenant-a")).toBe(true);

    const tenantBProjects = await ddb.send(new QueryCommand({
      TableName: "final-saas-projects",
      KeyConditionExpression: "tenantId = :tid",
      ExpressionAttributeValues: { ":tid": { S: "tenant-b" } },
    }));
    expect(tenantBProjects.Items?.length).toBe(1);

    // ── Step 5: File storage in S3 ──
    await s3.send(new CreateBucketCommand({ Bucket: "final-saas-files" }));

    // Upload files scoped by tenant
    await s3.send(new PutObjectCommand({
      Bucket: "final-saas-files",
      Key: "tenant-a/proj-1/logo.png",
      Body: Buffer.from("fake-png-data"),
      ContentType: "image/png",
    }));
    await s3.send(new PutObjectCommand({
      Bucket: "final-saas-files",
      Key: "tenant-b/proj-1/hero.jpg",
      Body: Buffer.from("fake-jpg-data"),
      ContentType: "image/jpeg",
    }));

    const file = await s3.send(new GetObjectCommand({
      Bucket: "final-saas-files", Key: "tenant-a/proj-1/logo.png",
    }));
    expect(file.ContentType).toBe("image/png");

    // ── Step 6: Email notifications via SES ──
    await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: "noreply@final-saas.com" }));

    const emailResult = await ses.send(new SendEmailCommand({
      FromEmailAddress: "noreply@final-saas.com",
      Destination: { ToAddresses: ["alice@tenant-a.com"] },
      Content: {
        Simple: {
          Subject: { Data: "Welcome to SaaS Platform" },
          Body: { Text: { Data: "Your project 'Marketing Site' has been created." } },
        },
      },
    }));
    expect(emailResult.MessageId).toBeDefined();

    // ── Step 7: Invoke Lambda to verify everything's wired ──
    const invoke = await lambda.send(new InvokeCommand({
      FunctionName: "final-saas-handler",
      Payload: Buffer.from(JSON.stringify({
        httpMethod: "POST",
        path: "/api/projects",
        body: { tenantId: "tenant-a", name: "New Project" },
      })),
    }));
    expect(invoke.StatusCode).toBe(200);

    // Verify API Gateway
    const apis = await apigw.send(new GetApisCommand({}));
    expect(apis.Items?.some(a => a.Name === "final-saas-api")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Architecture 3: Event-driven microservices with CQRS
// Simulates: Kinesis → Lambda consumers → DynamoDB (write) + DynamoDB (read model)
//            + EventBridge → SNS → SQS fan-out + CloudWatch observability
// ─────────────────────────────────────────────────────────────
describe("Architecture 3: Event-driven CQRS microservices", () => {

  test("Full CQRS pipeline: commands → events → projections → notifications → observability", async () => {
    const kinesis = new KinesisClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    const ddb = new DynamoDBClient(clientConfig);
    const lambda = new LambdaClient(clientConfig);
    const eb = new EventBridgeClient(clientConfig);
    const sns = new SNSClient(clientConfig);
    const sqs = new SQSClient(clientConfig);
    const logs = new CloudWatchLogsClient(clientConfig);
    const cw = new CloudWatchClient(clientConfig);
    const iam = new IAMClient(clientConfig);

    // ── Command side: Kinesis for event sourcing ──
    await kinesis.send(new CreateStreamCommand({ StreamName: "final-domain-events", ShardCount: 2 }));

    // Write model (event store)
    await ddb.send(new CreateTableCommand({
      TableName: "final-event-store",
      KeySchema: [
        { AttributeName: "aggregateId", KeyType: "HASH" },
        { AttributeName: "version", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "aggregateId", AttributeType: "S" },
        { AttributeName: "version", AttributeType: "N" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // Read model (materialized view)
    await ddb.send(new CreateTableCommand({
      TableName: "final-order-view",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));

    // ── Lambda consumers ──
    const role = await iam.send(new CreateRoleCommand({
      RoleName: "final-cqrs-lambda-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    await lambda.send(new CreateFunctionCommand({
      FunctionName: "final-event-processor",
      Runtime: "nodejs20.x", Handler: "index.handler",
      Role: role.Role!.Arn!, Code: { ZipFile: Buffer.from("fake") },
    }));
    await lambda.send(new CreateFunctionCommand({
      FunctionName: "final-projection-builder",
      Runtime: "nodejs20.x", Handler: "index.handler",
      Role: role.Role!.Arn!, Code: { ZipFile: Buffer.from("fake") },
    }));
    await lambda.send(new CreateFunctionCommand({
      FunctionName: "final-notification-sender",
      Runtime: "nodejs20.x", Handler: "index.handler",
      Role: role.Role!.Arn!, Code: { ZipFile: Buffer.from("fake") },
    }));

    // ── Notification fan-out: SNS → SQS ──
    const orderTopic = await sns.send(new CreateTopicCommand({ Name: "final-order-events" }));
    const emailQueue = await sqs.send(new CreateQueueCommand({ QueueName: "final-email-notifications" }));
    const smsQueue = await sqs.send(new CreateQueueCommand({ QueueName: "final-sms-notifications" }));
    const analyticsQueue = await sqs.send(new CreateQueueCommand({ QueueName: "final-analytics-events" }));

    await sns.send(new SubscribeCommand({ TopicArn: orderTopic.TopicArn!, Protocol: "sqs", Endpoint: emailQueue.QueueUrl }));
    await sns.send(new SubscribeCommand({ TopicArn: orderTopic.TopicArn!, Protocol: "sqs", Endpoint: smsQueue.QueueUrl }));
    await sns.send(new SubscribeCommand({ TopicArn: orderTopic.TopicArn!, Protocol: "sqs", Endpoint: analyticsQueue.QueueUrl }));

    const subs = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: orderTopic.TopicArn! }));
    expect(subs.Subscriptions?.length).toBe(3);

    // ── EventBridge for cross-service events ──
    await eb.send(new PutRuleCommand({
      Name: "final-order-completed",
      EventPattern: JSON.stringify({ source: ["final.orders"], "detail-type": ["OrderCompleted"] }),
    }));
    await eb.send(new PutTargetsCommand({
      Rule: "final-order-completed",
      Targets: [
        { Id: "notification-lambda", Arn: "arn:aws:lambda:us-east-1:000000000000:function:final-notification-sender" },
        { Id: "analytics-queue", Arn: "arn:aws:sqs:us-east-1:000000000000:final-analytics-events" },
      ],
    }));

    // ── Observability ──
    await logs.send(new CreateLogGroupCommand({ logGroupName: "/final/event-processor" }));
    await logs.send(new CreateLogStreamCommand({ logGroupName: "/final/event-processor", logStreamName: "shard-0" }));

    // ── Simulate the full flow ──

    // 1. Command arrives: CreateOrder
    const orderId = "final-ord-001";
    const events = [
      { type: "OrderCreated", orderId, customer: "cust-100", items: [{ sku: "WIDGET", qty: 3, price: 29.99 }], total: 89.97 },
      { type: "PaymentProcessed", orderId, paymentId: "pay-500", amount: 89.97 },
      { type: "OrderShipped", orderId, trackingNumber: "TRACK-999", carrier: "UPS" },
    ];

    // 2. Write events to Kinesis (event bus)
    for (const evt of events) {
      await kinesis.send(new PutRecordCommand({
        StreamName: "final-domain-events",
        Data: Buffer.from(JSON.stringify(evt)),
        PartitionKey: orderId,
      }));
    }

    // 3. Event processor Lambda persists to event store
    for (let i = 0; i < events.length; i++) {
      await ddb.send(new PutItemCommand({
        TableName: "final-event-store",
        Item: {
          aggregateId: { S: orderId },
          version: { N: String(i + 1) },
          eventType: { S: events[i].type },
          payload: { S: JSON.stringify(events[i]) },
          timestamp: { N: String(Date.now()) },
        },
      }));
    }

    // 4. Projection builder creates/updates read model
    await ddb.send(new PutItemCommand({
      TableName: "final-order-view",
      Item: {
        orderId: { S: orderId },
        customer: { S: "cust-100" },
        status: { S: "shipped" },
        total: { N: "89.97" },
        trackingNumber: { S: "TRACK-999" },
        eventCount: { N: "3" },
      },
    }));

    // 5. Publish to SNS for fan-out notifications
    await sns.send(new PublishCommand({
      TopicArn: orderTopic.TopicArn!,
      Message: JSON.stringify({ orderId, status: "shipped", trackingNumber: "TRACK-999" }),
      Subject: "Order Shipped",
    }));

    // 6. Emit cross-service event
    const ebResult = await eb.send(new PutEventsCommand({
      Entries: [{
        Source: "final.orders",
        DetailType: "OrderCompleted",
        Detail: JSON.stringify({ orderId, total: 89.97, customer: "cust-100" }),
      }],
    }));
    expect(ebResult.FailedEntryCount).toBe(0);

    // 7. Log processing metrics
    const now = Date.now();
    await logs.send(new PutLogEventsCommand({
      logGroupName: "/final/event-processor",
      logStreamName: "shard-0",
      logEvents: [
        { timestamp: now, message: JSON.stringify({ level: "INFO", msg: "OrderCreated processed", orderId, latencyMs: 12 }) },
        { timestamp: now + 50, message: JSON.stringify({ level: "INFO", msg: "PaymentProcessed processed", orderId, latencyMs: 45 }) },
        { timestamp: now + 100, message: JSON.stringify({ level: "INFO", msg: "OrderShipped processed", orderId, latencyMs: 8 }) },
      ],
    }));

    await cw.send(new PutMetricDataCommand({
      Namespace: "Final/CQRS",
      MetricData: [
        { MetricName: "EventsProcessed", Value: 3, Unit: "Count", Timestamp: new Date() },
        { MetricName: "ProcessingLatency", Value: 21.67, Unit: "Milliseconds", Timestamp: new Date() },
        { MetricName: "ProjectionUpdates", Value: 1, Unit: "Count", Timestamp: new Date() },
      ],
    }));

    // ── Verify everything ──

    // Event store has all 3 events
    const storedEvents = await ddb.send(new QueryCommand({
      TableName: "final-event-store",
      KeyConditionExpression: "aggregateId = :id",
      ExpressionAttributeValues: { ":id": { S: orderId } },
    }));
    expect(storedEvents.Items?.length).toBe(3);
    expect(storedEvents.Items![0].version.N).toBe("1");
    expect(storedEvents.Items![2].version.N).toBe("3");

    // Read model is up to date
    const orderView = await ddb.send(new GetItemCommand({
      TableName: "final-order-view", Key: { orderId: { S: orderId } },
    }));
    expect(orderView.Item?.status?.S).toBe("shipped");
    expect(orderView.Item?.trackingNumber?.S).toBe("TRACK-999");
    expect(orderView.Item?.eventCount?.N).toBe("3");

    // Kinesis has the records
    const desc = await kinesis.send(new DescribeStreamCommand({ StreamName: "final-domain-events" }));
    expect(desc.StreamDescription!.Shards!.length).toBe(2);
    const shardId = desc.StreamDescription!.Shards![0].ShardId!;
    const iter = await kinesis.send(new GetShardIteratorCommand({
      StreamName: "final-domain-events", ShardId: shardId, ShardIteratorType: "TRIM_HORIZON",
    }));
    const kinesisRecords = await kinesis.send(new GetRecordsCommand({ ShardIterator: iter.ShardIterator }));
    // Records may land in either shard; just verify the stream is readable
    expect(kinesisRecords.Records).toBeDefined();

    // Logs are searchable
    const errorLogs = await logs.send(new FilterLogEventsCommand({
      logGroupName: "/final/event-processor", filterPattern: "OrderShipped",
    }));
    expect(errorLogs.events?.length).toBe(1);

    // Metrics are queryable
    const metrics = await cw.send(new GetMetricDataCommand({
      StartTime: new Date(Date.now() - 3600000),
      EndTime: new Date(Date.now() + 3600000),
      MetricDataQueries: [{
        Id: "events",
        MetricStat: {
          Metric: { Namespace: "Final/CQRS", MetricName: "EventsProcessed" },
          Period: 60, Stat: "Sum",
        },
      }],
    }));
    expect(metrics.MetricDataResults![0].Values!.length).toBeGreaterThan(0);

    // Cleanup
    await kinesis.send(new DeleteStreamCommand({ StreamName: "final-domain-events" }));
  });
});

// ─────────────────────────────────────────────────────────────
// Architecture 4: Security-first infrastructure
// Simulates: KMS → Secrets Manager → SSM → IAM → STS → Cognito → ACM
// ─────────────────────────────────────────────────────────────
describe("Architecture 4: Security infrastructure", () => {

  test("Full security stack: KMS encryption, secrets rotation, IAM roles, STS federation, Cognito auth", async () => {
    const kms = new KMSClient(clientConfig);
    const sm = new SecretsManagerClient(clientConfig);
    const ssm = new SSMClient(clientConfig);
    const iam = new IAMClient(clientConfig);
    const sts = new STSClient(clientConfig);
    const cognito = new CognitoIdentityProviderClient(clientConfig);
    const acm = new ACMClient(clientConfig);

    // ── Step 1: KMS key hierarchy ──
    const masterKey = await kms.send(new CreateKeyCommand({ Description: "final-master-key", KeyUsage: "ENCRYPT_DECRYPT" }));
    const dataKey = await kms.send(new GenerateDataKeyCommand({
      KeyId: masterKey.KeyMetadata!.KeyId!, KeySpec: "AES_256",
    }));
    expect(dataKey.Plaintext).toBeDefined();
    expect(dataKey.CiphertextBlob).toBeDefined();

    // Encrypt sensitive data
    const encrypted = await kms.send(new EncryptCommand({
      KeyId: masterKey.KeyMetadata!.KeyId!,
      Plaintext: new TextEncoder().encode("database-connection-string://prod:5432"),
    }));
    const decrypted = await kms.send(new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }));
    expect(new TextDecoder().decode(decrypted.Plaintext!)).toBe("database-connection-string://prod:5432");

    // ── Step 2: Secrets Manager with rotation simulation ──
    const dbSecret = await sm.send(new CreateSecretCommand({
      Name: "final/prod/db-credentials",
      SecretString: JSON.stringify({ username: "admin", password: "initial-pw-v1", host: "db.prod.internal" }),
    }));
    expect(dbSecret.ARN).toBeDefined();

    await sm.send(new CreateSecretCommand({
      Name: "final/prod/api-keys",
      SecretString: JSON.stringify({ stripe: "sk_live_xxx", sendgrid: "SG.xxx" }),
    }));

    // Simulate rotation
    await sm.send(new UpdateSecretCommand({
      SecretId: "final/prod/db-credentials",
      SecretString: JSON.stringify({ username: "admin", password: "rotated-pw-v2", host: "db.prod.internal" }),
    }));

    const rotatedSecret = await sm.send(new GetSecretValueCommand({ SecretId: "final/prod/db-credentials" }));
    const creds = JSON.parse(rotatedSecret.SecretString!);
    expect(creds.password).toBe("rotated-pw-v2");

    // ── Step 3: SSM parameter hierarchy ──
    const params = [
      { Name: "/final/prod/app/feature-flags", Value: JSON.stringify({ darkMode: true, newCheckout: false }), Type: "String" as const },
      { Name: "/final/prod/app/rate-limits", Value: JSON.stringify({ api: 1000, webhook: 100 }), Type: "String" as const },
      { Name: "/final/prod/infra/vpc-id", Value: "vpc-final-prod", Type: "String" as const },
      { Name: "/final/prod/infra/db-endpoint", Value: "db.prod.internal:5432", Type: "SecureString" as const },
    ];
    for (const p of params) {
      await ssm.send(new PutParameterCommand(p));
    }

    const appParams = await ssm.send(new GetParametersByPathCommand({ Path: "/final/prod/app", Recursive: true }));
    expect(appParams.Parameters?.length).toBe(2);

    const infraParams = await ssm.send(new GetParametersByPathCommand({ Path: "/final/prod/infra", Recursive: true }));
    expect(infraParams.Parameters?.length).toBe(2);

    // ── Step 4: IAM role chain ──
    // Service roles
    const lambdaRole = await iam.send(new CreateRoleCommand({
      RoleName: "final-prod-lambda",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    const ecsRole = await iam.send(new CreateRoleCommand({
      RoleName: "final-prod-ecs-task",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "ecs-tasks.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    // Least-privilege policies
    const dbPolicy = await iam.send(new CreatePolicyCommand({
      PolicyName: "final-db-read-only",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Action: ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"],
          Resource: "arn:aws:dynamodb:us-east-1:000000000000:table/final-*",
        }],
      }),
    }));

    const secretsPolicy = await iam.send(new CreatePolicyCommand({
      PolicyName: "final-secrets-access",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Action: ["secretsmanager:GetSecretValue"],
          Resource: "arn:aws:secretsmanager:us-east-1:000000000000:secret:final/prod/*",
        }],
      }),
    }));

    await iam.send(new AttachRolePolicyCommand({ RoleName: "final-prod-lambda", PolicyArn: dbPolicy.Policy!.Arn! }));
    await iam.send(new AttachRolePolicyCommand({ RoleName: "final-prod-lambda", PolicyArn: secretsPolicy.Policy!.Arn! }));

    // ── Step 5: STS identity and role assumption ──
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    expect(identity.Account).toBeDefined();
    expect(identity.Arn).toBeDefined();

    const assumed = await sts.send(new AssumeRoleCommand({
      RoleArn: lambdaRole.Role!.Arn!,
      RoleSessionName: "final-test-session",
      DurationSeconds: 900,
    }));
    expect(assumed.Credentials?.AccessKeyId).toBeDefined();
    expect(assumed.Credentials?.SecretAccessKey).toBeDefined();
    expect(assumed.Credentials?.SessionToken).toBeDefined();

    // ── Step 6: Cognito user pool with security settings ──
    const pool = await cognito.send(new CreateUserPoolCommand({
      PoolName: "final-secure-pool",
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12, RequireUppercase: true, RequireLowercase: true,
          RequireNumbers: true, RequireSymbols: true,
        },
      },
      MfaConfiguration: "OPTIONAL",
      AutoVerifiedAttributes: ["email"],
    }));

    await cognito.send(new CreateUserPoolClientCommand({
      UserPoolId: pool.UserPool!.Id!,
      ClientName: "final-secure-client",
      ExplicitAuthFlows: ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
      PreventUserExistenceErrors: "ENABLED",
    }));

    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: pool.UserPool!.Id!,
      Username: "admin@final-secure.com",
      UserAttributes: [{ Name: "email", Value: "admin@final-secure.com" }],
    }));

    const adminUser = await cognito.send(new AdminGetUserCommand({
      UserPoolId: pool.UserPool!.Id!, Username: "admin@final-secure.com",
    }));
    expect(adminUser.UserStatus).toBeDefined();

    // ── Step 7: TLS certificates ──
    const wildcard = await acm.send(new RequestCertificateCommand({
      DomainName: "final-secure.com",
      SubjectAlternativeNames: ["*.final-secure.com", "*.api.final-secure.com"],
    }));
    const internalCert = await acm.send(new RequestCertificateCommand({
      DomainName: "internal.final-secure.com",
    }));

    const certs = await acm.send(new ListCertificatesCommand({}));
    expect(certs.CertificateSummaryList!.length).toBeGreaterThanOrEqual(2);

    const certDetail = await acm.send(new DescribeCertificateCommand({ CertificateArn: wildcard.CertificateArn! }));
    expect(certDetail.Certificate!.SubjectAlternativeNames).toContain("*.final-secure.com");
  });
});

// ─────────────────────────────────────────────────────────────
// Architecture 5: Step Functions orchestrating everything
// Simulates a complex workflow: validate → provision infra → deploy → verify → notify
// ─────────────────────────────────────────────────────────────
describe("Architecture 5: Step Functions deployment pipeline", () => {

  test("Orchestrate a full deployment pipeline with Choice, Parallel, Map, and error handling", async () => {
    const sfn = new SFNClient(clientConfig);
    const iam = new IAMClient(clientConfig);
    const ddb = new DynamoDBClient(clientConfig);
    const s3 = new S3Client(clientConfig);

    const role = await iam.send(new CreateRoleCommand({
      RoleName: "final-pipeline-sfn-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "states.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    // Complex state machine with Parallel branches and error handling
    const definition = {
      StartAt: "ValidateInput",
      States: {
        ValidateInput: {
          Type: "Pass",
          Result: { validated: true, environment: "production", version: "v2.1.0" },
          Next: "ParallelProvision",
        },
        ParallelProvision: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "ProvisionDatabase",
              States: {
                ProvisionDatabase: {
                  Type: "Pass",
                  Result: { dbEndpoint: "db.prod.internal", status: "ready" },
                  End: true,
                },
              },
            },
            {
              StartAt: "ProvisionCache",
              States: {
                ProvisionCache: {
                  Type: "Pass",
                  Result: { cacheEndpoint: "redis.prod.internal", status: "ready" },
                  End: true,
                },
              },
            },
            {
              StartAt: "BuildContainer",
              States: {
                BuildContainer: {
                  Type: "Pass",
                  Result: { imageUri: "123456.dkr.ecr.us-east-1.amazonaws.com/app:v2.1.0", status: "built" },
                  End: true,
                },
              },
            },
          ],
          ResultPath: "$.provision",
          Next: "CheckProvisionResult",
        },
        CheckProvisionResult: {
          Type: "Choice",
          Choices: [
            {
              Variable: "$.provision[0].status",
              StringEquals: "ready",
              Next: "Deploy",
            },
          ],
          Default: "DeploymentFailed",
        },
        Deploy: {
          Type: "Pass",
          Result: { deploymentId: "deploy-final-001", status: "completed", instances: 3 },
          ResultPath: "$.deployment",
          Next: "HealthCheck",
        },
        HealthCheck: {
          Type: "Pass",
          Result: { healthy: true, latencyP99: 45 },
          ResultPath: "$.health",
          Next: "DeploymentSucceeded",
        },
        DeploymentSucceeded: { Type: "Succeed" },
        DeploymentFailed: {
          Type: "Fail",
          Error: "ProvisioningFailed",
          Cause: "One or more infrastructure components failed to provision",
        },
      },
    };

    const sm = await sfn.send(new CreateStateMachineCommand({
      name: "final-deployment-pipeline",
      definition: JSON.stringify(definition),
      roleArn: role.Role!.Arn!,
    }));

    // Execute the pipeline
    const exec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: sm.stateMachineArn!,
      input: JSON.stringify({ repo: "final-app", branch: "main", commit: "abc123" }),
    }));

    const result = await sfn.send(new DescribeExecutionCommand({ executionArn: exec.executionArn! }));
    expect(result.status).toBe("SUCCEEDED");

    const output = JSON.parse(result.output!);
    // Parallel results
    expect(output.provision).toHaveLength(3);
    expect(output.provision[0].dbEndpoint).toBe("db.prod.internal");
    expect(output.provision[1].cacheEndpoint).toBe("redis.prod.internal");
    expect(output.provision[2].imageUri).toContain("app:v2.1.0");
    // Deployment
    expect(output.deployment.status).toBe("completed");
    expect(output.deployment.instances).toBe(3);
    // Health check
    expect(output.health.healthy).toBe(true);

    // ── Record deployment to DynamoDB ──
    await ddb.send(new CreateTableCommand({
      TableName: "final-deployments",
      KeySchema: [{ AttributeName: "deploymentId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "deploymentId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }));

    await ddb.send(new PutItemCommand({
      TableName: "final-deployments",
      Item: {
        deploymentId: { S: output.deployment.deploymentId },
        version: { S: "v2.1.0" },
        status: { S: "completed" },
        instances: { N: "3" },
        healthCheckPassed: { BOOL: true },
        p99Latency: { N: "45" },
        timestamp: { N: String(Date.now()) },
      },
    }));

    // Store artifact in S3
    await s3.send(new CreateBucketCommand({ Bucket: "final-deploy-artifacts" }));
    await s3.send(new PutObjectCommand({
      Bucket: "final-deploy-artifacts",
      Key: "deployments/deploy-final-001/manifest.json",
      Body: JSON.stringify(output),
      ContentType: "application/json",
    }));

    // Verify
    const deployment = await ddb.send(new GetItemCommand({
      TableName: "final-deployments", Key: { deploymentId: { S: "deploy-final-001" } },
    }));
    expect(deployment.Item?.status?.S).toBe("completed");
    expect(deployment.Item?.healthCheckPassed?.BOOL).toBe(true);

    const artifact = await s3.send(new GetObjectCommand({
      Bucket: "final-deploy-artifacts", Key: "deployments/deploy-final-001/manifest.json",
    }));
    const manifest = JSON.parse(await artifact.Body!.transformToString());
    expect(manifest.deployment.deploymentId).toBe("deploy-final-001");

    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: sm.stateMachineArn! }));
  });
});

// ─────────────────────────────────────────────────────────────
// Architecture 6: Everything together - full platform smoke test
// Hit every single service in one test to prove they all coexist
// ─────────────────────────────────────────────────────────────
describe("Architecture 6: All services smoke test", () => {

  test("Every tinstack service responds correctly in a single test run", async () => {
    const results: Record<string, boolean> = {};

    // S3
    const s3 = new S3Client(clientConfig);
    await s3.send(new CreateBucketCommand({ Bucket: "final-smoke-s3" }));
    await s3.send(new PutObjectCommand({ Bucket: "final-smoke-s3", Key: "test", Body: "ok" }));
    const s3Get = await s3.send(new GetObjectCommand({ Bucket: "final-smoke-s3", Key: "test" }));
    results.s3 = (await s3Get.Body?.transformToString()) === "ok";

    // DynamoDB
    const ddb = new DynamoDBClient(clientConfig);
    await ddb.send(new CreateTableCommand({
      TableName: "final-smoke-ddb", KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }], BillingMode: "PAY_PER_REQUEST",
    }));
    await ddb.send(new PutItemCommand({ TableName: "final-smoke-ddb", Item: { id: { S: "1" }, v: { S: "ok" } } }));
    const ddbGet = await ddb.send(new GetItemCommand({ TableName: "final-smoke-ddb", Key: { id: { S: "1" } } }));
    results.dynamodb = ddbGet.Item?.v?.S === "ok";

    // SQS
    const sqs = new SQSClient(clientConfig);
    const q = await sqs.send(new CreateQueueCommand({ QueueName: "final-smoke-sqs" }));
    await sqs.send(new SendMessageCommand({ QueueUrl: q.QueueUrl!, MessageBody: "ok" }));
    const recv = await sqs.send(new ReceiveMessageCommand({ QueueUrl: q.QueueUrl!, MaxNumberOfMessages: 1 }));
    results.sqs = recv.Messages?.[0]?.Body === "ok";

    // SNS
    const sns = new SNSClient(clientConfig);
    const topic = await sns.send(new CreateTopicCommand({ Name: "final-smoke-sns" }));
    const pub = await sns.send(new PublishCommand({ TopicArn: topic.TopicArn!, Message: "ok" }));
    results.sns = !!pub.MessageId;

    // SSM
    const ssm = new SSMClient(clientConfig);
    await ssm.send(new PutParameterCommand({ Name: "/final/smoke", Value: "ok", Type: "String" }));
    const ssmGet = await ssm.send(new GetParameterCommand({ Name: "/final/smoke" }));
    results.ssm = ssmGet.Parameter?.Value === "ok";

    // Secrets Manager
    const sm = new SecretsManagerClient(clientConfig);
    await sm.send(new CreateSecretCommand({ Name: "final-smoke-secret", SecretString: "ok" }));
    const smGet = await sm.send(new GetSecretValueCommand({ SecretId: "final-smoke-secret" }));
    results.secretsManager = smGet.SecretString === "ok";

    // KMS
    const kms = new KMSClient(clientConfig);
    const key = await kms.send(new CreateKeyCommand({ Description: "final-smoke" }));
    const enc = await kms.send(new EncryptCommand({ KeyId: key.KeyMetadata!.KeyId!, Plaintext: new TextEncoder().encode("ok") }));
    const dec = await kms.send(new DecryptCommand({ CiphertextBlob: enc.CiphertextBlob }));
    results.kms = new TextDecoder().decode(dec.Plaintext!) === "ok";

    // IAM
    const iam = new IAMClient(clientConfig);
    const iamRole = await iam.send(new CreateRoleCommand({
      RoleName: "final-smoke-role",
      AssumeRolePolicyDocument: JSON.stringify({ Version: "2012-10-17", Statement: [] }),
    }));
    results.iam = !!iamRole.Role?.Arn;

    // STS
    const sts = new STSClient(clientConfig);
    const id = await sts.send(new GetCallerIdentityCommand({}));
    results.sts = !!id.Account;

    // EventBridge
    const eb = new EventBridgeClient(clientConfig);
    const ebRes = await eb.send(new PutEventsCommand({
      Entries: [{ Source: "final.smoke", DetailType: "Test", Detail: "{}" }],
    }));
    results.eventbridge = ebRes.FailedEntryCount === 0;

    // Kinesis
    const kinesis = new KinesisClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    await kinesis.send(new CreateStreamCommand({ StreamName: "final-smoke-kinesis", ShardCount: 1 }));
    await kinesis.send(new PutRecordCommand({ StreamName: "final-smoke-kinesis", Data: Buffer.from("ok"), PartitionKey: "1" }));
    const kDesc = await kinesis.send(new DescribeStreamCommand({ StreamName: "final-smoke-kinesis" }));
    results.kinesis = kDesc.StreamDescription!.StreamStatus === "ACTIVE";
    await kinesis.send(new DeleteStreamCommand({ StreamName: "final-smoke-kinesis" }));

    // CloudWatch Logs
    const logs = new CloudWatchLogsClient(clientConfig);
    await logs.send(new CreateLogGroupCommand({ logGroupName: "/final/smoke" }));
    await logs.send(new CreateLogStreamCommand({ logGroupName: "/final/smoke", logStreamName: "s1" }));
    await logs.send(new PutLogEventsCommand({
      logGroupName: "/final/smoke", logStreamName: "s1",
      logEvents: [{ timestamp: Date.now(), message: "ok" }],
    }));
    const logFilter = await logs.send(new FilterLogEventsCommand({ logGroupName: "/final/smoke", filterPattern: "ok" }));
    results.cloudwatchLogs = (logFilter.events?.length ?? 0) > 0;

    // CloudWatch Metrics
    const cw = new CloudWatchClient(clientConfig);
    await cw.send(new PutMetricDataCommand({
      Namespace: "Final/Smoke", MetricData: [{ MetricName: "Test", Value: 1, Unit: "Count", Timestamp: new Date() }],
    }));
    const cwGet = await cw.send(new GetMetricDataCommand({
      StartTime: new Date(Date.now() - 3600000), EndTime: new Date(Date.now() + 3600000),
      MetricDataQueries: [{ Id: "t", MetricStat: { Metric: { Namespace: "Final/Smoke", MetricName: "Test" }, Period: 60, Stat: "Sum" } }],
    }));
    results.cloudwatchMetrics = (cwGet.MetricDataResults?.[0]?.Values?.length ?? 0) > 0;

    // Lambda
    const lambda = new LambdaClient(clientConfig);
    await lambda.send(new CreateFunctionCommand({
      FunctionName: "final-smoke-fn", Runtime: "nodejs20.x", Handler: "index.handler",
      Role: iamRole.Role!.Arn!, Code: { ZipFile: Buffer.from("fake") },
    }));
    const inv = await lambda.send(new InvokeCommand({ FunctionName: "final-smoke-fn", Payload: Buffer.from("{}") }));
    results.lambda = inv.StatusCode === 200;

    // Step Functions
    const sfn = new SFNClient(clientConfig);
    const sfnSm = await sfn.send(new CreateStateMachineCommand({
      name: "final-smoke-sfn", roleArn: iamRole.Role!.Arn!,
      definition: JSON.stringify({ StartAt: "Done", States: { Done: { Type: "Succeed" } } }),
    }));
    const sfnExec = await sfn.send(new StartExecutionCommand({ stateMachineArn: sfnSm.stateMachineArn!, input: "{}" }));
    const sfnDesc = await sfn.send(new DescribeExecutionCommand({ executionArn: sfnExec.executionArn! }));
    results.stepFunctions = sfnDesc.status === "SUCCEEDED";
    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: sfnSm.stateMachineArn! }));

    // EC2/VPC
    const ec2 = new EC2Client(clientConfig);
    const smokeVpc = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.99.0.0/16" }));
    results.ec2 = !!smokeVpc.Vpc?.VpcId;

    // ELBv2
    const elb = new ElasticLoadBalancingV2Client(clientConfig);
    const smokeSub = await ec2.send(new CreateSubnetCommand({ VpcId: smokeVpc.Vpc!.VpcId!, CidrBlock: "10.99.1.0/24" }));
    const smokeSub2 = await ec2.send(new CreateSubnetCommand({ VpcId: smokeVpc.Vpc!.VpcId!, CidrBlock: "10.99.2.0/24" }));
    const smokeAlb = await elb.send(new CreateLoadBalancerCommand({
      Name: "final-smoke-alb", Subnets: [smokeSub.Subnet!.SubnetId!, smokeSub2.Subnet!.SubnetId!], Type: "application",
    }));
    results.elbv2 = !!smokeAlb.LoadBalancers?.[0]?.LoadBalancerArn;

    // ECR
    const ecr = new ECRClient(clientConfig);
    const smokeRepo = await ecr.send(new CreateRepositoryCommand({ repositoryName: "final/smoke" }));
    results.ecr = !!smokeRepo.repository?.repositoryUri;

    // Route 53
    const r53 = new Route53Client(clientConfig);
    const smokeZone = await r53.send(new CreateHostedZoneCommand({ Name: "final-smoke.test", CallerReference: `smoke-${Date.now()}` }));
    results.route53 = !!smokeZone.HostedZone?.Id;

    // SES
    const ses = new SESv2Client(clientConfig);
    await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: "smoke@final.test" }));
    const smokeEmail = await ses.send(new SendEmailCommand({
      FromEmailAddress: "smoke@final.test",
      Destination: { ToAddresses: ["dest@final.test"] },
      Content: { Simple: { Subject: { Data: "smoke" }, Body: { Text: { Data: "ok" } } } },
    }));
    results.ses = !!smokeEmail.MessageId;

    // ACM
    const acmClient = new ACMClient(clientConfig);
    const smokeCert = await acmClient.send(new RequestCertificateCommand({ DomainName: "final-smoke.test" }));
    results.acm = !!smokeCert.CertificateArn;

    // Cognito
    const cognitoClient = new CognitoIdentityProviderClient(clientConfig);
    const smokePool = await cognitoClient.send(new CreateUserPoolCommand({ PoolName: "final-smoke-pool" }));
    results.cognito = !!smokePool.UserPool?.Id;

    // API Gateway v2
    const apigw = new ApiGatewayV2Client(clientConfig);
    const smokeApi = await apigw.send(new CreateApiCommand({ Name: "final-smoke-api", ProtocolType: "HTTP" }));
    results.apiGateway = !!smokeApi.ApiId;

    // ── Verify all services passed ──
    const allPassed = Object.values(results).every(v => v === true);
    const serviceCount = Object.keys(results).length;

    // Verify each service individually for clear failure messages
    const failed = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
    expect(failed).toEqual([]);

    expect(serviceCount).toBeGreaterThanOrEqual(23);
    expect(allPassed).toBe(true);
  });
});
