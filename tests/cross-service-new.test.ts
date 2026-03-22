/**
 * Cross-service integration tests for the new services (97 services added).
 * Tests realistic multi-service architectures that exercise cross-service
 * interactions between the newly added services and existing core services.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

// Core services
import { S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, CreateTableCommand, PutItemCommand, GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { SQSClient, CreateQueueCommand, SendMessageCommand, ReceiveMessageCommand, GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import { IAMClient, CreateRoleCommand, CreatePolicyCommand, AttachRolePolicyCommand, CreateInstanceProfileCommand, AddRoleToInstanceProfileCommand } from "@aws-sdk/client-iam";
import { LambdaClient, CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CloudWatchLogsClient, CreateLogGroupCommand, CreateLogStreamCommand, PutLogEventsCommand, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { KMSClient, CreateKeyCommand, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SNSClient, CreateTopicCommand, PublishCommand, SubscribeCommand } from "@aws-sdk/client-sns";
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { SSMClient, PutParameterCommand, GetParameterCommand } from "@aws-sdk/client-ssm";

// New services
import { EKSClient, CreateClusterCommand, DescribeClusterCommand, CreateNodegroupCommand, ListNodegroupsCommand } from "@aws-sdk/client-eks";
import { ECSClient, CreateClusterCommand as CreateECSClusterCommand, RegisterTaskDefinitionCommand, CreateServiceCommand as CreateECSServiceCommand } from "@aws-sdk/client-ecs";
import { ECRClient, CreateRepositoryCommand, PutImageCommand } from "@aws-sdk/client-ecr";
import { ElasticLoadBalancingV2Client, CreateLoadBalancerCommand, CreateTargetGroupCommand, CreateListenerCommand, RegisterTargetsCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import { EC2Client, CreateVpcCommand, CreateSubnetCommand, CreateSecurityGroupCommand, RunInstancesCommand, DescribeInstancesCommand, CreateVolumeCommand, AttachVolumeCommand } from "@aws-sdk/client-ec2";
import { RDSClient, CreateDBSubnetGroupCommand, CreateDBInstanceCommand, CreateDBClusterCommand } from "@aws-sdk/client-rds";
import { ElastiCacheClient, CreateCacheSubnetGroupCommand, CreateCacheClusterCommand } from "@aws-sdk/client-elasticache";
import { RedshiftClient, CreateClusterCommand as CreateRedshiftClusterCommand, CreateClusterSubnetGroupCommand as CreateRedshiftSubnetGroupCommand } from "@aws-sdk/client-redshift";
import { BatchClient, CreateComputeEnvironmentCommand, CreateJobQueueCommand, RegisterJobDefinitionCommand, SubmitJobCommand, DescribeJobsCommand } from "@aws-sdk/client-batch";
import { OrganizationsClient, CreateOrganizationCommand, CreateAccountCommand, ListAccountsCommand, CreateOrganizationalUnitCommand, ListRootsCommand } from "@aws-sdk/client-organizations";
import { CloudTrailClient, CreateTrailCommand, StartLoggingCommand, GetTrailStatusCommand } from "@aws-sdk/client-cloudtrail";
import { ConfigServiceClient, PutConfigurationRecorderCommand, PutDeliveryChannelCommand, PutConfigRuleCommand, DescribeConfigRulesCommand } from "@aws-sdk/client-config-service";
import { CodeBuildClient, CreateProjectCommand, StartBuildCommand, BatchGetBuildsCommand } from "@aws-sdk/client-codebuild";
import { CodePipelineClient, CreatePipelineCommand, GetPipelineStateCommand, StartPipelineExecutionCommand } from "@aws-sdk/client-codepipeline";
import { CodeDeployClient, CreateApplicationCommand as CreateCDAppCommand, CreateDeploymentGroupCommand } from "@aws-sdk/client-codedeploy";
import { EMRClient, RunJobFlowCommand, ListClustersCommand as ListEMRClustersCommand, AddJobFlowStepsCommand } from "@aws-sdk/client-emr";
import { SageMakerClient, CreateTrainingJobCommand, DescribeTrainingJobCommand, CreateModelCommand as CreateSMModelCommand, CreateEndpointCommand as CreateSMEndpointCommand } from "@aws-sdk/client-sagemaker";
import { OpenSearchClient, CreateDomainCommand as CreateOSDomainCommand, DescribeDomainCommand as DescribeOSDomainCommand } from "@aws-sdk/client-opensearch";
import { GuardDutyClient, CreateDetectorCommand, CreateFilterCommand, ListFindingsCommand } from "@aws-sdk/client-guardduty";
import { BackupClient, CreateBackupVaultCommand, CreateBackupPlanCommand, StartBackupJobCommand, DescribeBackupJobCommand } from "@aws-sdk/client-backup";
import { IoTClient, CreateThingCommand, CreateThingGroupCommand, AddThingToThingGroupCommand, CreatePolicyCommand as CreateIoTPolicyCommand, AttachPolicyCommand, CreateTopicRuleCommand, DescribeEndpointCommand as DescribeIoTEndpointCommand } from "@aws-sdk/client-iot";
import { TransferClient, CreateServerCommand as CreateTransferServerCommand, CreateUserCommand as CreateTransferUserCommand } from "@aws-sdk/client-transfer";
import { ServiceDiscoveryClient, CreatePrivateDnsNamespaceCommand, CreateServiceCommand as CreateSDServiceCommand, RegisterInstanceCommand } from "@aws-sdk/client-servicediscovery";
import { ShieldClient, CreateProtectionCommand, CreateSubscriptionCommand } from "@aws-sdk/client-shield";
import { WAFV2Client, CreateWebACLCommand, CreateIPSetCommand, AssociateWebACLCommand } from "@aws-sdk/client-wafv2";
import { Route53Client, CreateHostedZoneCommand, ChangeResourceRecordSetsCommand } from "@aws-sdk/client-route-53";
import { ACMClient, RequestCertificateCommand } from "@aws-sdk/client-acm";
import { SESv2Client, CreateEmailIdentityCommand, SendEmailCommand, CreateEmailTemplateCommand } from "@aws-sdk/client-sesv2";
import { CloudFormationClient, CreateStackCommand, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { DatabaseMigrationServiceClient, CreateReplicationInstanceCommand, CreateEndpointCommand as CreateDMSEndpointCommand } from "@aws-sdk/client-database-migration-service";
import { GlueClient, CreateDatabaseCommand as CreateGlueDBCommand, CreateTableCommand as CreateGlueTableCommand, CreateCrawlerCommand, StartCrawlerCommand } from "@aws-sdk/client-glue";
import { AthenaClient, CreateWorkGroupCommand, StartQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";
import { ComprehendClient, DetectSentimentCommand, DetectEntitiesCommand } from "@aws-sdk/client-comprehend";
import { RekognitionClient, DetectLabelsCommand, CreateCollectionCommand } from "@aws-sdk/client-rekognition";
import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } from "@aws-sdk/client-transcribe";
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import { BedrockRuntimeClient, InvokeModelCommand as InvokeBedrockCommand } from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { SFNClient, CreateStateMachineCommand, StartExecutionCommand, DescribeExecutionCommand } from "@aws-sdk/client-sfn";
import { KinesisClient, CreateStreamCommand, PutRecordCommand as KinesisPutRecordCommand, DescribeStreamCommand as KinesisDescribeStreamCommand } from "@aws-sdk/client-kinesis";
import { FirehoseClient, CreateDeliveryStreamCommand, PutRecordBatchCommand } from "@aws-sdk/client-firehose";
import { FSxClient, CreateFileSystemCommand as CreateFSxFileSystemCommand } from "@aws-sdk/client-fsx";
import { EFSClient, CreateFileSystemCommand as CreateEFSFileSystemCommand, CreateMountTargetCommand } from "@aws-sdk/client-efs";
import { NetworkFirewallClient, CreateFirewallCommand, CreateFirewallPolicyCommand } from "@aws-sdk/client-network-firewall";
import { DirectConnectClient, CreateConnectionCommand as CreateDXConnectionCommand } from "@aws-sdk/client-direct-connect";
import { XRayClient, PutTraceSegmentsCommand } from "@aws-sdk/client-xray";

import { startServer, stopServer, clientConfig, ENDPOINT } from "./helpers";

beforeAll(() => startServer());
afterAll(() => stopServer());

// ─────────────────────────────────────────────────────────────────────
// Scenario 1: Kubernetes platform
// EKS → EC2 (VPC/Subnets) → ECR → ALB → Route 53 → WAF → CloudWatch
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 1: Kubernetes platform (EKS + ECR + ALB + monitoring)", () => {
  test("full EKS platform deployment", async () => {
    const eks = new EKSClient(clientConfig);
    const ec2 = new EC2Client(clientConfig);
    const ecr = new ECRClient(clientConfig);
    const elb = new ElasticLoadBalancingV2Client(clientConfig);
    const iam = new IAMClient(clientConfig);
    const logs = new CloudWatchLogsClient(clientConfig);
    const waf = new WAFV2Client(clientConfig);
    const r53 = new Route53Client(clientConfig);

    // VPC infrastructure
    const vpc = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.50.0.0/16" }));
    const sub1 = await ec2.send(new CreateSubnetCommand({ VpcId: vpc.Vpc!.VpcId!, CidrBlock: "10.50.1.0/24", AvailabilityZone: "us-east-1a" }));
    const sub2 = await ec2.send(new CreateSubnetCommand({ VpcId: vpc.Vpc!.VpcId!, CidrBlock: "10.50.2.0/24", AvailabilityZone: "us-east-1b" }));
    const sg = await ec2.send(new CreateSecurityGroupCommand({ GroupName: "k8s-cluster-sg", Description: "EKS cluster SG", VpcId: vpc.Vpc!.VpcId! }));

    // IAM role for EKS
    const clusterRole = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc2-eks-cluster-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "eks.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));
    const nodeRole = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc2-eks-node-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    // EKS cluster
    const cluster = await eks.send(new CreateClusterCommand({
      name: "xsvc2-prod-cluster",
      roleArn: clusterRole.Role!.Arn!,
      resourcesVpcConfig: {
        subnetIds: [sub1.Subnet!.SubnetId!, sub2.Subnet!.SubnetId!],
        securityGroupIds: [sg.GroupId!],
      },
      version: "1.29",
    }));
    expect(cluster.cluster!.name).toBe("xsvc2-prod-cluster");
    expect(cluster.cluster!.status).toBe("ACTIVE");

    // Add nodegroup
    const nodegroup = await eks.send(new CreateNodegroupCommand({
      clusterName: "xsvc2-prod-cluster",
      nodegroupName: "xsvc2-workers",
      nodeRole: nodeRole.Role!.Arn!,
      subnets: [sub1.Subnet!.SubnetId!, sub2.Subnet!.SubnetId!],
      scalingConfig: { minSize: 2, maxSize: 10, desiredSize: 3 },
      instanceTypes: ["m5.large"],
    }));
    expect(nodegroup.nodegroup!.status).toBe("ACTIVE");

    // ECR repositories for microservices
    await ecr.send(new CreateRepositoryCommand({ repositoryName: "xsvc2/frontend" }));
    await ecr.send(new CreateRepositoryCommand({ repositoryName: "xsvc2/backend" }));
    await ecr.send(new PutImageCommand({
      repositoryName: "xsvc2/backend",
      imageManifest: JSON.stringify({ schemaVersion: 2 }),
      imageTag: "v2.0.0",
    }));

    // ALB for ingress
    const alb = await elb.send(new CreateLoadBalancerCommand({
      Name: "xsvc2-k8s-ingress", Type: "application",
      Subnets: [sub1.Subnet!.SubnetId!, sub2.Subnet!.SubnetId!],
    }));
    const tg = await elb.send(new CreateTargetGroupCommand({
      Name: "xsvc2-k8s-tg", Protocol: "HTTP", Port: 80,
      VpcId: vpc.Vpc!.VpcId!, TargetType: "ip", HealthCheckPath: "/healthz",
    }));
    await elb.send(new CreateListenerCommand({
      LoadBalancerArn: alb.LoadBalancers![0].LoadBalancerArn!,
      Protocol: "HTTP", Port: 80,
      DefaultActions: [{ Type: "forward", TargetGroupArn: tg.TargetGroups![0].TargetGroupArn! }],
    }));
    await elb.send(new RegisterTargetsCommand({
      TargetGroupArn: tg.TargetGroups![0].TargetGroupArn!,
      Targets: [{ Id: "10.50.1.10", Port: 8080 }, { Id: "10.50.1.11", Port: 8080 }],
    }));

    // WAF for ALB
    const webAcl = await waf.send(new CreateWebACLCommand({
      Name: "xsvc2-k8s-waf", Scope: "REGIONAL",
      DefaultAction: { Allow: {} }, Rules: [],
      VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: "k8s-waf" },
    }));
    await waf.send(new AssociateWebACLCommand({
      WebACLArn: webAcl.Summary!.ARN!,
      ResourceArn: alb.LoadBalancers![0].LoadBalancerArn!,
    }));

    // DNS
    const zone = await r53.send(new CreateHostedZoneCommand({ Name: "k8s.xsvc2.com", CallerReference: `k8s-${Date.now()}` }));
    await r53.send(new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone.HostedZone!.Id!,
      ChangeBatch: { Changes: [{ Action: "CREATE", ResourceRecordSet: { Name: "api.k8s.xsvc2.com", Type: "A", TTL: 60, ResourceRecords: [{ Value: "10.50.1.1" }] } }] },
    }));

    // Logging
    await logs.send(new CreateLogGroupCommand({ logGroupName: "/eks/xsvc2-prod-cluster" }));
    await logs.send(new CreateLogStreamCommand({ logGroupName: "/eks/xsvc2-prod-cluster", logStreamName: "kube-apiserver" }));
    await logs.send(new PutLogEventsCommand({
      logGroupName: "/eks/xsvc2-prod-cluster", logStreamName: "kube-apiserver",
      logEvents: [{ timestamp: Date.now(), message: JSON.stringify({ level: "info", msg: "Cluster ready", nodes: 3 }) }],
    }));

    // Verify everything is connected
    const clusterDesc = await eks.send(new DescribeClusterCommand({ name: "xsvc2-prod-cluster" }));
    expect(clusterDesc.cluster!.status).toBe("ACTIVE");
    const nodegroups = await eks.send(new ListNodegroupsCommand({ clusterName: "xsvc2-prod-cluster" }));
    expect(nodegroups.nodegroups!.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 2: CI/CD pipeline
// CodeBuild → CodeDeploy → CodePipeline → CloudTrail → Config → SNS
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 2: CI/CD pipeline with compliance", () => {
  test("build → deploy → audit → compliance", async () => {
    const codebuild = new CodeBuildClient(clientConfig);
    const codedeploy = new CodeDeployClient(clientConfig);
    const codepipeline = new CodePipelineClient(clientConfig);
    const cloudtrail = new CloudTrailClient(clientConfig);
    const config = new ConfigServiceClient(clientConfig);
    const sns = new SNSClient(clientConfig);
    const s3 = new S3Client(clientConfig);
    const iam = new IAMClient(clientConfig);

    // S3 bucket for artifacts
    await s3.send(new CreateBucketCommand({ Bucket: "xsvc2-cicd-artifacts" }));
    await s3.send(new CreateBucketCommand({ Bucket: "xsvc2-cloudtrail-logs" }));

    // SNS topic for notifications
    const topic = await sns.send(new CreateTopicCommand({ Name: "xsvc2-cicd-notifications" }));

    // IAM role
    const role = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc2-cicd-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "codebuild.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    // CodeBuild project
    const project = await codebuild.send(new CreateProjectCommand({
      name: "xsvc2-build",
      source: { type: "GITHUB", location: "https://github.com/example/app.git" },
      artifacts: { type: "S3", location: "xsvc2-cicd-artifacts" },
      environment: {
        type: "LINUX_CONTAINER", computeType: "BUILD_GENERAL1_SMALL",
        image: "aws/codebuild/standard:7.0",
      },
      serviceRole: role.Role!.Arn!,
    }));
    expect(project.project!.name).toBe("xsvc2-build");

    // Start a build
    const build = await codebuild.send(new StartBuildCommand({ projectName: "xsvc2-build" }));
    expect(build.build!.buildStatus).toBeDefined();

    // CodeDeploy application and deployment group
    const cdApp = await codedeploy.send(new CreateCDAppCommand({ applicationName: "xsvc2-app" }));
    expect(cdApp.applicationId).toBeDefined();
    await codedeploy.send(new CreateDeploymentGroupCommand({
      applicationName: "xsvc2-app",
      deploymentGroupName: "xsvc2-prod",
      serviceRoleArn: role.Role!.Arn!,
    }));

    // CodePipeline
    const pipeline = await codepipeline.send(new CreatePipelineCommand({
      pipeline: {
        name: "xsvc2-pipeline",
        roleArn: role.Role!.Arn!,
        artifactStore: { type: "S3", location: "xsvc2-cicd-artifacts" },
        stages: [
          { name: "Source", actions: [{ name: "Source", actionTypeId: { category: "Source", owner: "AWS", provider: "S3", version: "1" }, outputArtifacts: [{ name: "source" }], configuration: { S3Bucket: "xsvc2-cicd-artifacts", S3ObjectKey: "source.zip" } }] },
          { name: "Build", actions: [{ name: "Build", actionTypeId: { category: "Build", owner: "AWS", provider: "CodeBuild", version: "1" }, inputArtifacts: [{ name: "source" }], outputArtifacts: [{ name: "built" }], configuration: { ProjectName: "xsvc2-build" } }] },
        ],
      },
    }));
    expect(pipeline.pipeline!.name).toBe("xsvc2-pipeline");

    // Start pipeline
    const exec = await codepipeline.send(new StartPipelineExecutionCommand({ name: "xsvc2-pipeline" }));
    expect(exec.pipelineExecutionId).toBeDefined();

    // CloudTrail for audit
    const trail = await cloudtrail.send(new CreateTrailCommand({
      Name: "xsvc2-audit-trail",
      S3BucketName: "xsvc2-cloudtrail-logs",
    }));
    expect(trail.TrailARN).toBeDefined();
    await cloudtrail.send(new StartLoggingCommand({ Name: "xsvc2-audit-trail" }));
    const trailStatus = await cloudtrail.send(new GetTrailStatusCommand({ Name: "xsvc2-audit-trail" }));
    expect(trailStatus.IsLogging).toBe(true);

    // AWS Config for compliance
    await config.send(new PutConfigurationRecorderCommand({
      ConfigurationRecorder: {
        name: "xsvc2-recorder",
        roleARN: role.Role!.Arn!,
        recordingGroup: { allSupported: true },
      },
    }));
    await config.send(new PutDeliveryChannelCommand({
      DeliveryChannel: { name: "xsvc2-channel", s3BucketName: "xsvc2-cloudtrail-logs" },
    }));
    await config.send(new PutConfigRuleCommand({
      ConfigRule: {
        ConfigRuleName: "xsvc2-s3-encryption",
        Source: { Owner: "AWS", SourceIdentifier: "S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED" },
      },
    }));
    const rules = await config.send(new DescribeConfigRulesCommand({ ConfigRuleNames: ["xsvc2-s3-encryption"] }));
    expect(rules.ConfigRules!.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 3: Data lakehouse
// Glue → Athena → Redshift → EMR → S3 → OpenSearch → Firehose
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 3: Data lakehouse architecture", () => {
  test("ETL → query → warehouse → search → streaming", async () => {
    const glue = new GlueClient(clientConfig);
    const athena = new AthenaClient(clientConfig);
    const redshift = new RedshiftClient(clientConfig);
    const emr = new EMRClient(clientConfig);
    const s3 = new S3Client(clientConfig);
    const opensearch = new OpenSearchClient(clientConfig);
    const firehose = new FirehoseClient(clientConfig);
    const kinesis = new KinesisClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    const ec2 = new EC2Client(clientConfig);

    // Data lake buckets
    await s3.send(new CreateBucketCommand({ Bucket: "xsvc2-raw-zone" }));
    await s3.send(new CreateBucketCommand({ Bucket: "xsvc2-curated-zone" }));
    await s3.send(new PutObjectCommand({
      Bucket: "xsvc2-raw-zone", Key: "events/2024/data.parquet",
      Body: Buffer.from("mock-parquet-data"),
    }));

    // Glue catalog
    await glue.send(new CreateGlueDBCommand({ DatabaseInput: { Name: "xsvc2_lakehouse" } }));
    await glue.send(new CreateGlueTableCommand({
      DatabaseName: "xsvc2_lakehouse",
      TableInput: {
        Name: "raw_events",
        StorageDescriptor: {
          Columns: [{ Name: "event_id", Type: "string" }, { Name: "user_id", Type: "int" }, { Name: "event_type", Type: "string" }],
          Location: "s3://xsvc2-raw-zone/events/",
          InputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
          OutputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
          SerdeInfo: { SerializationLibrary: "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe" },
        },
      },
    }));

    // Glue crawler
    await glue.send(new CreateCrawlerCommand({
      Name: "xsvc2-event-crawler",
      Role: "arn:aws:iam::000000000000:role/GlueCrawler",
      DatabaseName: "xsvc2_lakehouse",
      Targets: { S3Targets: [{ Path: "s3://xsvc2-raw-zone/events/" }] },
    }));
    await glue.send(new StartCrawlerCommand({ Name: "xsvc2-event-crawler" }));

    // Athena queries
    await athena.send(new CreateWorkGroupCommand({
      Name: "xsvc2-analytics",
      Configuration: { ResultConfiguration: { OutputLocation: "s3://xsvc2-curated-zone/athena-results/" } },
    }));
    const query = await athena.send(new StartQueryExecutionCommand({
      QueryString: "SELECT event_type, COUNT(*) as cnt FROM xsvc2_lakehouse.raw_events GROUP BY event_type",
      WorkGroup: "xsvc2-analytics",
    }));
    const results = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: query.QueryExecutionId! }));
    expect(results.ResultSet!.Rows!.length).toBeGreaterThan(0);

    // Redshift warehouse
    const vpc = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.60.0.0/16" }));
    const sub = await ec2.send(new CreateSubnetCommand({ VpcId: vpc.Vpc!.VpcId!, CidrBlock: "10.60.1.0/24" }));
    await redshift.send(new CreateRedshiftSubnetGroupCommand({
      ClusterSubnetGroupName: "xsvc2-redshift-subnets",
      Description: "Redshift subnet group",
      SubnetIds: [sub.Subnet!.SubnetId!],
    }));
    const rsCluster = await redshift.send(new CreateRedshiftClusterCommand({
      ClusterIdentifier: "xsvc2-warehouse",
      NodeType: "ra3.xlplus", MasterUsername: "admin", MasterUserPassword: "Str0ng!Pass2024",
      ClusterType: "single-node",
      ClusterSubnetGroupName: "xsvc2-redshift-subnets",
    }));
    expect(rsCluster.Cluster!.ClusterStatus).toBe("available");

    // EMR for Spark processing
    const emrCluster = await emr.send(new RunJobFlowCommand({
      Name: "xsvc2-spark-etl",
      ReleaseLabel: "emr-7.0.0",
      Instances: {
        MasterInstanceType: "m5.xlarge",
        SlaveInstanceType: "m5.xlarge",
        InstanceCount: 3,
        KeepJobFlowAliveWhenNoSteps: true,
      },
      JobFlowRole: "EMR_EC2_DefaultRole",
      ServiceRole: "EMR_DefaultRole",
    }));
    expect(emrCluster.JobFlowId).toBeDefined();

    // Add Spark step
    await emr.send(new AddJobFlowStepsCommand({
      JobFlowId: emrCluster.JobFlowId!,
      Steps: [{
        Name: "xsvc2-transform",
        ActionOnFailure: "CONTINUE",
        HadoopJarStep: {
          Jar: "command-runner.jar",
          Args: ["spark-submit", "--class", "com.xsvc2.ETL", "s3://xsvc2-raw-zone/jars/etl.jar"],
        },
      }],
    }));

    // OpenSearch for search
    const osDomain = await opensearch.send(new CreateOSDomainCommand({
      DomainName: "xsvc2-search",
      EngineVersion: "OpenSearch_2.11",
      ClusterConfig: { InstanceType: "r6g.large.search", InstanceCount: 2 },
      EBSOptions: { EBSEnabled: true, VolumeSize: 100, VolumeType: "gp3" },
    }));
    expect(osDomain.DomainStatus!.DomainName).toBe("xsvc2-search");

    // Firehose for real-time ingestion to S3
    await firehose.send(new CreateDeliveryStreamCommand({
      DeliveryStreamName: "xsvc2-realtime-ingest",
      DeliveryStreamType: "DirectPut",
      S3DestinationConfiguration: {
        RoleARN: "arn:aws:iam::000000000000:role/Firehose",
        BucketARN: "arn:aws:s3:::xsvc2-raw-zone",
        Prefix: "realtime/",
      },
    }));
    await firehose.send(new PutRecordBatchCommand({
      DeliveryStreamName: "xsvc2-realtime-ingest",
      Records: [
        { Data: Buffer.from(JSON.stringify({ eventId: "e1", userId: 1, eventType: "click" }) + "\n") },
        { Data: Buffer.from(JSON.stringify({ eventId: "e2", userId: 2, eventType: "purchase" }) + "\n") },
      ],
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 4: Multi-account security & compliance
// Organizations → IAM → STS → GuardDuty → Shield → Backup → CloudTrail
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 4: Enterprise security & governance", () => {
  test("organizations → security services → backup", async () => {
    const orgs = new OrganizationsClient(clientConfig);
    const iam = new IAMClient(clientConfig);
    const sts = new STSClient(clientConfig);
    const guardduty = new GuardDutyClient(clientConfig);
    const shield = new ShieldClient(clientConfig);
    const backup = new BackupClient(clientConfig);
    const kms = new KMSClient(clientConfig);
    const sm = new SecretsManagerClient(clientConfig);

    // Create organization
    const org = await orgs.send(new CreateOrganizationCommand({ FeatureSet: "ALL" }));
    expect(org.Organization!.Id).toBeDefined();

    // Create accounts
    const devAccount = await orgs.send(new CreateAccountCommand({
      AccountName: "xsvc2-dev", Email: "dev@xsvc2.com",
    }));
    const prodAccount = await orgs.send(new CreateAccountCommand({
      AccountName: "xsvc2-prod", Email: "prod@xsvc2.com",
    }));
    expect(devAccount.CreateAccountStatus!.State).toBe("SUCCEEDED");

    // Create OUs
    const roots = await orgs.send(new ListRootsCommand({}));
    const rootId = roots.Roots![0].Id!;
    const devOU = await orgs.send(new CreateOrganizationalUnitCommand({
      ParentId: rootId, Name: "Development",
    }));
    expect(devOU.OrganizationalUnit!.Name).toBe("Development");

    const accounts = await orgs.send(new ListAccountsCommand({}));
    expect(accounts.Accounts!.length).toBeGreaterThanOrEqual(2);

    // Cross-account role
    const crossRole = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc2-cross-account",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::111111111111:root" }, Action: "sts:AssumeRole" }],
      }),
    }));
    const assumed = await sts.send(new AssumeRoleCommand({
      RoleArn: crossRole.Role!.Arn!, RoleSessionName: "xsvc2-audit",
    }));
    expect(assumed.Credentials!.AccessKeyId).toMatch(/^ASIA/);

    // GuardDuty
    const detector = await guardduty.send(new CreateDetectorCommand({ Enable: true }));
    expect(detector.DetectorId).toBeDefined();
    await guardduty.send(new CreateFilterCommand({
      DetectorId: detector.DetectorId!,
      Name: "xsvc2-high-severity",
      FindingCriteria: { Criterion: { severity: { Gte: 7 } } },
      Action: "ARCHIVE",
    }));

    // Shield
    await shield.send(new CreateSubscriptionCommand({}));
    await shield.send(new CreateProtectionCommand({
      Name: "xsvc2-api-protection",
      ResourceArn: "arn:aws:elasticloadbalancing:us-east-1:000000000000:loadbalancer/app/xsvc2-api/abc",
    }));

    // KMS for encryption
    const key = await kms.send(new CreateKeyCommand({ Description: "xsvc2-backup-key" }));

    // Backup vault and plan
    const vault = await backup.send(new CreateBackupVaultCommand({ BackupVaultName: "xsvc2-vault" }));
    expect(vault.BackupVaultArn).toBeDefined();

    const plan = await backup.send(new CreateBackupPlanCommand({
      BackupPlan: {
        BackupPlanName: "xsvc2-daily",
        Rules: [{
          RuleName: "daily-backup",
          TargetBackupVaultName: "xsvc2-vault",
          ScheduleExpression: "cron(0 2 * * ? *)",
          Lifecycle: { DeleteAfterDays: 30 },
        }],
      },
    }));
    expect(plan.BackupPlanId).toBeDefined();

    // Encrypted secrets
    await sm.send(new CreateSecretCommand({
      Name: "xsvc2/prod/db-creds",
      SecretString: JSON.stringify({ username: "admin", password: "rotated-v1" }),
    }));
    const secret = await sm.send(new GetSecretValueCommand({ SecretId: "xsvc2/prod/db-creds" }));
    expect(JSON.parse(secret.SecretString!).username).toBe("admin");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 5: IoT + AI/ML pipeline
// IoT Core → Kinesis → SageMaker → Comprehend → Rekognition → DynamoDB → SES
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 5: IoT + AI/ML pipeline", () => {
  test("device data → ML inference → notifications", async () => {
    const iot = new IoTClient(clientConfig);
    const kinesis = new KinesisClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    const sagemaker = new SageMakerClient(clientConfig);
    const comprehend = new ComprehendClient(clientConfig);
    const rekognition = new RekognitionClient(clientConfig);
    const textract = new TextractClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    const bedrock = new BedrockRuntimeClient({ ...clientConfig, requestHandler: new NodeHttpHandler() });
    const ddb = new DynamoDBClient(clientConfig);
    const ses = new SESv2Client(clientConfig);
    const iam = new IAMClient(clientConfig);

    // IoT: register devices
    await iot.send(new CreateThingGroupCommand({ thingGroupName: "xsvc2-sensors" }));
    await iot.send(new CreateThingCommand({ thingName: "xsvc2-sensor-001" }));
    await iot.send(new CreateThingCommand({ thingName: "xsvc2-sensor-002" }));
    await iot.send(new AddThingToThingGroupCommand({
      thingGroupName: "xsvc2-sensors", thingName: "xsvc2-sensor-001",
    }));

    // IoT policy
    await iot.send(new CreateIoTPolicyCommand({
      policyName: "xsvc2-sensor-policy",
      policyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Action: ["iot:Publish", "iot:Subscribe"], Resource: "*" }],
      }),
    }));

    // IoT rule to forward to Kinesis
    await iot.send(new CreateTopicRuleCommand({
      ruleName: "xsvc2_forward_to_kinesis",
      topicRulePayload: {
        sql: "SELECT * FROM 'sensors/+/data'",
        actions: [{ kinesis: { streamName: "xsvc2-iot-stream", roleArn: "arn:aws:iam::000000000000:role/IoTKinesis", partitionKey: "${topic()}" } }],
      },
    }));

    // Kinesis stream for device data
    await kinesis.send(new CreateStreamCommand({ StreamName: "xsvc2-iot-stream", ShardCount: 2 }));

    // SageMaker: train anomaly detection model
    const smRole = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc2-sagemaker-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "sagemaker.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));
    const trainingJob = await sagemaker.send(new CreateTrainingJobCommand({
      TrainingJobName: "xsvc2-anomaly-detector",
      AlgorithmSpecification: { TrainingImage: "123456.dkr.ecr.us-east-1.amazonaws.com/anomaly:latest", TrainingInputMode: "File" },
      RoleArn: smRole.Role!.Arn!,
      InputDataConfig: [{ ChannelName: "training", DataSource: { S3DataSource: { S3DataType: "S3Prefix", S3Uri: "s3://xsvc2-raw-zone/training/" } } }],
      OutputDataConfig: { S3OutputPath: "s3://xsvc2-raw-zone/models/" },
      ResourceConfig: { InstanceType: "ml.m5.xlarge", InstanceCount: 1, VolumeSizeInGB: 50 },
      StoppingCondition: { MaxRuntimeInSeconds: 3600 },
    }));
    const jobDesc = await sagemaker.send(new DescribeTrainingJobCommand({ TrainingJobName: "xsvc2-anomaly-detector" }));
    expect(jobDesc.TrainingJobStatus).toBe("Completed");

    // Comprehend: analyze device log sentiment
    const sentiment = await comprehend.send(new DetectSentimentCommand({
      Text: "Sensor readings are within normal parameters. System operating efficiently.",
      LanguageCode: "en",
    }));
    expect(sentiment.Sentiment).toBeDefined();
    expect(sentiment.SentimentScore).toBeDefined();

    // Comprehend: extract entities from device logs
    const entities = await comprehend.send(new DetectEntitiesCommand({
      Text: "Device xsvc2-sensor-001 in warehouse Building-A reported temperature 85°F at 2024-01-15",
      LanguageCode: "en",
    }));
    expect(entities.Entities!.length).toBeGreaterThan(0);

    // Rekognition: analyze facility images
    await rekognition.send(new CreateCollectionCommand({ CollectionId: "xsvc2-facility-faces" }));
    const labels = await rekognition.send(new DetectLabelsCommand({
      Image: { Bytes: Buffer.from("fake-image-data") },
      MaxLabels: 10,
    }));
    expect(labels.Labels!.length).toBeGreaterThan(0);

    // Textract: process maintenance documents
    const docText = await textract.send(new DetectDocumentTextCommand({
      Document: { Bytes: Buffer.from("maintenance-report") },
    }));
    expect(docText.Blocks!.length).toBeGreaterThan(0);

    // Bedrock: AI analysis
    const aiAnalysis = await bedrock.send(new InvokeBedrockCommand({
      modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
      contentType: "application/json", accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31", max_tokens: 256,
        messages: [{ role: "user", content: "Analyze IoT sensor anomaly: temperature spike to 185°F" }],
      }),
    }));
    expect(JSON.parse(new TextDecoder().decode(aiAnalysis.body)).content).toBeDefined();

    // Store results in DynamoDB
    await ddb.send(new CreateTableCommand({
      TableName: "xsvc2-iot-events",
      KeySchema: [{ AttributeName: "deviceId", KeyType: "HASH" }, { AttributeName: "timestamp", KeyType: "RANGE" }],
      AttributeDefinitions: [{ AttributeName: "deviceId", AttributeType: "S" }, { AttributeName: "timestamp", AttributeType: "N" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
    await ddb.send(new PutItemCommand({
      TableName: "xsvc2-iot-events",
      Item: {
        deviceId: { S: "xsvc2-sensor-001" },
        timestamp: { N: String(Date.now()) },
        anomaly: { BOOL: true },
        aiAnalysis: { S: "Temperature spike detected" },
        sentiment: { S: sentiment.Sentiment! },
      },
    }));

    // SES: alert notification
    await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: "alerts@xsvc2-iot.com" }));
    await ses.send(new CreateEmailTemplateCommand({
      TemplateName: "anomaly-alert",
      TemplateContent: { Subject: "IoT Anomaly Detected", Text: "Device {{deviceId}} anomaly", Html: "<h1>Anomaly on {{deviceId}}</h1>" },
    }));
    const email = await ses.send(new SendEmailCommand({
      FromEmailAddress: "alerts@xsvc2-iot.com",
      Destination: { ToAddresses: ["ops@xsvc2-iot.com"] },
      Content: { Simple: { Subject: { Data: "Anomaly Alert: xsvc2-sensor-001" }, Body: { Text: { Data: "Temperature spike detected on sensor-001" } } } },
    }));
    expect(email.MessageId).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 6: Batch data processing
// Batch → S3 → DMS → RDS → ElastiCache → Step Functions
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 6: Batch data processing pipeline", () => {
  test("batch jobs → database migration → caching → orchestration", async () => {
    const batch = new BatchClient(clientConfig);
    const s3 = new S3Client(clientConfig);
    const dms = new DatabaseMigrationServiceClient(clientConfig);
    const rds = new RDSClient(clientConfig);
    const elasticache = new ElastiCacheClient(clientConfig);
    const sfn = new SFNClient(clientConfig);
    const iam = new IAMClient(clientConfig);
    const ec2 = new EC2Client(clientConfig);

    // Infrastructure
    const vpc = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.70.0.0/16" }));
    const sub1 = await ec2.send(new CreateSubnetCommand({ VpcId: vpc.Vpc!.VpcId!, CidrBlock: "10.70.1.0/24" }));
    const sub2 = await ec2.send(new CreateSubnetCommand({ VpcId: vpc.Vpc!.VpcId!, CidrBlock: "10.70.2.0/24" }));
    const sg = await ec2.send(new CreateSecurityGroupCommand({ GroupName: "xsvc2-batch-sg", Description: "Batch SG", VpcId: vpc.Vpc!.VpcId! }));

    const role = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc2-batch-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "batch.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    // Batch: compute environment + job queue + job
    const compEnv = await batch.send(new CreateComputeEnvironmentCommand({
      computeEnvironmentName: "xsvc2-batch-env",
      type: "MANAGED", state: "ENABLED",
      computeResources: {
        type: "FARGATE", maxvCpus: 16,
        subnets: [sub1.Subnet!.SubnetId!], securityGroupIds: [sg.GroupId!],
      },
    }));
    const jobQueue = await batch.send(new CreateJobQueueCommand({
      jobQueueName: "xsvc2-processing-queue",
      state: "ENABLED", priority: 1,
      computeEnvironmentOrder: [{ order: 1, computeEnvironment: compEnv.computeEnvironmentName! }],
    }));
    await batch.send(new RegisterJobDefinitionCommand({
      jobDefinitionName: "xsvc2-etl-job",
      type: "container",
      containerProperties: {
        image: "123456.dkr.ecr.us-east-1.amazonaws.com/etl:latest",
        vcpus: 2, memory: 4096,
        command: ["python", "etl.py"],
      },
    }));
    const job = await batch.send(new SubmitJobCommand({
      jobName: "xsvc2-daily-etl",
      jobQueue: "xsvc2-processing-queue",
      jobDefinition: "xsvc2-etl-job",
    }));
    expect(job.jobId).toBeDefined();

    const jobDesc = await batch.send(new DescribeJobsCommand({ jobs: [job.jobId!] }));
    expect(jobDesc.jobs!.length).toBe(1);

    // RDS for target database
    await rds.send(new CreateDBSubnetGroupCommand({
      DBSubnetGroupName: "xsvc2-batch-db-subnets",
      DBSubnetGroupDescription: "Batch DB subnets",
      SubnetIds: [sub1.Subnet!.SubnetId!, sub2.Subnet!.SubnetId!],
    }));
    const db = await rds.send(new CreateDBInstanceCommand({
      DBInstanceIdentifier: "xsvc2-batch-db",
      DBInstanceClass: "db.r6g.large", Engine: "postgres",
      MasterUsername: "admin", AllocatedStorage: 100,
      DBSubnetGroupName: "xsvc2-batch-db-subnets",
    }));
    expect(db.DBInstance!.DBInstanceStatus).toBe("available");

    // DMS for database migration
    const replInstance = await dms.send(new CreateReplicationInstanceCommand({
      ReplicationInstanceIdentifier: "xsvc2-dms-instance",
      ReplicationInstanceClass: "dms.r5.large",
    }));
    expect(replInstance.ReplicationInstance!.ReplicationInstanceStatus).toBe("available");

    // ElastiCache for caching
    await elasticache.send(new CreateCacheSubnetGroupCommand({
      CacheSubnetGroupName: "xsvc2-cache-subnets",
      CacheSubnetGroupDescription: "Cache subnets",
      SubnetIds: [sub1.Subnet!.SubnetId!, sub2.Subnet!.SubnetId!],
    }));
    const cache = await elasticache.send(new CreateCacheClusterCommand({
      CacheClusterId: "xsvc2-cache",
      CacheNodeType: "cache.r6g.large",
      Engine: "redis", NumCacheNodes: 1,
      CacheSubnetGroupName: "xsvc2-cache-subnets",
    }));
    expect(cache.CacheCluster!.CacheClusterStatus).toBe("available");

    // Step Functions to orchestrate the pipeline
    const pipeline = {
      StartAt: "RunBatchJob",
      States: {
        RunBatchJob: { Type: "Pass", Result: { jobId: job.jobId, status: "SUCCEEDED" }, Next: "MigrateData" },
        MigrateData: { Type: "Pass", Result: { tablesProcessed: 15, rowsMigrated: 1000000 }, ResultPath: "$.migration", Next: "WarmCache" },
        WarmCache: { Type: "Pass", Result: { keysLoaded: 50000 }, ResultPath: "$.cache", Next: "Complete" },
        Complete: { Type: "Succeed" },
      },
    };
    const sm = await sfn.send(new CreateStateMachineCommand({
      name: "xsvc2-data-pipeline", roleArn: role.Role!.Arn!,
      definition: JSON.stringify(pipeline),
    }));
    const exec = await sfn.send(new StartExecutionCommand({
      stateMachineArn: sm.stateMachineArn!, input: JSON.stringify({ date: "2024-01-15" }),
    }));
    const result = await sfn.send(new DescribeExecutionCommand({ executionArn: exec.executionArn! }));
    expect(result.status).toBe("SUCCEEDED");
    const output = JSON.parse(result.output!);
    expect(output.migration.tablesProcessed).toBe(15);
    expect(output.cache.keysLoaded).toBe(50000);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 7: Service mesh + microservices discovery
// Service Discovery → ECS → ALB → X-Ray → Network Firewall → Transfer
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 7: Service mesh with observability", () => {
  test("service discovery → containerized microservices → tracing", async () => {
    const sd = new ServiceDiscoveryClient(clientConfig);
    const ecs = new ECSClient(clientConfig);
    const xray = new XRayClient(clientConfig);
    const nfw = new NetworkFirewallClient(clientConfig);
    const transfer = new TransferClient(clientConfig);
    const iam = new IAMClient(clientConfig);
    const ec2 = new EC2Client(clientConfig);

    // VPC
    const vpc = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.80.0.0/16" }));
    const sub = await ec2.send(new CreateSubnetCommand({ VpcId: vpc.Vpc!.VpcId!, CidrBlock: "10.80.1.0/24" }));

    // Service Discovery namespace
    const ns = await sd.send(new CreatePrivateDnsNamespaceCommand({
      Name: "xsvc2.local", Vpc: vpc.Vpc!.VpcId!,
    }));
    expect(ns.OperationId).toBeDefined();

    // Register services in Cloud Map
    const userSvc = await sd.send(new CreateSDServiceCommand({
      Name: "user-service", NamespaceId: ns.OperationId!, // using OperationId as namespace proxy
      DnsConfig: { DnsRecords: [{ Type: "A", TTL: 60 }] },
    }));
    await sd.send(new RegisterInstanceCommand({
      ServiceId: userSvc.Service!.Id!,
      InstanceId: "user-svc-1",
      Attributes: { AWS_INSTANCE_IPV4: "10.80.1.10", AWS_INSTANCE_PORT: "8080" },
    }));

    // ECS cluster with services
    await ecs.send(new CreateECSClusterCommand({ clusterName: "xsvc2-mesh" }));
    const role = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc2-mesh-role",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "ecs-tasks.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));
    await ecs.send(new RegisterTaskDefinitionCommand({
      family: "xsvc2-user-service",
      requiresCompatibilities: ["FARGATE"], networkMode: "awsvpc",
      cpu: "256", memory: "512", executionRoleArn: role.Role!.Arn!,
      containerDefinitions: [{
        name: "user-api", image: "xsvc2/user-service:latest",
        portMappings: [{ containerPort: 8080 }], essential: true,
      }],
    }));

    // X-Ray tracing
    const trace = await xray.send(new PutTraceSegmentsCommand({
      TraceSegmentDocuments: [JSON.stringify({
        trace_id: "1-xsvc2-0001", id: "seg-001", name: "user-service",
        start_time: Date.now() / 1000, end_time: Date.now() / 1000 + 0.05,
        http: { request: { method: "GET", url: "/api/users" }, response: { status: 200 } },
      })],
    }));
    expect(trace.UnprocessedTraceSegments!.length).toBe(0);

    // Network Firewall policy
    const fwPolicy = await nfw.send(new CreateFirewallPolicyCommand({
      FirewallPolicyName: "xsvc2-mesh-policy",
      FirewallPolicy: {
        StatelessDefaultActions: ["aws:forward_to_sfe"],
        StatelessFragmentDefaultActions: ["aws:forward_to_sfe"],
      },
    }));
    const fw = await nfw.send(new CreateFirewallCommand({
      FirewallName: "xsvc2-mesh-firewall",
      FirewallPolicyArn: fwPolicy.FirewallPolicyResponse!.FirewallPolicyArn!,
      VpcId: vpc.Vpc!.VpcId!,
      SubnetMappings: [{ SubnetId: sub.Subnet!.SubnetId! }],
    }));
    expect(fw.Firewall!.FirewallName).toBe("xsvc2-mesh-firewall");

    // Transfer Family for file exchange
    const server = await transfer.send(new CreateTransferServerCommand({
      Protocols: ["SFTP"],
      IdentityProviderType: "SERVICE_MANAGED",
    }));
    expect(server.ServerId).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 8: All new services smoke test
// Quick hit on every new service to verify they're registered and responding
// ─────────────────────────────────────────────────────────────────────
describe("Scenario 8: New services smoke test", () => {
  test("every new service responds", async () => {
    const results: Record<string, boolean> = {};
    const iam = new IAMClient(clientConfig);
    const role = await iam.send(new CreateRoleCommand({
      RoleName: "xsvc2-smoke-role",
      AssumeRolePolicyDocument: JSON.stringify({ Version: "2012-10-17", Statement: [] }),
    }));

    // EKS
    const eks = new EKSClient(clientConfig);
    results.eks = !!(await eks.send(new CreateClusterCommand({
      name: "smoke-eks", roleArn: role.Role!.Arn!,
      resourcesVpcConfig: { subnetIds: ["subnet-fake1"], securityGroupIds: ["sg-fake1"] },
    }))).cluster?.name;

    // Batch
    const batch = new BatchClient(clientConfig);
    results.batch = !!(await batch.send(new CreateComputeEnvironmentCommand({
      computeEnvironmentName: "smoke-batch", type: "MANAGED", state: "ENABLED",
      computeResources: { type: "FARGATE", maxvCpus: 4, subnets: ["sub-1"], securityGroupIds: ["sg-1"] },
    }))).computeEnvironmentName;

    // Organizations (may already exist from scenario 4)
    const orgs = new OrganizationsClient(clientConfig);
    try {
      results.organizations = !!(await orgs.send(new CreateOrganizationCommand({ FeatureSet: "ALL" }))).Organization?.Id;
    } catch {
      const accts = await orgs.send(new ListAccountsCommand({}));
      results.organizations = accts.Accounts!.length > 0;
    }

    // CloudTrail
    const ct = new CloudTrailClient(clientConfig);
    results.cloudtrail = !!(await ct.send(new CreateTrailCommand({ Name: "smoke-trail", S3BucketName: "smoke-bucket" }))).TrailARN;

    // CodeBuild
    const cb = new CodeBuildClient(clientConfig);
    results.codebuild = !!(await cb.send(new CreateProjectCommand({
      name: "smoke-build", source: { type: "NO_SOURCE" }, artifacts: { type: "NO_ARTIFACTS" },
      environment: { type: "LINUX_CONTAINER", computeType: "BUILD_GENERAL1_SMALL", image: "aws/codebuild/standard:7.0" },
      serviceRole: role.Role!.Arn!,
    }))).project?.name;

    // EMR
    const emr = new EMRClient(clientConfig);
    results.emr = !!(await emr.send(new RunJobFlowCommand({
      Name: "smoke-emr", ReleaseLabel: "emr-7.0.0",
      Instances: { MasterInstanceType: "m5.xlarge", SlaveInstanceType: "m5.xlarge", InstanceCount: 1 },
      JobFlowRole: "EMR_EC2", ServiceRole: "EMR_Role",
    }))).JobFlowId;

    // SageMaker
    const sm = new SageMakerClient(clientConfig);
    results.sagemaker = !!(await sm.send(new CreateSMModelCommand({
      ModelName: "smoke-model",
      PrimaryContainer: { Image: "image:latest" },
      ExecutionRoleArn: role.Role!.Arn!,
    }))).ModelArn;

    // GuardDuty
    const gd = new GuardDutyClient(clientConfig);
    results.guardduty = !!(await gd.send(new CreateDetectorCommand({ Enable: true }))).DetectorId;

    // Backup
    const bk = new BackupClient(clientConfig);
    results.backup = !!(await bk.send(new CreateBackupVaultCommand({ BackupVaultName: "smoke-vault" }))).BackupVaultArn;

    // IoT
    const iot = new IoTClient(clientConfig);
    results.iot = !!(await iot.send(new CreateThingCommand({ thingName: "smoke-thing" }))).thingArn;

    // Service Discovery
    const sd = new ServiceDiscoveryClient(clientConfig);
    results.servicediscovery = !!(await sd.send(new CreatePrivateDnsNamespaceCommand({ Name: "smoke.local", Vpc: "vpc-1" }))).OperationId;

    // Transfer
    const tf = new TransferClient(clientConfig);
    results.transfer = !!(await tf.send(new CreateTransferServerCommand({ Protocols: ["SFTP"] }))).ServerId;

    // Shield
    const sh = new ShieldClient(clientConfig);
    await sh.send(new CreateSubscriptionCommand({}));
    results.shield = true;

    // Comprehend
    const comp = new ComprehendClient(clientConfig);
    results.comprehend = !!(await comp.send(new DetectSentimentCommand({ Text: "Great!", LanguageCode: "en" }))).Sentiment;

    // Rekognition
    const rek = new RekognitionClient(clientConfig);
    results.rekognition = !!(await rek.send(new CreateCollectionCommand({ CollectionId: "smoke-faces" }))).CollectionArn;

    // Transcribe
    const tr = new TranscribeClient(clientConfig);
    results.transcribe = !!(await tr.send(new StartTranscriptionJobCommand({
      TranscriptionJobName: "smoke-job", LanguageCode: "en-US",
      Media: { MediaFileUri: "s3://bucket/audio.mp3" },
    }))).TranscriptionJob?.TranscriptionJobName;

    // DMS
    const dms = new DatabaseMigrationServiceClient(clientConfig);
    results.dms = !!(await dms.send(new CreateReplicationInstanceCommand({
      ReplicationInstanceIdentifier: "smoke-dms", ReplicationInstanceClass: "dms.r5.large",
    }))).ReplicationInstance?.ReplicationInstanceIdentifier;

    // Verify all passed
    const failed = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
    expect(failed).toEqual([]);
    expect(Object.keys(results).length).toBeGreaterThanOrEqual(16);
  });
});
