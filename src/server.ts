import { type TinstackConfig } from "./core/config";
import { createContext } from "./core/context";
import { AwsError, jsonErrorResponse } from "./core/errors";
import { logger } from "./core/logger";
import { JsonRouter, QueryRouter } from "./core/router";
import { StorageFactory } from "./core/storage";

// Phase 1 — Core
import { SqsService } from "./services/sqs/sqs-service";
import { SqsJsonHandler } from "./services/sqs/sqs-handler";
import { SqsQueryHandler } from "./services/sqs/sqs-query-handler";
import { DynamoDbService } from "./services/dynamodb/dynamodb-service";
import { DynamoDbHandler } from "./services/dynamodb/dynamodb-handler";
import { S3Service } from "./services/s3/s3-service";
import { S3Router } from "./services/s3/s3-router";
import { SsmService } from "./services/ssm/ssm-service";
import { SsmHandler } from "./services/ssm/ssm-handler";
import { SecretsManagerService } from "./services/secretsmanager/secrets-service";
import { SecretsManagerHandler } from "./services/secretsmanager/secrets-handler";

// Phase 2 — Messaging & Events
import { SnsService } from "./services/sns/sns-service";
import { SnsJsonHandler, SnsQueryHandler } from "./services/sns/sns-handler";
import { EventBridgeService } from "./services/eventbridge/eventbridge-service";
import { EventBridgeHandler } from "./services/eventbridge/eventbridge-handler";
import { KinesisService } from "./services/kinesis/kinesis-service";
import { KinesisHandler } from "./services/kinesis/kinesis-handler";

// Phase 3 — Compute & Auth
import { StsService } from "./services/sts/sts-service";
import { StsQueryHandler } from "./services/sts/sts-handler";
import { IamService } from "./services/iam/iam-service";
import { IamQueryHandler } from "./services/iam/iam-handler";
import { KmsService } from "./services/kms/kms-service";
import { KmsHandler } from "./services/kms/kms-handler";
import { CognitoService } from "./services/cognito/cognito-service";
import { CognitoHandler } from "./services/cognito/cognito-handler";

import { LambdaService } from "./services/lambda/lambda-service";
import { LambdaHandler } from "./services/lambda/lambda-handler";
import { StepFunctionsService } from "./services/stepfunctions/stepfunctions-service";
import { StepFunctionsHandler } from "./services/stepfunctions/stepfunctions-handler";

// Phase 4 — Infrastructure
import { CloudWatchLogsService } from "./services/cloudwatchlogs/logs-service";
import { CloudWatchLogsHandler } from "./services/cloudwatchlogs/logs-handler";
import { CloudWatchMetricsService } from "./services/cloudwatchmetrics/metrics-service";
import { CloudWatchMetricsHandler } from "./services/cloudwatchmetrics/metrics-handler";
import { DynamoDbStreamsService } from "./services/dynamodb/streams-service";
import { DynamoDbStreamsHandler } from "./services/dynamodb/streams-handler";
import { ApiGatewayService } from "./services/apigateway/apigateway-service";
import { ApiGatewayHandler } from "./services/apigateway/apigateway-handler";

// Phase 5 — Networking
import { Ec2Service } from "./services/ec2/ec2-service";
import { Ec2QueryHandler } from "./services/ec2/ec2-handler";

// Phase 6 — DNS, Email, Certificates
import { Route53Service } from "./services/route53/route53-service";
import { Route53Handler } from "./services/route53/route53-handler";
import { SesService } from "./services/ses/ses-service";
import { SesHandler } from "./services/ses/ses-handler";
import { AcmService } from "./services/acm/acm-service";
import { AcmHandler } from "./services/acm/acm-handler";

// Delivery Streams
import { FirehoseService } from "./services/firehose/firehose-service";
import { FirehoseHandler } from "./services/firehose/firehose-handler";

// AppConfig
import { AppConfigService } from "./services/appconfig/appconfig-service";
import { AppConfigHandler } from "./services/appconfig/appconfig-handler";

// Containers & Load Balancing
import { EcrService } from "./services/ecr/ecr-service";
import { EcrHandler } from "./services/ecr/ecr-handler";
import { Elbv2Service } from "./services/elbv2/elbv2-service";
import { Elbv2QueryHandler } from "./services/elbv2/elbv2-handler";
import { EcsServiceImpl } from "./services/ecs/ecs-service";
import { EcsHandler } from "./services/ecs/ecs-handler";

// Scheduler & CDN
import { SchedulerService } from "./services/scheduler/scheduler-service";
import { SchedulerHandler } from "./services/scheduler/scheduler-handler";
import { CloudFrontService } from "./services/cloudfront/cloudfront-service";
import { CloudFrontHandler } from "./services/cloudfront/cloudfront-handler";

// CloudFormation
import { CloudFormationService } from "./services/cloudformation/cloudformation-service";
import { CloudFormationQueryHandler } from "./services/cloudformation/cloudformation-handler";

// Security & GraphQL
import { Wafv2Service } from "./services/wafv2/wafv2-service";
import { Wafv2Handler } from "./services/wafv2/wafv2-handler";
import { AppSyncService } from "./services/appsync/appsync-service";
import { AppSyncHandler } from "./services/appsync/appsync-handler";

// Analytics
import { AthenaService } from "./services/athena/athena-service";
import { AthenaHandler } from "./services/athena/athena-handler";
import { GlueService } from "./services/glue/glue-service";
import { GlueHandler } from "./services/glue/glue-handler";

// Database
import { RdsService } from "./services/rds/rds-service";
import { RdsQueryHandler } from "./services/rds/rds-handler";

// Media
import { MediaConvertService } from "./services/mediaconvert/mediaconvert-service";
import { MediaConvertHandler } from "./services/mediaconvert/mediaconvert-handler";

// AI & ML
import { BedrockService } from "./services/bedrock/bedrock-service";
import { BedrockHandler } from "./services/bedrock/bedrock-handler";
import { TextractService } from "./services/textract/textract-service";
import { TextractHandler } from "./services/textract/textract-handler";
import { RekognitionService } from "./services/rekognition/rekognition-service";
import { RekognitionHandler } from "./services/rekognition/rekognition-handler";
import { ComprehendService } from "./services/comprehend/comprehend-service";
import { ComprehendHandler } from "./services/comprehend/comprehend-handler";
import { TranscribeService } from "./services/transcribe/transcribe-service";
import { TranscribeHandler } from "./services/transcribe/transcribe-handler";
import { ForecastService } from "./services/forecast/forecast-service";
import { ForecastHandler } from "./services/forecast/forecast-handler";

// Polly & Pinpoint (REST-style)
import { PollyService } from "./services/polly/polly-service";
import { PollyHandler } from "./services/polly/polly-handler";
import { PinpointService } from "./services/pinpoint/pinpoint-service";
import { PinpointHandler } from "./services/pinpoint/pinpoint-handler";

// Storage
import { EfsService } from "./services/efs/efs-service";
import { EfsHandler } from "./services/efs/efs-handler";

// IoT, MQ, Kafka, Pipes, Service Discovery, Transfer
import { IoTService } from "./services/iot/iot-service";
import { IoTHandler } from "./services/iot/iot-handler";
import { MqService } from "./services/mq/mq-service";
import { MqHandler } from "./services/mq/mq-handler";
import { KafkaService } from "./services/kafka/kafka-service";
import { KafkaHandler } from "./services/kafka/kafka-handler";
import { PipesService } from "./services/pipes/pipes-service";
import { PipesHandler } from "./services/pipes/pipes-handler";
import { ServiceDiscoveryService } from "./services/servicediscovery/servicediscovery-service";
import { ServiceDiscoveryHandler } from "./services/servicediscovery/servicediscovery-handler";
import { TransferService } from "./services/transfer/transfer-service";
import { TransferHandler } from "./services/transfer/transfer-handler";

// Organizations, CloudTrail, Config, CodeBuild, CodePipeline, CodeDeploy
import { OrganizationsService } from "./services/organizations/organizations-service";
import { OrganizationsHandler } from "./services/organizations/organizations-handler";
import { CloudTrailService } from "./services/cloudtrail/cloudtrail-service";
import { CloudTrailHandler } from "./services/cloudtrail/cloudtrail-handler";
import { ConfigService } from "./services/config/config-service";
import { ConfigHandler } from "./services/config/config-handler";
import { CodeBuildService } from "./services/codebuild/codebuild-service";
import { CodeBuildHandler } from "./services/codebuild/codebuild-handler";
import { CodePipelineService } from "./services/codepipeline/codepipeline-service";
import { CodePipelineHandler } from "./services/codepipeline/codepipeline-handler";
import { CodeDeployService } from "./services/codedeploy/codedeploy-service";
import { CodeDeployHandler } from "./services/codedeploy/codedeploy-handler";

// Security & Compliance
import { BackupService } from "./services/backup/backup-service";
import { BackupHandler } from "./services/backup/backup-handler";
import { GuardDutyService } from "./services/guardduty/guardduty-service";
import { GuardDutyHandler } from "./services/guardduty/guardduty-handler";
import { SecurityHubService } from "./services/securityhub/securityhub-service";
import { SecurityHubHandler } from "./services/securityhub/securityhub-handler";
import { Inspector2Service } from "./services/inspector2/inspector2-service";
import { Inspector2Handler } from "./services/inspector2/inspector2-handler";
import { ShieldService } from "./services/shield/shield-service";
import { ShieldHandler } from "./services/shield/shield-handler";
import { SSOAdminService } from "./services/ssoadmin/ssoadmin-service";
import { SSOAdminHandler } from "./services/ssoadmin/ssoadmin-handler";

// Batch, EMR, Redshift, SageMaker, OpenSearch
import { BatchService } from "./services/batch/batch-service";
import { BatchHandler } from "./services/batch/batch-handler";
import { EmrService } from "./services/emr/emr-service";
import { EmrHandler } from "./services/emr/emr-handler";
import { RedshiftService } from "./services/redshift/redshift-service";
import { RedshiftQueryHandler } from "./services/redshift/redshift-handler";
import { SageMakerService } from "./services/sagemaker/sagemaker-service";
import { SageMakerHandler } from "./services/sagemaker/sagemaker-handler";
import { OpenSearchService } from "./services/opensearch/opensearch-service";
import { OpenSearchHandler } from "./services/opensearch/opensearch-handler";

// X-Ray, Synthetics, RAM
import { XRayService } from "./services/xray/xray-service";
import { XRayHandler } from "./services/xray/xray-handler";
import { SyntheticsService } from "./services/synthetics/synthetics-service";
import { SyntheticsHandler } from "./services/synthetics/synthetics-handler";
import { RamService } from "./services/ram/ram-service";
import { RamHandler } from "./services/ram/ram-handler";

// Budgets, Cost Explorer, Support, ACM PCA
import { BudgetsService } from "./services/budgets/budgets-service";
import { BudgetsHandler } from "./services/budgets/budgets-handler";
import { CostExplorerService } from "./services/ce/ce-service";
import { CostExplorerHandler } from "./services/ce/ce-handler";
import { SupportService } from "./services/support/support-service";
import { SupportHandler } from "./services/support/support-handler";
import { AcmPcaService } from "./services/acmpca/acmpca-service";
import { AcmPcaHandler } from "./services/acmpca/acmpca-handler";

// EKS, Auto Scaling, ElastiCache, Application Auto Scaling
import { EksService } from "./services/eks/eks-service";
import { EksHandler } from "./services/eks/eks-handler";
import { AutoScalingService } from "./services/autoscaling/autoscaling-service";
import { AutoScalingQueryHandler } from "./services/autoscaling/autoscaling-handler";
import { ElastiCacheService } from "./services/elasticache/elasticache-service";
import { ElastiCacheQueryHandler } from "./services/elasticache/elasticache-handler";
import { ApplicationAutoScalingService } from "./services/applicationautoscaling/applicationautoscaling-service";
import { ApplicationAutoScalingHandler } from "./services/applicationautoscaling/applicationautoscaling-handler";

// WorkSpaces, QuickSight, Lake Formation, Route 53 Resolver, Direct Connect, Network Firewall
import { WorkspacesService } from "./services/workspaces/workspaces-service";
import { WorkspacesHandler } from "./services/workspaces/workspaces-handler";
import { QuickSightService } from "./services/quicksight/quicksight-service";
import { QuickSightHandler } from "./services/quicksight/quicksight-handler";
import { LakeFormationService } from "./services/lakeformation/lakeformation-service";
import { LakeFormationHandler } from "./services/lakeformation/lakeformation-handler";
import { Route53ResolverService } from "./services/route53resolver/route53resolver-service";
import { Route53ResolverHandler } from "./services/route53resolver/route53resolver-handler";
import { DirectConnectService } from "./services/directconnect/directconnect-service";
import { DirectConnectHandler } from "./services/directconnect/directconnect-handler";
import { NetworkFirewallService } from "./services/networkfirewall/networkfirewall-service";
import { NetworkFirewallHandler } from "./services/networkfirewall/networkfirewall-handler";

// Storage & Data Migration
import { DmsService } from "./services/dms/dms-service";
import { DmsHandler } from "./services/dms/dms-handler";
import { DataSyncService } from "./services/datasync/datasync-service";
import { DataSyncHandler } from "./services/datasync/datasync-handler";
import { DaxService } from "./services/dax/dax-service";
import { DaxHandler } from "./services/dax/dax-handler";
import { FsxService } from "./services/fsx/fsx-service";
import { FsxHandler } from "./services/fsx/fsx-handler";
import { GlacierService } from "./services/glacier/glacier-service";
import { GlacierHandler } from "./services/glacier/glacier-handler";
import { EbsService } from "./services/ebs/ebs-service";
import { EbsHandler } from "./services/ebs/ebs-handler";
import { S3ControlService } from "./services/s3control/s3control-service";
import { S3ControlHandler } from "./services/s3control/s3control-handler";

// Timestream
import { TimestreamWriteService } from "./services/timestream-write/timestream-write-service";
import { TimestreamQueryService } from "./services/timestream-query/timestream-query-service";
import { TimestreamHandler } from "./services/timestream-write/timestream-write-handler";

// DataBrew
import { DataBrewService } from "./services/databrew/databrew-service";
import { DataBrewHandler } from "./services/databrew/databrew-handler";

// Directory Service
import { DirectoryServiceService } from "./services/directory-service/directory-service-service";
import { DirectoryServiceHandler } from "./services/directory-service/directory-service-handler";

// AMP (Prometheus)
import { AmpService } from "./services/amp/amp-service";
import { AmpHandler } from "./services/amp/amp-handler";

// App Mesh
import { AppMeshService } from "./services/appmesh/appmesh-service";
import { AppMeshHandler } from "./services/appmesh/appmesh-handler";

// VPC Lattice
import { VpcLatticeService } from "./services/vpc-lattice/vpc-lattice-service";
import { VpcLatticeHandler } from "./services/vpc-lattice/vpc-lattice-handler";

// MemoryDB
import { MemoryDBService } from "./services/memorydb/memorydb-service";
import { MemoryDBHandler } from "./services/memorydb/memorydb-handler";

// Kinesis Analytics v2
import { KinesisAnalyticsService } from "./services/kinesis-analytics/kinesis-analytics-service";
import { KinesisAnalyticsHandler } from "./services/kinesis-analytics/kinesis-analytics-handler";

// Kinesis Video
import { KinesisVideoService } from "./services/kinesis-video/kinesis-video-service";
import { KinesisVideoHandler } from "./services/kinesis-video/kinesis-video-handler";

// EMR Serverless
import { EmrServerlessService } from "./services/emr-serverless/emr-serverless-service";
import { EmrServerlessHandler } from "./services/emr-serverless/emr-serverless-handler";

// EMR Containers
import { EmrContainersService } from "./services/emr-containers/emr-containers-service";
import { EmrContainersHandler } from "./services/emr-containers/emr-containers-handler";

// New services batch
import { CognitoIdentityService } from "./services/cognito-identity/cognito-identity-service";
import { CognitoIdentityHandler } from "./services/cognito-identity/cognito-identity-handler";
import { ApiGatewayV1Service } from "./services/apigateway-v1/apigateway-v1-service";
import { ApiGatewayV1Handler } from "./services/apigateway-v1/apigateway-v1-handler";
import { CodeCommitService } from "./services/codecommit/codecommit-service";
import { CodeCommitHandler } from "./services/codecommit/codecommit-handler";
import { AccountService } from "./services/account/account-service";
import { AccountHandler } from "./services/account/account-handler";
import { SignerService } from "./services/signer/signer-service";
import { SignerHandler } from "./services/signer/signer-handler";
import { ServiceQuotasService } from "./services/service-quotas/service-quotas-service";
import { ServiceQuotasHandler } from "./services/service-quotas/service-quotas-handler";
import { ResourceGroupsService } from "./services/resource-groups/resource-groups-service";
import { ResourceGroupsHandler } from "./services/resource-groups/resource-groups-handler";
import { ResourceGroupsTaggingService } from "./services/resource-groups-tagging/resource-groups-tagging-service";
import { ResourceGroupsTaggingHandler } from "./services/resource-groups-tagging/resource-groups-tagging-handler";
import { ElasticBeanstalkService } from "./services/elastic-beanstalk/elastic-beanstalk-service";
import { ElasticBeanstalkQueryHandler } from "./services/elastic-beanstalk/elastic-beanstalk-handler";
import { MediaLiveService } from "./services/medialive/medialive-service";
import { MediaLiveHandler } from "./services/medialive/medialive-handler";
import { MediaStoreService } from "./services/mediastore/mediastore-service";
import { MediaStoreHandler } from "./services/mediastore/mediastore-handler";
import { IvsService } from "./services/ivs/ivs-service";
import { IvsHandler } from "./services/ivs/ivs-handler";
import { ConnectService } from "./services/connect/connect-service";
import { ConnectHandler } from "./services/connect/connect-handler";
import { SesV1QueryHandler } from "./services/ses-v1/ses-v1-handler";
import { CloudControlService } from "./services/cloudcontrol/cloudcontrol-service";
import { CloudControlHandler } from "./services/cloudcontrol/cloudcontrol-handler";

// Batch 8 — Niche/Specialized Services
import { MediaConnectService } from "./services/mediaconnect/mediaconnect-service";
import { MediaConnectHandler } from "./services/mediaconnect/mediaconnect-handler";
import { MediaPackageService } from "./services/mediapackage/mediapackage-service";
import { MediaPackageHandler } from "./services/mediapackage/mediapackage-handler";
import { ManagedBlockchainService } from "./services/managedblockchain/managedblockchain-service";
import { ManagedBlockchainHandler } from "./services/managedblockchain/managedblockchain-handler";
import { CloudHsmV2Service } from "./services/cloudhsmv2/cloudhsmv2-service";
import { CloudHsmV2Handler } from "./services/cloudhsmv2/cloudhsmv2-handler";
import { DataPipelineService } from "./services/datapipeline/datapipeline-service";
import { DataPipelineHandler } from "./services/datapipeline/datapipeline-handler";
import { PanoramaService } from "./services/panorama/panorama-service";
import { PanoramaHandler } from "./services/panorama/panorama-handler";
import { OsisService } from "./services/osis/osis-service";
import { OsisHandler } from "./services/osis/osis-handler";
import { ResilienceHubService } from "./services/resiliencehub/resiliencehub-service";
import { ResilienceHubHandler } from "./services/resiliencehub/resiliencehub-handler";
import { Macie2Service } from "./services/macie2/macie2-service";
import { Macie2Handler } from "./services/macie2/macie2-handler";
import { IdentityStoreService } from "./services/identitystore/identitystore-service";
import { IdentityStoreHandler } from "./services/identitystore/identitystore-handler";
import { BedrockAgentService } from "./services/bedrockagent/bedrockagent-service";
import { BedrockAgentHandler } from "./services/bedrockagent/bedrockagent-handler";
import { Route53DomainsService } from "./services/route53domains/route53domains-service";
import { Route53DomainsHandler } from "./services/route53domains/route53domains-handler";
import { WorkSpacesWebService } from "./services/workspacesweb/workspacesweb-service";
import { WorkSpacesWebHandler } from "./services/workspacesweb/workspacesweb-handler";
import { MeteringMarketplaceService } from "./services/meteringmarketplace/meteringmarketplace-service";
import { MeteringMarketplaceHandler } from "./services/meteringmarketplace/meteringmarketplace-handler";
import { DsqlService } from "./services/dsql/dsql-service";
import { DsqlHandler } from "./services/dsql/dsql-handler";
import { S3TablesService } from "./services/s3tables/s3tables-service";
import { S3TablesHandler } from "./services/s3tables/s3tables-handler";
import { S3VectorsService } from "./services/s3vectors/s3vectors-service";
import { S3VectorsHandler } from "./services/s3vectors/s3vectors-handler";

function isEnabled(config: TinstackConfig, serviceName: string): boolean {
  if (config.enabledServices === "*") return true;
  return config.enabledServices.includes(serviceName);
}

export function createServer(config: TinstackConfig) {
  const storageFactory = new StorageFactory(config.storageMode, config.storagePath);
  const jsonRouter = new JsonRouter();
  const queryRouter = new QueryRouter();

  const enabledNames: string[] = [];

  // Phase 1 — Core
  if (isEnabled(config, "s3")) {
    const s3Service = new S3Service();
    const s3Router = new S3Router(s3Service);
    // S3 is handled as fallback in fetch(), store reference
    (globalThis as any).__tinstackS3Router = s3Router;
    enabledNames.push("S3");
  }

  if (isEnabled(config, "sqs")) {
    const sqsService = new SqsService(config.baseUrl, config.defaultAccountId);
    jsonRouter.register("sqs", new SqsJsonHandler(sqsService));
    const sqsQueryHandler = new SqsQueryHandler(sqsService);
    queryRouter.register("sqs", (action, params, ctx) => sqsQueryHandler.handle(action, params, ctx));
    enabledNames.push("SQS");
  }

  if (isEnabled(config, "dynamodb")) {
    jsonRouter.register("dynamodb", new DynamoDbHandler(new DynamoDbService(config.defaultAccountId)));
    enabledNames.push("DynamoDB");
  }

  if (isEnabled(config, "ssm")) {
    jsonRouter.register("ssm", new SsmHandler(new SsmService(config.defaultAccountId)));
    enabledNames.push("SSM");
  }

  if (isEnabled(config, "secretsmanager")) {
    jsonRouter.register("secretsmanager", new SecretsManagerHandler(new SecretsManagerService(config.defaultAccountId)));
    enabledNames.push("Secrets Manager");
  }

  // Phase 2 — Messaging & Events
  if (isEnabled(config, "sns")) {
    const snsService = new SnsService(config.defaultAccountId);
    jsonRouter.register("sns", new SnsJsonHandler(snsService));
    const snsQueryHandler = new SnsQueryHandler(snsService);
    queryRouter.register("sns", (action, params, ctx) => snsQueryHandler.handle(action, params, ctx));
    enabledNames.push("SNS");
  }

  if (isEnabled(config, "events")) {
    jsonRouter.register("eventbridge", new EventBridgeHandler(new EventBridgeService(config.defaultAccountId)));
    enabledNames.push("EventBridge");
  }

  if (isEnabled(config, "kinesis")) {
    jsonRouter.register("kinesis", new KinesisHandler(new KinesisService(config.defaultAccountId)));
    enabledNames.push("Kinesis");
  }

  // Phase 3 — Auth
  if (isEnabled(config, "sts")) {
    const stsService = new StsService(config.defaultAccountId, config.defaultRegion);
    const stsQueryHandler = new StsQueryHandler(stsService);
    queryRouter.register("sts", (action, params, ctx) => stsQueryHandler.handle(action, params, ctx));
    enabledNames.push("STS");
  }

  if (isEnabled(config, "iam")) {
    const iamService = new IamService(config.defaultAccountId);
    const iamQueryHandler = new IamQueryHandler(iamService);
    queryRouter.register("iam", (action, params, ctx) => iamQueryHandler.handle(action, params, ctx));
    enabledNames.push("IAM");
  }

  if (isEnabled(config, "kms")) {
    jsonRouter.register("kms", new KmsHandler(new KmsService(config.defaultAccountId)));
    enabledNames.push("KMS");
  }

  if (isEnabled(config, "cognito-idp")) {
    jsonRouter.register("cognito", new CognitoHandler(new CognitoService(config.defaultAccountId)));
    enabledNames.push("Cognito");
  }

  // Phase 4 — Infrastructure
  if (isEnabled(config, "logs")) {
    jsonRouter.register("cloudwatchlogs", new CloudWatchLogsHandler(new CloudWatchLogsService(config.defaultAccountId)));
    enabledNames.push("CloudWatch Logs");
  }

  if (isEnabled(config, "monitoring")) {
    jsonRouter.register("cloudwatch", new CloudWatchMetricsHandler(new CloudWatchMetricsService(config.defaultAccountId)));
    enabledNames.push("CloudWatch Metrics");
  }

  if (isEnabled(config, "dynamodbstreams")) {
    jsonRouter.register("dynamodbstreams", new DynamoDbStreamsHandler(new DynamoDbStreamsService(config.defaultAccountId)));
    enabledNames.push("DynamoDB Streams");
  }

  // REST-style services (Lambda, API Gateway)
  let lambdaHandler: LambdaHandler | undefined;
  if (isEnabled(config, "lambda")) {
    const lambdaService = new LambdaService(config.defaultAccountId, config.storagePath);
    lambdaHandler = new LambdaHandler(lambdaService);
    enabledNames.push("Lambda");
  }

  let apiGatewayHandler: ApiGatewayHandler | undefined;
  if (isEnabled(config, "apigateway") || isEnabled(config, "apigatewayv2")) {
    const apiGatewayService = new ApiGatewayService(config.defaultAccountId, config.baseUrl);
    apiGatewayHandler = new ApiGatewayHandler(apiGatewayService);
    enabledNames.push("API Gateway");
  }

  if (isEnabled(config, "states")) {
    const taskInvoker = async (resource: string, input: any) => {
      // If Lambda is enabled and resource is a Lambda function ARN, invoke it
      if (lambdaHandler && resource.includes(":function:")) {
        const fnName = resource.split(":function:").pop()!;
        const lambdaSvc = (lambdaHandler as any).service as LambdaService;
        const result = await lambdaSvc.invoke(fnName, JSON.stringify(input), "RequestResponse", config.defaultRegion);
        try { return JSON.parse(result.payload); } catch { return result.payload; }
      }
      // Mock: return input as output
      return input;
    };
    const sfService = new StepFunctionsService(config.defaultAccountId, taskInvoker);
    const sfHandler = new StepFunctionsHandler(sfService);
    jsonRouter.register("stepfunctions", sfHandler);
    enabledNames.push("Step Functions");
  }

  // Phase 5 — Networking
  if (isEnabled(config, "ec2")) {
    const ec2Service = new Ec2Service(config.defaultAccountId, config.defaultRegion);
    const ec2QueryHandler = new Ec2QueryHandler(ec2Service);
    queryRouter.register("ec2", (action, params, ctx) => ec2QueryHandler.handle(action, params, ctx));
    enabledNames.push("EC2");
  }

  // Phase 6 — DNS, Email, Certificates
  let route53Handler: Route53Handler | undefined;
  if (isEnabled(config, "route53")) {
    const route53Service = new Route53Service(config.defaultAccountId);
    route53Handler = new Route53Handler(route53Service);
    enabledNames.push("Route 53");
  }

  let sesHandler: SesHandler | undefined;
  if (isEnabled(config, "ses")) {
    const sesService = new SesService(config.defaultAccountId);
    sesHandler = new SesHandler(sesService);
    enabledNames.push("SES");
  }

  if (isEnabled(config, "acm")) {
    jsonRouter.register("acm", new AcmHandler(new AcmService(config.defaultAccountId)));
    enabledNames.push("ACM");
  }

  // Containers & Load Balancing
  if (isEnabled(config, "ecr")) {
    jsonRouter.register("ecr", new EcrHandler(new EcrService(config.defaultAccountId)));
    enabledNames.push("ECR");
  }

  if (isEnabled(config, "firehose")) {
    jsonRouter.register("firehose", new FirehoseHandler(new FirehoseService(config.defaultAccountId)));
    enabledNames.push("Firehose");
  }

  if (isEnabled(config, "ecs")) {
    jsonRouter.register("ecs", new EcsHandler(new EcsServiceImpl(config.defaultAccountId)));
    enabledNames.push("ECS");
  }

  if (isEnabled(config, "elasticloadbalancing")) {
    const elbv2Service = new Elbv2Service(config.defaultAccountId);
    const elbv2QueryHandler = new Elbv2QueryHandler(elbv2Service);
    queryRouter.register("elasticloadbalancing", (action, params, ctx) => elbv2QueryHandler.handle(action, params, ctx));
    enabledNames.push("ELBv2");
  }

  // EKS (REST-style)
  let eksHandler: EksHandler | undefined;
  if (isEnabled(config, "eks")) {
    eksHandler = new EksHandler(new EksService(config.defaultAccountId));
    enabledNames.push("EKS");
  }

  // Auto Scaling (Query/XML)
  if (isEnabled(config, "autoscaling")) {
    const autoScalingService = new AutoScalingService(config.defaultAccountId);
    const autoScalingQueryHandler = new AutoScalingQueryHandler(autoScalingService);
    queryRouter.register("autoscaling", (action, params, ctx) => autoScalingQueryHandler.handle(action, params, ctx));
    enabledNames.push("Auto Scaling");
  }

  // ElastiCache (Query/XML)
  if (isEnabled(config, "elasticache")) {
    const elastiCacheService = new ElastiCacheService(config.defaultAccountId);
    const elastiCacheQueryHandler = new ElastiCacheQueryHandler(elastiCacheService);
    queryRouter.register("elasticache", (action, params, ctx) => elastiCacheQueryHandler.handle(action, params, ctx));
    enabledNames.push("ElastiCache");
  }

  // Application Auto Scaling (JSON 1.1)
  if (isEnabled(config, "application-autoscaling")) {
    jsonRouter.register("applicationautoscaling", new ApplicationAutoScalingHandler(new ApplicationAutoScalingService(config.defaultAccountId)));
    enabledNames.push("Application Auto Scaling");
  }

  // AppConfig
  let appConfigHandler: AppConfigHandler | undefined;
  if (isEnabled(config, "appconfig")) {
    const appConfigService = new AppConfigService(config.defaultAccountId);
    appConfigHandler = new AppConfigHandler(appConfigService);
    enabledNames.push("AppConfig");
  }

  // Scheduler & CDN
  let schedulerHandler: SchedulerHandler | undefined;
  if (isEnabled(config, "scheduler")) {
    const schedulerService = new SchedulerService(config.defaultAccountId);
    schedulerHandler = new SchedulerHandler(schedulerService);
    enabledNames.push("EventBridge Scheduler");
  }

  let cloudFrontHandler: CloudFrontHandler | undefined;
  if (isEnabled(config, "cloudfront")) {
    const cloudFrontService = new CloudFrontService(config.defaultAccountId);
    cloudFrontHandler = new CloudFrontHandler(cloudFrontService);
    enabledNames.push("CloudFront");
  }

  // CloudFormation
  if (isEnabled(config, "cloudformation")) {
    const cfnService = new CloudFormationService(config.defaultAccountId);
    const cfnQueryHandler = new CloudFormationQueryHandler(cfnService);
    queryRouter.register("cloudformation", (action, params, ctx) => cfnQueryHandler.handle(action, params, ctx));
    enabledNames.push("CloudFormation");
  }

  // WAFv2 (JSON 1.1)
  if (isEnabled(config, "wafv2")) {
    jsonRouter.register("wafv2", new Wafv2Handler(new Wafv2Service(config.defaultAccountId)));
    enabledNames.push("WAFv2");
  }

  // AppSync (REST-style)
  let appSyncHandler: AppSyncHandler | undefined;
  if (isEnabled(config, "appsync")) {
    const appSyncService = new AppSyncService(config.defaultAccountId);
    appSyncHandler = new AppSyncHandler(appSyncService);
    enabledNames.push("AppSync");
  }

  // RDS (Query/XML)
  if (isEnabled(config, "rds")) {
    const rdsService = new RdsService(config.defaultAccountId, config.defaultRegion);
    const rdsQueryHandler = new RdsQueryHandler(rdsService);
    queryRouter.register("rds", (action, params, ctx) => rdsQueryHandler.handle(action, params, ctx));
    enabledNames.push("RDS");
  }

  // MediaConvert (REST-style)
  let mediaConvertHandler: MediaConvertHandler | undefined;
  if (isEnabled(config, "mediaconvert")) {
    const mediaConvertService = new MediaConvertService(config.defaultAccountId, config.baseUrl);
    mediaConvertHandler = new MediaConvertHandler(mediaConvertService);
    enabledNames.push("MediaConvert");
  }

  // AI & ML
  let bedrockHandler: BedrockHandler | undefined;
  if (isEnabled(config, "bedrock")) {
    const bedrockService = new BedrockService(config.defaultAccountId);
    bedrockHandler = new BedrockHandler(bedrockService);
    jsonRouter.register("bedrock", bedrockHandler);
    enabledNames.push("Bedrock");
  }

  if (isEnabled(config, "textract")) {
    jsonRouter.register("textract", new TextractHandler(new TextractService()));
    enabledNames.push("Textract");
  }

  if (isEnabled(config, "rekognition")) {
    jsonRouter.register("rekognition", new RekognitionHandler(new RekognitionService(config.defaultAccountId)));
    enabledNames.push("Rekognition");
  }

  if (isEnabled(config, "comprehend")) {
    jsonRouter.register("comprehend", new ComprehendHandler(new ComprehendService(config.defaultAccountId)));
    enabledNames.push("Comprehend");
  }

  if (isEnabled(config, "transcribe")) {
    jsonRouter.register("transcribe", new TranscribeHandler(new TranscribeService(config.defaultAccountId, config.defaultRegion)));
    enabledNames.push("Transcribe");
  }

  if (isEnabled(config, "forecast")) {
    jsonRouter.register("forecast", new ForecastHandler(new ForecastService(config.defaultAccountId)));
    enabledNames.push("Forecast");
  }

  // Polly (REST-style)
  let pollyHandler: PollyHandler | undefined;
  if (isEnabled(config, "polly")) {
    const pollyService = new PollyService(config.defaultAccountId, config.defaultRegion);
    pollyHandler = new PollyHandler(pollyService);
    enabledNames.push("Polly");
  }

  // Pinpoint (REST-style)
  let pinpointHandler: PinpointHandler | undefined;
  if (isEnabled(config, "mobiletargeting")) {
    const pinpointService = new PinpointService(config.defaultAccountId);
    pinpointHandler = new PinpointHandler(pinpointService);
    enabledNames.push("Pinpoint");
  }

  // EFS (REST-style)
  let efsHandler: EfsHandler | undefined;
  if (isEnabled(config, "elasticfilesystem")) {
    const efsService = new EfsService(config.defaultAccountId);
    efsHandler = new EfsHandler(efsService);
    enabledNames.push("EFS");
  }

  // Analytics
  if (isEnabled(config, "athena")) {
    jsonRouter.register("athena", new AthenaHandler(new AthenaService(config.defaultAccountId)));
    enabledNames.push("Athena");
  }

  if (isEnabled(config, "glue")) {
    jsonRouter.register("glue", new GlueHandler(new GlueService(config.defaultAccountId)));
    enabledNames.push("Glue");
  }

  // Organizations
  if (isEnabled(config, "organizations")) {
    jsonRouter.register("organizations", new OrganizationsHandler(new OrganizationsService(config.defaultAccountId)));
    enabledNames.push("Organizations");
  }

  // CloudTrail
  if (isEnabled(config, "cloudtrail")) {
    jsonRouter.register("cloudtrail", new CloudTrailHandler(new CloudTrailService(config.defaultAccountId)));
    enabledNames.push("CloudTrail");
  }

  // Config
  if (isEnabled(config, "config")) {
    jsonRouter.register("config", new ConfigHandler(new ConfigService(config.defaultAccountId)));
    enabledNames.push("Config");
  }

  // CodeBuild
  if (isEnabled(config, "codebuild")) {
    jsonRouter.register("codebuild", new CodeBuildHandler(new CodeBuildService(config.defaultAccountId)));
    enabledNames.push("CodeBuild");
  }

  // CodePipeline
  if (isEnabled(config, "codepipeline")) {
    jsonRouter.register("codepipeline", new CodePipelineHandler(new CodePipelineService(config.defaultAccountId)));
    enabledNames.push("CodePipeline");
  }

  // CodeDeploy
  if (isEnabled(config, "codedeploy")) {
    jsonRouter.register("codedeploy", new CodeDeployHandler(new CodeDeployService(config.defaultAccountId)));
    enabledNames.push("CodeDeploy");
  }

  // Batch (REST-style /v1/...)
  let batchHandler: BatchHandler | undefined;
  if (isEnabled(config, "batch")) {
    const batchService = new BatchService(config.defaultAccountId);
    batchHandler = new BatchHandler(batchService);
    enabledNames.push("Batch");
  }

  // EMR (JSON 1.1)
  if (isEnabled(config, "elasticmapreduce")) {
    jsonRouter.register("emr", new EmrHandler(new EmrService(config.defaultAccountId)));
    enabledNames.push("EMR");
  }

  // Redshift (Query/XML)
  if (isEnabled(config, "redshift")) {
    const redshiftService = new RedshiftService(config.defaultAccountId, config.defaultRegion);
    const redshiftQueryHandler = new RedshiftQueryHandler(redshiftService);
    queryRouter.register("redshift", (action, params, ctx) => redshiftQueryHandler.handle(action, params, ctx));
    enabledNames.push("Redshift");
  }

  // SageMaker (JSON 1.1)
  if (isEnabled(config, "sagemaker")) {
    jsonRouter.register("sagemaker", new SageMakerHandler(new SageMakerService(config.defaultAccountId)));
    enabledNames.push("SageMaker");
  }

  // OpenSearch (REST-style)
  let openSearchHandler: OpenSearchHandler | undefined;
  if (isEnabled(config, "es") || isEnabled(config, "opensearch")) {
    const openSearchService = new OpenSearchService(config.defaultAccountId);
    openSearchHandler = new OpenSearchHandler(openSearchService);
    enabledNames.push("OpenSearch");
  }


  // AWS Backup (REST-style)
  let backupHandler: BackupHandler | undefined;
  if (isEnabled(config, "backup")) {
    const backupService = new BackupService(config.defaultAccountId);
    backupHandler = new BackupHandler(backupService);
    enabledNames.push("Backup");
  }

  // GuardDuty (REST-style)
  let guardDutyHandler: GuardDutyHandler | undefined;
  if (isEnabled(config, "guardduty")) {
    const guardDutyService = new GuardDutyService(config.defaultAccountId);
    guardDutyHandler = new GuardDutyHandler(guardDutyService);
    enabledNames.push("GuardDuty");
  }

  // Security Hub (REST-style)
  let securityHubHandler: SecurityHubHandler | undefined;
  if (isEnabled(config, "securityhub")) {
    const securityHubService = new SecurityHubService(config.defaultAccountId);
    securityHubHandler = new SecurityHubHandler(securityHubService);
    enabledNames.push("Security Hub");
  }

  // Inspector v2 (REST-style)
  let inspector2Handler: Inspector2Handler | undefined;
  if (isEnabled(config, "inspector2")) {
    const inspector2Service = new Inspector2Service(config.defaultAccountId);
    inspector2Handler = new Inspector2Handler(inspector2Service);
    enabledNames.push("Inspector2");
  }

  // Shield (JSON 1.1)
  if (isEnabled(config, "shield")) {
    jsonRouter.register("shield", new ShieldHandler(new ShieldService(config.defaultAccountId)));
    enabledNames.push("Shield");
  }

  // SSO Admin (JSON 1.1)
  if (isEnabled(config, "sso")) {
    jsonRouter.register("ssoadmin", new SSOAdminHandler(new SSOAdminService(config.defaultAccountId, config.defaultRegion)));
    enabledNames.push("SSO Admin");
  }

  // IoT Core (REST-style)
  let iotHandler: IoTHandler | undefined;
  if (isEnabled(config, "iot")) {
    const iotService = new IoTService(config.defaultAccountId, config.defaultRegion);
    iotHandler = new IoTHandler(iotService);
    enabledNames.push("IoT");
  }

  // Amazon MQ (REST-style)
  let mqHandler: MqHandler | undefined;
  if (isEnabled(config, "mq")) {
    const mqService = new MqService(config.defaultAccountId, config.defaultRegion);
    mqHandler = new MqHandler(mqService);
    enabledNames.push("MQ");
  }

  // MSK / Kafka (REST-style)
  let kafkaHandler: KafkaHandler | undefined;
  if (isEnabled(config, "kafka")) {
    const kafkaService = new KafkaService(config.defaultAccountId, config.defaultRegion);
    kafkaHandler = new KafkaHandler(kafkaService);
    enabledNames.push("MSK");
  }

  // EventBridge Pipes (REST-style)
  let pipesHandler: PipesHandler | undefined;
  if (isEnabled(config, "pipes")) {
    const pipesService = new PipesService(config.defaultAccountId, config.defaultRegion);
    pipesHandler = new PipesHandler(pipesService);
    enabledNames.push("Pipes");
  }

  // Cloud Map / Service Discovery (JSON 1.1)
  if (isEnabled(config, "servicediscovery")) {
    jsonRouter.register("servicediscovery", new ServiceDiscoveryHandler(new ServiceDiscoveryService(config.defaultAccountId, config.defaultRegion)));
    enabledNames.push("Service Discovery");
  }

  // Transfer Family (JSON 1.1)
  if (isEnabled(config, "transfer")) {
    jsonRouter.register("transfer", new TransferHandler(new TransferService(config.defaultAccountId, config.defaultRegion)));
    enabledNames.push("Transfer");
  }

  // X-Ray (REST-style)
  let xrayHandler: XRayHandler | undefined;
  if (isEnabled(config, "xray")) {
    const xrayService = new XRayService(config.defaultAccountId);
    xrayHandler = new XRayHandler(xrayService);
    enabledNames.push("X-Ray");
  }

  // Synthetics (REST-style)
  let syntheticsHandler: SyntheticsHandler | undefined;
  if (isEnabled(config, "synthetics")) {
    const syntheticsService = new SyntheticsService(config.defaultAccountId);
    syntheticsHandler = new SyntheticsHandler(syntheticsService);
    enabledNames.push("Synthetics");
  }

  // RAM (REST-style)
  let ramHandler: RamHandler | undefined;
  if (isEnabled(config, "ram")) {
    const ramService = new RamService(config.defaultAccountId);
    ramHandler = new RamHandler(ramService);
    enabledNames.push("RAM");
  }

  // Budgets (JSON 1.1)
  if (isEnabled(config, "budgets")) {
    jsonRouter.register("budgets", new BudgetsHandler(new BudgetsService(config.defaultAccountId)));
    enabledNames.push("Budgets");
  }

  // Cost Explorer (JSON 1.1)
  if (isEnabled(config, "ce")) {
    jsonRouter.register("ce", new CostExplorerHandler(new CostExplorerService(config.defaultAccountId)));
    enabledNames.push("Cost Explorer");
  }

  // Support (JSON 1.1)
  if (isEnabled(config, "support")) {
    jsonRouter.register("support", new SupportHandler(new SupportService(config.defaultAccountId)));
    enabledNames.push("Support");
  }

  // ACM PCA (JSON 1.1)
  if (isEnabled(config, "acm-pca")) {
    jsonRouter.register("acmpca", new AcmPcaHandler(new AcmPcaService(config.defaultAccountId)));
    enabledNames.push("ACM PCA");
  }

  // Timestream Write + Query
  if (isEnabled(config, "timestream")) {
    const tsWrite = new TimestreamWriteService(config.defaultAccountId);
    const tsQuery = new TimestreamQueryService();
    jsonRouter.register("timestream", new TimestreamHandler(tsWrite, tsQuery));
    enabledNames.push("Timestream");
  }

  // Directory Service
  if (isEnabled(config, "ds")) {
    jsonRouter.register("directory-service", new DirectoryServiceHandler(new DirectoryServiceService(config.defaultAccountId)));
    enabledNames.push("Directory Service");
  }

  // MemoryDB
  if (isEnabled(config, "memorydb")) {
    jsonRouter.register("memorydb", new MemoryDBHandler(new MemoryDBService(config.defaultAccountId)));
    enabledNames.push("MemoryDB");
  }

  // Kinesis Analytics v2
  if (isEnabled(config, "kinesisanalyticsv2")) {
    jsonRouter.register("kinesis-analytics", new KinesisAnalyticsHandler(new KinesisAnalyticsService(config.defaultAccountId)));
    enabledNames.push("Kinesis Analytics v2");
  }

  // Kinesis Video (REST)
  let kinesisVideoHandler: KinesisVideoHandler | undefined;
  if (isEnabled(config, "kinesisvideo")) {
    kinesisVideoHandler = new KinesisVideoHandler(new KinesisVideoService(config.defaultAccountId));
    enabledNames.push("Kinesis Video");
  }

  // DataBrew (REST)
  let dataBrewHandler: DataBrewHandler | undefined;
  if (isEnabled(config, "databrew")) {
    const dataBrewService = new DataBrewService(config.defaultAccountId);
    dataBrewHandler = new DataBrewHandler(dataBrewService);
    enabledNames.push("DataBrew");
  }

  // AMP / Prometheus (REST)
  let ampHandler: AmpHandler | undefined;
  if (isEnabled(config, "aps")) {
    const ampService = new AmpService(config.defaultAccountId);
    ampHandler = new AmpHandler(ampService);
    enabledNames.push("AMP");
  }

  // App Mesh (REST)
  let appMeshHandler: AppMeshHandler | undefined;
  if (isEnabled(config, "appmesh")) {
    const appMeshService = new AppMeshService(config.defaultAccountId);
    appMeshHandler = new AppMeshHandler(appMeshService);
    enabledNames.push("App Mesh");
  }

  // VPC Lattice (REST)
  let vpcLatticeHandler: VpcLatticeHandler | undefined;
  if (isEnabled(config, "vpc-lattice")) {
    const vpcLatticeService = new VpcLatticeService(config.defaultAccountId);
    vpcLatticeHandler = new VpcLatticeHandler(vpcLatticeService);
    enabledNames.push("VPC Lattice");
  }

  // EMR Serverless (REST)
  let emrServerlessHandler: EmrServerlessHandler | undefined;
  if (isEnabled(config, "emr-serverless")) {
    const emrServerlessService = new EmrServerlessService(config.defaultAccountId);
    emrServerlessHandler = new EmrServerlessHandler(emrServerlessService);
    enabledNames.push("EMR Serverless");
  }

  // EMR Containers (REST)
  let emrContainersHandler: EmrContainersHandler | undefined;
  if (isEnabled(config, "emr-containers")) {
    const emrContainersService = new EmrContainersService(config.defaultAccountId);
    emrContainersHandler = new EmrContainersHandler(emrContainersService);
    enabledNames.push("EMR Containers");
  }


  // Storage & Data Migration — JSON 1.1
  if (isEnabled(config, "dms")) {
    jsonRouter.register("dms", new DmsHandler(new DmsService(config.defaultAccountId)));
    enabledNames.push("DMS");
  }

  if (isEnabled(config, "datasync")) {
    jsonRouter.register("datasync", new DataSyncHandler(new DataSyncService(config.defaultAccountId)));
    enabledNames.push("DataSync");
  }

  if (isEnabled(config, "dax")) {
    jsonRouter.register("dax", new DaxHandler(new DaxService(config.defaultAccountId)));
    enabledNames.push("DAX");
  }

  if (isEnabled(config, "fsx")) {
    jsonRouter.register("fsx", new FsxHandler(new FsxService(config.defaultAccountId)));
    enabledNames.push("FSx");
  }

  // Storage & Data Migration — REST-style
  let glacierHandler: GlacierHandler | undefined;
  if (isEnabled(config, "glacier")) {
    const glacierService = new GlacierService(config.defaultAccountId);
    glacierHandler = new GlacierHandler(glacierService);
    enabledNames.push("Glacier");
  }

  let ebsHandler: EbsHandler | undefined;
  if (isEnabled(config, "ebs")) {
    const ebsService = new EbsService(config.defaultAccountId);
    ebsHandler = new EbsHandler(ebsService);
    enabledNames.push("EBS");
  }

  let s3ControlHandler: S3ControlHandler | undefined;
  if (isEnabled(config, "s3control")) {
    const s3ControlService = new S3ControlService(config.defaultAccountId);
    s3ControlHandler = new S3ControlHandler(s3ControlService);
    enabledNames.push("S3 Control");
  }

  // WorkSpaces (JSON 1.1)
  if (isEnabled(config, "workspaces")) {
    jsonRouter.register("workspaces", new WorkspacesHandler(new WorkspacesService(config.defaultAccountId)));
    enabledNames.push("WorkSpaces");
  }

  // QuickSight (REST-style)
  let quickSightHandler: QuickSightHandler | undefined;
  if (isEnabled(config, "quicksight")) {
    const quickSightService = new QuickSightService(config.defaultAccountId);
    quickSightHandler = new QuickSightHandler(quickSightService);
    enabledNames.push("QuickSight");
  }

  // Lake Formation (REST JSON)
  let lakeFormationHandler: LakeFormationHandler | undefined;
  if (isEnabled(config, "lakeformation")) {
    const lakeFormationService = new LakeFormationService(config.defaultAccountId);
    lakeFormationHandler = new LakeFormationHandler(lakeFormationService);
    enabledNames.push("Lake Formation");
  }

  // Route 53 Resolver (JSON 1.1)
  if (isEnabled(config, "route53resolver")) {
    jsonRouter.register("route53resolver", new Route53ResolverHandler(new Route53ResolverService(config.defaultAccountId)));
    enabledNames.push("Route 53 Resolver");
  }

  // Direct Connect (JSON 1.1)
  if (isEnabled(config, "directconnect")) {
    jsonRouter.register("directconnect", new DirectConnectHandler(new DirectConnectService(config.defaultAccountId)));
    enabledNames.push("Direct Connect");
  }

  // Network Firewall (JSON 1.1)
  if (isEnabled(config, "network-firewall")) {
    jsonRouter.register("networkfirewall", new NetworkFirewallHandler(new NetworkFirewallService(config.defaultAccountId)));
    enabledNames.push("Network Firewall");
  }

  // --- New services batch ---

  // Cognito Identity (JSON 1.1)
  if (isEnabled(config, "cognito-identity")) {
    jsonRouter.register("cognito-identity", new CognitoIdentityHandler(new CognitoIdentityService(config.defaultAccountId)));
    enabledNames.push("Cognito Identity");
  }

  // API Gateway v1 (REST paths)
  let apiGatewayV1Handler: ApiGatewayV1Handler | undefined;
  if (isEnabled(config, "apigateway")) {
    const apiGwV1Service = new ApiGatewayV1Service(config.defaultAccountId);
    apiGatewayV1Handler = new ApiGatewayV1Handler(apiGwV1Service);
    // API Gateway v2 already pushes "API Gateway"
  }

  // CodeCommit (JSON 1.1)
  if (isEnabled(config, "codecommit")) {
    jsonRouter.register("codecommit", new CodeCommitHandler(new CodeCommitService(config.defaultAccountId)));
    enabledNames.push("CodeCommit");
  }

  // Account (REST paths)
  let accountHandler: AccountHandler | undefined;
  if (isEnabled(config, "account")) {
    accountHandler = new AccountHandler(new AccountService());
    enabledNames.push("Account");
  }

  // Signer (REST paths)
  let signerHandler: SignerHandler | undefined;
  if (isEnabled(config, "signer")) {
    signerHandler = new SignerHandler(new SignerService(config.defaultAccountId));
    enabledNames.push("Signer");
  }

  // Service Quotas (JSON 1.1)
  if (isEnabled(config, "servicequotas")) {
    jsonRouter.register("service-quotas", new ServiceQuotasHandler(new ServiceQuotasService(config.defaultAccountId)));
    enabledNames.push("Service Quotas");
  }

  // Resource Groups (REST paths)
  let resourceGroupsHandler: ResourceGroupsHandler | undefined;
  if (isEnabled(config, "resource-groups")) {
    resourceGroupsHandler = new ResourceGroupsHandler(new ResourceGroupsService(config.defaultAccountId));
    enabledNames.push("Resource Groups");
  }

  // Resource Groups Tagging API (JSON 1.1)
  if (isEnabled(config, "tagging")) {
    jsonRouter.register("resource-groups-tagging", new ResourceGroupsTaggingHandler(new ResourceGroupsTaggingService(config.defaultAccountId)));
    enabledNames.push("Resource Groups Tagging");
  }

  // Elastic Beanstalk (Query/XML)
  if (isEnabled(config, "elasticbeanstalk")) {
    const ebHandler = new ElasticBeanstalkQueryHandler(new ElasticBeanstalkService(config.defaultAccountId));
    queryRouter.register("elasticbeanstalk", (action, params, ctx) => ebHandler.handle(action, params, ctx));
    enabledNames.push("Elastic Beanstalk");
  }

  // MediaLive (REST paths)
  let mediaLiveHandler: MediaLiveHandler | undefined;
  if (isEnabled(config, "medialive")) {
    mediaLiveHandler = new MediaLiveHandler(new MediaLiveService(config.defaultAccountId));
    enabledNames.push("MediaLive");
  }

  // MediaStore (JSON 1.1)
  if (isEnabled(config, "mediastore")) {
    jsonRouter.register("mediastore", new MediaStoreHandler(new MediaStoreService(config.defaultAccountId)));
    enabledNames.push("MediaStore");
  }

  // IVS (REST paths)
  let ivsHandler: IvsHandler | undefined;
  if (isEnabled(config, "ivs")) {
    ivsHandler = new IvsHandler(new IvsService(config.defaultAccountId));
    enabledNames.push("IVS");
  }

  // Connect (REST paths)
  let connectHandler: ConnectHandler | undefined;
  if (isEnabled(config, "connect")) {
    connectHandler = new ConnectHandler(new ConnectService(config.defaultAccountId));
    enabledNames.push("Connect");
  }

  // SES v1 (Query/XML) — reuses existing SES service
  if (isEnabled(config, "ses")) {
    const sesV1Handler = new SesV1QueryHandler(new SesService(config.defaultAccountId));
    queryRouter.register("ses", (action, params, ctx) => sesV1Handler.handle(action, params, ctx));
    queryRouter.register("email", (action, params, ctx) => sesV1Handler.handle(action, params, ctx));
  }

  // Cloud Control API (JSON 1.0)
  if (isEnabled(config, "cloudcontrol")) {
    jsonRouter.register("cloudcontrol", new CloudControlHandler(new CloudControlService(config.defaultAccountId)));
    enabledNames.push("Cloud Control");
  }

  // --- Batch 8: Niche/Specialized Services ---

  let mediaConnectHandler: MediaConnectHandler | undefined;
  if (isEnabled(config, "mediaconnect")) {
    mediaConnectHandler = new MediaConnectHandler(new MediaConnectService(config.defaultAccountId));
    enabledNames.push("MediaConnect");
  }

  let mediaPackageHandler: MediaPackageHandler | undefined;
  if (isEnabled(config, "mediapackage")) {
    mediaPackageHandler = new MediaPackageHandler(new MediaPackageService(config.defaultAccountId));
    enabledNames.push("MediaPackage");
  }

  let managedBlockchainHandler: ManagedBlockchainHandler | undefined;
  if (isEnabled(config, "managedblockchain")) {
    managedBlockchainHandler = new ManagedBlockchainHandler(new ManagedBlockchainService(config.defaultAccountId));
    enabledNames.push("Managed Blockchain");
  }

  if (isEnabled(config, "cloudhsmv2")) {
    jsonRouter.register("cloudhsmv2", new CloudHsmV2Handler(new CloudHsmV2Service(config.defaultAccountId)));
    enabledNames.push("CloudHSM v2");
  }

  if (isEnabled(config, "datapipeline")) {
    jsonRouter.register("datapipeline", new DataPipelineHandler(new DataPipelineService(config.defaultAccountId)));
    enabledNames.push("Data Pipeline");
  }

  let panoramaHandler: PanoramaHandler | undefined;
  if (isEnabled(config, "panorama")) {
    panoramaHandler = new PanoramaHandler(new PanoramaService(config.defaultAccountId));
    enabledNames.push("Panorama");
  }

  let osisHandler: OsisHandler | undefined;
  if (isEnabled(config, "osis")) {
    osisHandler = new OsisHandler(new OsisService(config.defaultAccountId));
    enabledNames.push("OSIS");
  }

  let resilienceHubHandler: ResilienceHubHandler | undefined;
  if (isEnabled(config, "resiliencehub")) {
    resilienceHubHandler = new ResilienceHubHandler(new ResilienceHubService(config.defaultAccountId));
    enabledNames.push("Resilience Hub");
  }

  let macie2Handler: Macie2Handler | undefined;
  if (isEnabled(config, "macie2")) {
    macie2Handler = new Macie2Handler(new Macie2Service(config.defaultAccountId));
    enabledNames.push("Macie2");
  }

  if (isEnabled(config, "identitystore")) {
    jsonRouter.register("identitystore", new IdentityStoreHandler(new IdentityStoreService(config.defaultAccountId)));
    enabledNames.push("Identity Store");
  }

  let bedrockAgentHandler: BedrockAgentHandler | undefined;
  if (isEnabled(config, "bedrock-agent")) {
    bedrockAgentHandler = new BedrockAgentHandler(new BedrockAgentService(config.defaultAccountId));
    enabledNames.push("Bedrock Agent");
  }

  if (isEnabled(config, "route53domains")) {
    jsonRouter.register("route53domains", new Route53DomainsHandler(new Route53DomainsService(config.defaultAccountId)));
    enabledNames.push("Route53 Domains");
  }

  let workSpacesWebHandler: WorkSpacesWebHandler | undefined;
  if (isEnabled(config, "workspaces-web")) {
    workSpacesWebHandler = new WorkSpacesWebHandler(new WorkSpacesWebService(config.defaultAccountId));
    enabledNames.push("WorkSpaces Web");
  }

  if (isEnabled(config, "meteringmarketplace")) {
    jsonRouter.register("meteringmarketplace", new MeteringMarketplaceHandler(new MeteringMarketplaceService(config.defaultAccountId)));
    enabledNames.push("Metering Marketplace");
  }

  let dsqlHandler: DsqlHandler | undefined;
  if (isEnabled(config, "dsql")) {
    dsqlHandler = new DsqlHandler(new DsqlService(config.defaultAccountId));
    enabledNames.push("DSQL");
  }

  let s3TablesHandler: S3TablesHandler | undefined;
  if (isEnabled(config, "s3tables")) {
    s3TablesHandler = new S3TablesHandler(new S3TablesService(config.defaultAccountId));
    enabledNames.push("S3 Tables");
  }

  let s3VectorsHandler: S3VectorsHandler | undefined;
  if (isEnabled(config, "s3vectors")) {
    s3VectorsHandler = new S3VectorsHandler(new S3VectorsService(config.defaultAccountId));
    enabledNames.push("S3 Vectors");
  }

  const s3Router = (globalThis as any).__tinstackS3Router as S3Router | undefined;

  const server = Bun.serve({
    port: config.port,
    development: false,

    async fetch(req: Request): Promise<Response> {
      const startTime = performance.now();
      const ctx = createContext(req, config.defaultRegion, config.defaultAccountId);
      const contentType = req.headers.get("content-type") ?? "";
      const target = req.headers.get("x-amz-target");

      try {
        // JSON 1.0 / 1.1 protocol (DynamoDB, SQS, SSM, Secrets Manager, etc.)
        if (target && (contentType.includes("amz-json") || contentType.includes("application/json"))) {
          const body = await req.json();
          const response = await jsonRouter.dispatch(target, body, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Query protocol (SQS old SDK, SNS, IAM, STS, etc.)
        if (contentType.includes("x-www-form-urlencoded")) {
          const auth = req.headers.get("authorization") ?? "";
          const isS3 = auth.includes("/s3/") || auth.includes("/s3-");
          if (!isS3) {
            const text = await req.text();
            const params = new URLSearchParams(text);
            const action = params.get("Action");
            if (action) {
              const response = queryRouter.dispatch(action, params, ctx, auth);
              logRequest(req, response, startTime);
              return response;
            }
          }
        }

        // Also check URL query params for Action (some SDKs send it there)
        const url = new URL(req.url);
        const actionParam = url.searchParams.get("Action");
        if (actionParam) {
          const response = queryRouter.dispatch(actionParam, url.searchParams, ctx, req.headers.get("authorization"));
          logRequest(req, response, startTime);
          return response;
        }

        // REST-style services (Lambda, API Gateway) — route by path prefix
        const pathname = new URL(req.url).pathname;

        if (lambdaHandler && (pathname.startsWith("/2015-03-31/functions") || pathname.startsWith("/2015-03-31/event-source-mappings") || pathname.startsWith("/2015-03-31/layers") || pathname.startsWith("/2018-10-31/layers") || pathname.startsWith("/2019-09-25/tags") || pathname.startsWith("/2020-06-30/functions"))) {
          const response = await lambdaHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (apiGatewayHandler && (pathname.startsWith("/v2/apis") || pathname.startsWith("/v2/tags"))) {
          const response = await apiGatewayHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (route53Handler && pathname.startsWith("/2013-04-01/")) {
          const response = await route53Handler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (sesHandler && pathname.startsWith("/v2/email/")) {
          const response = await sesHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (appConfigHandler && pathname.startsWith("/applications") && isServiceRequest(req, "appconfig")) {
          const response = await appConfigHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (backupHandler && (pathname.startsWith("/backup-vaults") || pathname.startsWith("/backup/plans") || pathname.startsWith("/backup-jobs") || pathname.startsWith("/restore-jobs") || (isServiceRequest(req, "backup") && (pathname.startsWith("/tags/") || pathname.startsWith("/untag/"))))) {
          const response = await backupHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Pipes tags use /tags/ path (disambiguate from scheduler)
        if (pipesHandler && pathname.startsWith("/tags/") && isServiceRequest(req, "pipes")) {
          const response = await pipesHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (schedulerHandler && (pathname.startsWith("/schedules") || pathname.startsWith("/schedule-groups") || pathname.startsWith("/tags/"))) {
          const response = await schedulerHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (cloudFrontHandler && pathname.startsWith("/2020-05-31/distribution")) {
          const response = await cloudFrontHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (appSyncHandler && pathname.startsWith("/v1/apis")) {
          const response = await appSyncHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (pathname.startsWith("/accounts/") || pathname.startsWith("/resources/")) {
          const authSvc = (/Credential=\w+\/\d{8}\/[^/]+\/([^/]+)\//.exec(req.headers.get("authorization") ?? "") ?? [])[1] ?? "";
          if (resourceGroupsHandler && authSvc === "resource-groups") {
            const response = await resourceGroupsHandler.handleRoute(req, ctx);
            logRequest(req, response, startTime);
            return response;
          }
          if (quickSightHandler) {
            const response = await quickSightHandler.handleRoute(req, ctx);
            logRequest(req, response, startTime);
            return response;
          }
        }

        const lakeFormationPaths = ["/RegisterResource", "/DeregisterResource", "/ListResources", "/GrantPermissions", "/RevokePermissions", "/ListPermissions", "/GetDataLakeSettings", "/PutDataLakeSettings", "/CreateLFTag", "/GetLFTag", "/ListLFTags", "/DeleteLFTag", "/AddLFTagsToResource", "/GetResourceLFTags", "/RemoveLFTagsFromResource"];
        if (lakeFormationHandler && lakeFormationPaths.includes(pathname)) {
          const response = await lakeFormationHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (bedrockHandler && (pathname.startsWith("/model/") || pathname === "/foundation-models")) {
          const response = await bedrockHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (efsHandler && pathname.startsWith("/2015-02-01/")) {
          const response = await efsHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (eksHandler && (pathname.startsWith("/clusters") || pathname.startsWith("/tags/"))) {
          const response = await eksHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (mediaConvertHandler && pathname.startsWith("/2017-08-29/")) {
          const response = await mediaConvertHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (pollyHandler && pathname.startsWith("/v1/voices") || pollyHandler && pathname.startsWith("/v1/speech") || pollyHandler && pathname.startsWith("/v1/lexicons") || pollyHandler && pathname.startsWith("/v1/synthesisTasks")) {
          const response = await pollyHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (pinpointHandler && pathname.startsWith("/v1/apps")) {
          const response = await pinpointHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // MQ / Kafka / Pipes / MediaConnect — disambiguate /v1/ routes by auth header service
        if (pathname.startsWith("/v1/")) {
          const authService = (/Credential=\w+\/\d{8}\/[^/]+\/([^/]+)\//.exec(req.headers.get("authorization") ?? "") ?? [])[1] ?? "";
          if (mediaConnectHandler && (authService === "mediaconnect" || pathname.startsWith("/v1/flows"))) {
            const response = await mediaConnectHandler.handleRoute(req, ctx);
            logRequest(req, response, startTime);
            return response;
          }
          if (mqHandler && (authService === "mq" || pathname.startsWith("/v1/brokers"))) {
            const response = await mqHandler.handleRoute(req, ctx);
            logRequest(req, response, startTime);
            return response;
          }
          if (kafkaHandler && (authService === "kafka" || pathname.startsWith("/v1/clusters"))) {
            const response = await kafkaHandler.handleRoute(req, ctx);
            logRequest(req, response, startTime);
            return response;
          }
          if (pipesHandler && (authService === "pipes" || pathname.startsWith("/v1/pipes"))) {
            const response = await pipesHandler.handleRoute(req, ctx);
            logRequest(req, response, startTime);
            return response;
          }
        }

        // Batch (REST /v1/...)
        if (batchHandler && pathname.startsWith("/v1/")) {
          const response = await batchHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // OpenSearch (REST /2021-01-01/opensearch/...)
        if (openSearchHandler && (pathname.startsWith("/2021-01-01/opensearch/") || pathname.startsWith("/2021-01-01/domain") || pathname.startsWith("/2021-01-01/tags"))) {
          const response = await openSearchHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }



        if (guardDutyHandler && pathname.startsWith("/detector")) {
          const response = await guardDutyHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (securityHubHandler && isServiceRequest(req, "securityhub")) {
          const response = await securityHubHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        if (inspector2Handler && isServiceRequest(req, "inspector2")) {
          const response = await inspector2Handler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // IoT Core (REST-style)
        if (iotHandler && (pathname.startsWith("/things") || pathname.startsWith("/thing-types") || pathname.startsWith("/thing-groups") || pathname.startsWith("/policies") || pathname.startsWith("/target-policies") || pathname.startsWith("/detach-policy") || pathname.startsWith("/rules") || pathname.startsWith("/certificates") || pathname.startsWith("/endpoint"))) {
          const response = await iotHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // X-Ray (REST-style POST to /TraceSegments, /TraceSummaries, etc.)
        if (xrayHandler && (pathname === "/TraceSegments" || pathname === "/TraceSummaries" || pathname === "/Traces" || pathname === "/ServiceGraph" || pathname === "/CreateGroup" || pathname === "/GetGroup" || pathname === "/Groups" || pathname === "/DeleteGroup" || pathname === "/CreateSamplingRule" || pathname === "/GetSamplingRules" || pathname === "/UpdateSamplingRule" || pathname === "/DeleteSamplingRule" || pathname === "/TagResource" || pathname === "/UntagResource" || pathname === "/ListTagsForResource")) {
          const response = await xrayHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Synthetics (REST-style /canary, /canaries)
        if (syntheticsHandler && (pathname.startsWith("/canary") || pathname.startsWith("/canaries"))) {
          const response = await syntheticsHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // RAM (REST-style)
        if (ramHandler && (pathname.startsWith("/createresourceshare") || pathname.startsWith("/getresourceshares") || pathname.startsWith("/updateresourceshare") || pathname.startsWith("/deleteresourceshare") || pathname.startsWith("/associateresourceshare") || pathname.startsWith("/disassociateresourceshare") || pathname.startsWith("/getresourceshareassociations") || pathname.startsWith("/listresources") || pathname.startsWith("/tagresource") || pathname.startsWith("/untagresource"))) {
          const response = await ramHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // DataBrew (REST /recipes, /projects, /datasets, /jobs, /profileJobs)
        // For /jobs, disambiguate from Macie2 by checking auth header
        if (dataBrewHandler) {
          const isDataBrewJobsPath = pathname.startsWith("/jobs") || pathname.startsWith("/profileJobs");
          const isDataBrewOther = pathname.startsWith("/recipes") || pathname.startsWith("/projects") || pathname.startsWith("/datasets");
          if (isDataBrewOther || (isDataBrewJobsPath && !((/Credential=\w+\/\d{8}\/[^/]+\/([^/]+)\//.exec(req.headers.get("authorization") ?? "") ?? [])[1]?.startsWith("macie")))) {
            const response = await dataBrewHandler.handleRoute(req, ctx);
            logRequest(req, response, startTime);
            return response;
          }
        }

        // AMP / Prometheus (REST /workspaces)
        if (ampHandler && pathname.startsWith("/workspaces")) {
          const response = await ampHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // App Mesh (REST /v20190125/meshes)
        if (appMeshHandler && pathname.startsWith("/v20190125/")) {
          const response = await appMeshHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // VPC Lattice (REST /servicenetworks, /services, /targetgroups)
        if (vpcLatticeHandler && (pathname.startsWith("/servicenetworks") || pathname.startsWith("/services") || pathname.startsWith("/targetgroups"))) {
          const response = await vpcLatticeHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // EMR Serverless (REST /applications)
        if (emrServerlessHandler && pathname.startsWith("/applications") && isServiceRequest(req, "emr-serverless")) {
          const response = await emrServerlessHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // EMR Containers (REST /virtualclusters)
        if (emrContainersHandler && pathname.startsWith("/virtualclusters")) {
          const response = await emrContainersHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Kinesis Video Streams (REST)
        if (kinesisVideoHandler && ["/createStream", "/describeStream", "/listStreams", "/deleteStream", "/updateStream", "/getDataEndpoint", "/tagStream", "/untagStream", "/listTagsForStream"].includes(pathname)) {
          const response = await kinesisVideoHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Glacier (REST /-/vaults)
        if (glacierHandler && pathname.startsWith("/-/vaults")) {
          const response = await glacierHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // EBS (REST /snapshots)
        if (ebsHandler && pathname.startsWith("/snapshots")) {
          const response = await ebsHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // S3 Control (REST /v20180820)
        if (s3ControlHandler && pathname.startsWith("/v20180820/")) {
          const response = await s3ControlHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // API Gateway v1 (REST /restapis)
        if (apiGatewayV1Handler && pathname.startsWith("/restapis")) {
          const response = await apiGatewayV1Handler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Signer (REST /signing-profiles, /signing-jobs)
        if (signerHandler && (pathname.startsWith("/signing-profiles") || pathname.startsWith("/signing-jobs"))) {
          const response = await signerHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Resource Groups (REST /groups, /groups-list, /get-group, /update-group, /delete-group)
        if (resourceGroupsHandler && (pathname === "/groups" || pathname === "/groups-list" || pathname === "/get-group" || pathname === "/update-group" || pathname === "/delete-group")) {
          const response = await resourceGroupsHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // MediaLive (REST /prod/channels, /prod/inputs)
        if (mediaLiveHandler && pathname.startsWith("/prod/")) {
          const response = await mediaLiveHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // IVS (REST /<operation> — POST-based)
        if (ivsHandler && (pathname === "/CreateChannel" || pathname === "/GetChannel" || pathname === "/ListChannels" || pathname === "/DeleteChannel" || pathname === "/CreateStreamKey" || pathname === "/GetStreamKey" || pathname === "/ListStreamKeys" || pathname === "/DeleteStreamKey" || pathname === "/GetStream" || pathname === "/ListStreams")) {
          const response = await ivsHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Connect (REST /instance, /users, /queues, etc.)
        if (connectHandler && (pathname.startsWith("/instance") || pathname.startsWith("/users") || pathname.startsWith("/queues") || pathname.startsWith("/users-summary") || pathname.startsWith("/queues-summary"))) {
          const authSvc = (/Credential=\w+\/\d{8}\/[^/]+\/([^/]+)\//.exec(req.headers.get("authorization") ?? "") ?? [])[1] ?? "";
          if (authSvc === "connect") {
            const response = await connectHandler.handleRoute(req, ctx);
            logRequest(req, response, startTime);
            return response;
          }
        }

        // Account (REST /getContactInformation, /putContactInformation, etc.)
        if (accountHandler && (pathname.startsWith("/getContactInformation") || pathname.startsWith("/putContactInformation") || pathname.startsWith("/getAlternateContact") || pathname.startsWith("/putAlternateContact") || pathname.startsWith("/deleteAlternateContact"))) {
          const response = await accountHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // MediaPackage (REST /channels, /origin_endpoints)
        if (mediaPackageHandler && (pathname.startsWith("/channels") || pathname.startsWith("/origin_endpoints"))) {
          const response = await mediaPackageHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Managed Blockchain (REST /networks)
        if (managedBlockchainHandler && pathname.startsWith("/networks")) {
          const response = await managedBlockchainHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Panorama (REST /devices, /packages, /applicationInstances)
        if (panoramaHandler && (pathname.startsWith("/devices") || pathname.startsWith("/packages") || pathname.startsWith("/applicationInstances"))) {
          const response = await panoramaHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // OSIS (REST /2022-01-01/osis/...)
        if (osisHandler && pathname.startsWith("/2022-01-01/osis/")) {
          const response = await osisHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Resilience Hub (REST POST /create-app, /describe-app, etc.)
        if (resilienceHubHandler && (pathname.startsWith("/create-app") || pathname.startsWith("/describe-app") || pathname.startsWith("/list-app") || pathname.startsWith("/delete-app") || pathname.startsWith("/create-resiliency") || pathname.startsWith("/describe-resiliency") || pathname.startsWith("/list-resiliency") || pathname.startsWith("/delete-resiliency") || pathname.startsWith("/import-resources") || pathname.startsWith("/start-app-assessment") || pathname.startsWith("/describe-app-assessment"))) {
          const response = await resilienceHubHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // Macie2 (REST /macie, /jobs, /findingsfilters) — disambiguate /jobs by auth header
        if (macie2Handler) {
          const authMacie = (/Credential=\w+\/\d{8}\/[^/]+\/([^/]+)\//.exec(req.headers.get("authorization") ?? "") ?? [])[1] ?? "";
          if (pathname.startsWith("/macie") || pathname.startsWith("/findingsfilters") || (authMacie === "macie2" && pathname.startsWith("/jobs"))) {
            const response = await macie2Handler.handleRoute(req, ctx);
            logRequest(req, response, startTime);
            return response;
          }
        }

        // Bedrock Agent (REST /agents, /knowledgebases)
        if (bedrockAgentHandler && (pathname.startsWith("/agents") || pathname.startsWith("/knowledgebases"))) {
          const response = await bedrockAgentHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // WorkSpaces Web (REST /portals, /browserSettings, /networkSettings, /userSettings)
        if (workSpacesWebHandler && (pathname.startsWith("/portals") || pathname.startsWith("/browserSettings") || pathname.startsWith("/networkSettings") || pathname.startsWith("/userSettings"))) {
          const response = await workSpacesWebHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // DSQL (REST /cluster, /clusters)
        if (dsqlHandler && (pathname.startsWith("/cluster"))) {
          const response = await dsqlHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // S3 Tables (REST /tables, /buckets, /get-table — routed by auth header containing s3tables)
        if (s3TablesHandler && (pathname.startsWith("/tables") || pathname.startsWith("/buckets") || pathname === "/get-table")) {
          const auth = req.headers.get("authorization") ?? "";
          if (auth.includes("/s3tables/")) {
            const response = await s3TablesHandler.handleRoute(req, ctx);
            logRequest(req, response, startTime);
            return response;
          }
        }

        // S3 Vectors (RPC-style /CreateVectorBucket, /GetVectorBucket, etc.)
        if (s3VectorsHandler && (pathname.startsWith("/vector-buckets") || pathname.startsWith("/CreateVectorBucket") || pathname.startsWith("/GetVectorBucket") || pathname.startsWith("/ListVectorBuckets") || pathname.startsWith("/DeleteVectorBucket") || pathname.startsWith("/CreateIndex") || pathname.startsWith("/GetIndex") || pathname.startsWith("/ListIndexes") || pathname.startsWith("/PutVectors") || pathname.startsWith("/GetVectors") || pathname.startsWith("/QueryVectors") || pathname.startsWith("/DeleteVectors"))) {
          const response = await s3VectorsHandler.handleRoute(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        // S3 (path-style and virtual-host) — fallback for everything else
        if (s3Router) {
          const response = await s3Router.dispatch(req, ctx);
          logRequest(req, response, startTime);
          return response;
        }

        const response = jsonErrorResponse(
          new AwsError("ServiceUnavailable", "S3 service is not enabled.", 503),
          ctx.requestId,
        );
        logRequest(req, response, startTime);
        return response;
      } catch (e) {
        if (e instanceof AwsError) {
          const response = jsonErrorResponse(e, ctx.requestId);
          logRequest(req, response, startTime);
          return response;
        }
        logger.error(`Unhandled error: ${e}`);
        const response = jsonErrorResponse(
          new AwsError("InternalError", "An internal error occurred.", 500),
          ctx.requestId,
        );
        logRequest(req, response, startTime);
        return response;
      }
    },
  });

  // Store for cleanup
  (server as any).__storageFactory = storageFactory;
  (server as any).__enabledServices = enabledNames;

  return server;
}

export function getEnabledServices(server: any): string[] {
  return server.__enabledServices ?? [];
}


function isServiceRequest(req: Request, serviceName: string): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const match = /Credential=\w+\/\d{8}\/[^/]+\/([^/]+)\//.exec(auth);
  return match?.[1] === serviceName;
}

const LAKE_FORMATION_PATHS = new Set([
  "/RegisterResource", "/DeregisterResource", "/ListResources",
  "/GrantPermissions", "/RevokePermissions", "/ListPermissions",
  "/GetDataLakeSettings", "/PutDataLakeSettings",
  "/CreateLFTag", "/GetLFTag", "/ListLFTags", "/DeleteLFTag",
  "/AddLFTagsToResource", "/GetResourceLFTags", "/RemoveLFTagsFromResource",
]);

function isLakeFormationPath(pathname: string): boolean {
  return LAKE_FORMATION_PATHS.has(pathname);
}

function logRequest(req: Request, res: Response, startTime: number) {
  const duration = (performance.now() - startTime).toFixed(1);
  const target = req.headers.get("x-amz-target") ?? "";
  const url = new URL(req.url);
  const path = url.pathname;
  logger.info(`${req.method} ${target || path} → ${res.status} (${duration}ms)`);
}
