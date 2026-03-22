import type { RequestContext } from "./context";
import { AwsError, jsonErrorResponse } from "./errors";
import { logger } from "./logger";

interface JsonServiceHandler {
  handle(action: string, body: any, ctx: RequestContext): Response | Promise<Response>;
}

// Maps X-Amz-Target prefix to handler
const TARGET_PREFIX_MAP: Record<string, string> = {
  DynamoDB_20120810: "dynamodb",
  AmazonSQS: "sqs",
  AmazonSSM: "ssm",
  secretsmanager: "secretsmanager",
  TrentService: "kms",
  "Logs_20140328": "cloudwatchlogs",
  AWSEvents: "eventbridge",
  "Kinesis_20131202": "kinesis",
  AWSCognitoIdentityProviderService: "cognito",
  DynamoDBStreams_20120810: "dynamodbstreams",
  "SNS_20100331": "sns",
  AWSStepFunctions: "stepfunctions",
  GraniteServiceVersion20100801: "cloudwatch",
  CertificateManager: "acm",
  AmazonEC2ContainerRegistry_V20150921: "ecr",
  Firehose_20150804: "firehose",
  AmazonEC2ContainerServiceV20141113: "ecs",
  AWSWAF_20190729: "wafv2",
  AmazonAthena: "athena",
  AWSGlue: "glue",
  Textract: "textract",
  AmazonBedrock: "bedrock",
  AWSOrganizationsV20161128: "organizations",
  CloudTrail_20131101: "cloudtrail",
  StarlingDoveService: "config",
  CodeBuild_20161006: "codebuild",
  CodePipeline_20150709: "codepipeline",
  CodeDeploy_20141006: "codedeploy",
  RekognitionService: "rekognition",
  Comprehend_20171127: "comprehend",
  Transcribe: "transcribe",
  AmazonForecast: "forecast",
  ElasticMapReduce: "emr",
  SageMaker: "sagemaker",
  AWSBudgetServiceGateway: "budgets",
  AWSInsightsIndexService: "ce",
  AWSSupport_20130415: "support",
  ACMPrivateCA: "acmpca",
  AWSShield_20160616: "shield",
  SWBExternalService: "ssoadmin",
  AmazonEKS: "eks",
  AnyScaleFrontendService: "applicationautoscaling",
  Route53AutoNaming_v20170314: "servicediscovery",
  TransferService: "transfer",
  Timestream_20181101: "timestream",
  DirectoryService_20150416: "directory-service",
  AmazonMemoryDB: "memorydb",
  KinesisAnalytics_20180523: "kinesis-analytics",
  WorkspacesService: "workspaces",
  AWSLakeFormation: "lakeformation",
  Route53Resolver: "route53resolver",
  OvertureService: "directconnect",
  NetworkFirewall_20201112: "networkfirewall",
  AmazonDMSv20160101: "dms",
  FmrsService: "datasync",
  AmazonDAXV3: "dax",
  AWSSimbaAPIService_v20180301: "fsx",
  AWSCognitoIdentityService: "cognito-identity",
  CodeCommit_20150413: "codecommit",
  ServiceQuotasV20190624: "service-quotas",
  ResourceGroupsTaggingAPI_20170126: "resource-groups-tagging",
  MediaStore_20170901: "mediastore",
  BaldrApiService: "cloudhsmv2",
  DataPipeline: "datapipeline",
  AWSIdentityStore: "identitystore",
  Route53Domains_v20140515: "route53domains",
  AWSMPMeteringService: "meteringmarketplace",
  CloudApiService: "cloudcontrol",
  AmazonPersonalize: "personalize",
  SimpleWorkflowService: "swf",
  AWS242ServiceCatalogService: "servicecatalog",
  OpenSearchServerless: "opensearch-serverless",
  RedshiftData: "redshift-data",
  AmazonTimestreamInfluxDB: "timestream-influxdb",
  AWSEC2InstanceConnectService: "ec2-instance-connect",
};

export class JsonRouter {
  private handlers = new Map<string, JsonServiceHandler>();

  register(serviceName: string, handler: JsonServiceHandler): void {
    this.handlers.set(serviceName, handler);
  }

  dispatch(target: string, body: any, ctx: RequestContext): Response | Promise<Response> {
    const dotIdx = target.indexOf(".");
    if (dotIdx === -1) {
      return jsonErrorResponse(new AwsError("UnknownOperationException", `Invalid target: ${target}`, 400), ctx.requestId);
    }

    const prefix = target.substring(0, dotIdx);
    const action = target.substring(dotIdx + 1);
    const serviceName = TARGET_PREFIX_MAP[prefix];

    if (!serviceName) {
      logger.warn(`Unknown service target prefix: ${prefix}`);
      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown service: ${prefix}`, 400), ctx.requestId);
    }

    const handler = this.handlers.get(serviceName);
    if (!handler) {
      return jsonErrorResponse(new AwsError("UnsupportedOperation", `Service ${serviceName} is not enabled.`, 400), ctx.requestId);
    }

    logger.debug(`JSON dispatch: ${serviceName}.${action}`);
    return handler.handle(action, body, ctx);
  }
}

export class QueryRouter {
  private handlers = new Map<string, (action: string, params: URLSearchParams, ctx: RequestContext) => Response>();

  register(serviceName: string, handler: (action: string, params: URLSearchParams, ctx: RequestContext) => Response): void {
    this.handlers.set(serviceName, handler);
  }

  dispatch(action: string, params: URLSearchParams, ctx: RequestContext, authorization: string | null): Response {
    // Determine service from Authorization header credential scope
    const service = this.resolveService(authorization, action);
    const handler = this.handlers.get(service);

    if (!handler) {
      logger.warn(`No query handler for service: ${service}, action: ${action}`);
      return jsonErrorResponse(new AwsError("UnsupportedOperation", `Service ${service} is not enabled for action ${action}.`, 400), ctx.requestId);
    }

    logger.debug(`Query dispatch: ${service}.${action}`);
    return handler(action, params, ctx);
  }

  private resolveService(authorization: string | null, action: string): string {
    if (authorization) {
      const match = /Credential=\w+\/\d{8}\/[^/]+\/([^/]+)\//.exec(authorization);
      if (match) return match[1];
    }

    // Fallback: guess service from action name
    const sqsActions = ["CreateQueue", "DeleteQueue", "SendMessage", "ReceiveMessage", "DeleteMessage", "GetQueueUrl", "GetQueueAttributes", "SetQueueAttributes", "ListQueues", "PurgeQueue", "ChangeMessageVisibility", "SendMessageBatch", "DeleteMessageBatch", "TagQueue", "UntagQueue", "ListQueueTags"];
    if (sqsActions.includes(action)) return "sqs";

    const snsActions = ["CreateTopic", "DeleteTopic", "Publish", "Subscribe", "Unsubscribe", "ListTopics", "ListSubscriptions", "GetTopicAttributes", "SetTopicAttributes", "ListSubscriptionsByTopic", "ListTagsForResource", "TagResource", "UntagResource", "GetSubscriptionAttributes", "SetSubscriptionAttributes", "CreatePlatformApplication", "GetPlatformApplicationAttributes", "SetPlatformApplicationAttributes", "ListPlatformApplications", "DeletePlatformApplication", "CreatePlatformEndpoint", "ListEndpointsByPlatformApplication", "DeleteEndpoint", "GetEndpointAttributes", "SetEndpointAttributes"];
    if (snsActions.includes(action)) return "sns";

    const iamActions = ["CreateRole", "CreateUser", "CreatePolicy", "GetRole", "ListRoles", "ListUsers", "DeleteRole", "GetUser", "DeleteUser", "ListPolicies", "DeletePolicy", "AttachRolePolicy", "DetachRolePolicy", "PutRolePolicy", "DeleteRolePolicy", "CreateAccessKey", "ListAccessKeys", "DeleteAccessKey", "UpdateAccessKey", "GetAccessKeyLastUsed", "ListRolePolicies", "GetPolicy", "GetPolicyVersion", "ListAttachedRolePolicies", "ListPolicyVersions", "ListInstanceProfilesForRole", "CreateGroup", "GetGroup", "ListGroups", "DeleteGroup", "AddUserToGroup", "RemoveUserFromGroup", "ListGroupsForUser", "PutGroupPolicy", "GetGroupPolicy", "ListGroupPolicies", "DeleteGroupPolicy", "CreateInstanceProfile", "GetInstanceProfile", "ListInstanceProfiles", "DeleteInstanceProfile", "AddRoleToInstanceProfile", "RemoveRoleFromInstanceProfile", "PutUserPolicy", "GetUserPolicy", "ListUserPolicies", "DeleteUserPolicy", "AttachUserPolicy", "DetachUserPolicy", "ListAttachedUserPolicies", "UpdateRole", "UpdateAssumeRolePolicy", "GetRolePolicy", "TagRole", "UntagRole", "ListRoleTags", "UpdateUser", "CreatePolicyVersion", "DeletePolicyVersion", "SetDefaultPolicyVersion"];
    if (iamActions.includes(action)) return "iam";

    const stsActions = ["GetCallerIdentity", "AssumeRole", "GetSessionToken", "AssumeRoleWithWebIdentity", "AssumeRoleWithSAML", "GetAccessKeyInfo"];
    if (stsActions.includes(action)) return "sts";

    const ec2Actions = ["CreateVpc", "DescribeVpcs", "DeleteVpc", "ModifyVpcAttribute", "CreateTags", "DescribeTags", "CreateSubnet", "DescribeSubnets", "DeleteSubnet", "ModifySubnetAttribute", "CreateSecurityGroup", "DescribeSecurityGroups", "DeleteSecurityGroup", "AuthorizeSecurityGroupIngress", "AuthorizeSecurityGroupEgress", "RevokeSecurityGroupIngress", "RevokeSecurityGroupEgress", "CreateInternetGateway", "DescribeInternetGateways", "DeleteInternetGateway", "AttachInternetGateway", "DetachInternetGateway", "CreateRouteTable", "DescribeRouteTables", "DeleteRouteTable", "CreateRoute", "DeleteRoute", "AssociateRouteTable", "DisassociateRouteTable", "CreateNatGateway", "DescribeNatGateways", "DeleteNatGateway", "AllocateAddress", "DescribeAddresses", "ReleaseAddress", "DescribeNetworkAcls", "DescribeAvailabilityZones", "DescribeRegions", "DescribeAccountAttributes", "RunInstances", "DescribeInstances", "TerminateInstances", "StartInstances", "StopInstances", "RebootInstances", "DescribeInstanceStatus", "ModifyInstanceAttribute", "CreateKeyPair", "DescribeKeyPairs", "DeleteKeyPair", "ImportKeyPair", "CreateVolume", "DescribeVolumes", "DeleteVolume", "AttachVolume", "DetachVolume", "ModifyVolume", "CreateImage", "DescribeImages", "DeregisterImage", "CopyImage", "CreateNetworkInterface", "DescribeNetworkInterfaces", "DeleteNetworkInterface", "AttachNetworkInterface", "DetachNetworkInterface", "CreateVpcEndpoint", "DescribeVpcEndpoints", "DeleteVpcEndpoints", "ModifyVpcEndpoint", "DescribeInstanceTypes"];
    if (ec2Actions.includes(action)) return "ec2";

    const elbv2Actions = ["CreateLoadBalancer", "DescribeLoadBalancers", "DeleteLoadBalancer", "DescribeLoadBalancerAttributes", "ModifyLoadBalancerAttributes", "CreateTargetGroup", "DescribeTargetGroups", "DeleteTargetGroup", "DescribeTargetGroupAttributes", "ModifyTargetGroupAttributes", "ModifyTargetGroup", "CreateListener", "DescribeListeners", "DeleteListener", "ModifyListener", "RegisterTargets", "DeregisterTargets", "DescribeTargetHealth", "CreateRule", "DescribeRules", "DeleteRule", "ModifyRule", "SetRulePriorities", "DescribeTags", "AddTags", "RemoveTags", "RegisterInstancesWithLoadBalancer", "DeregisterInstancesFromLoadBalancer", "ConfigureHealthCheck", "DescribeInstanceHealth", "CreateLoadBalancerListeners", "DeleteLoadBalancerListeners"];
    if (elbv2Actions.includes(action)) return "elasticloadbalancing";

    const autoscalingActions = ["CreateAutoScalingGroup", "DescribeAutoScalingGroups", "UpdateAutoScalingGroup", "DeleteAutoScalingGroup", "CreateLaunchConfiguration", "DescribeLaunchConfigurations", "DeleteLaunchConfiguration", "SetDesiredCapacity", "DescribeScalingActivities", "PutScalingPolicy", "DescribePolicies", "DeletePolicy", "CreateOrUpdateTags"];
    if (autoscalingActions.includes(action)) return "autoscaling";

    const elasticacheActions = ["CreateCacheCluster", "DescribeCacheClusters", "DeleteCacheCluster", "ModifyCacheCluster", "CreateReplicationGroup", "DescribeReplicationGroups", "DeleteReplicationGroup", "CreateCacheSubnetGroup", "DescribeCacheSubnetGroups", "DeleteCacheSubnetGroup", "CreateCacheParameterGroup", "DescribeCacheParameterGroups"];
    if (elasticacheActions.includes(action)) return "elasticache";

    const cfnActions = ["CreateStack", "DescribeStacks", "UpdateStack", "DeleteStack", "ListStacks", "GetTemplate", "DescribeStackResources", "DescribeStackEvents", "CreateChangeSet", "DescribeChangeSet", "ExecuteChangeSet", "ValidateTemplate", "GetTemplateSummary", "ListStackResources", "CreateStackSet", "DescribeStackSet", "ListStackSets", "DeleteStackSet", "CreateStackInstances", "ListStackInstances", "DeleteStackInstances"];
    if (cfnActions.includes(action)) return "cloudformation";

    const rdsActions = ["CreateDBInstance", "DescribeDBInstances", "ModifyDBInstance", "DeleteDBInstance", "CreateDBCluster", "DescribeDBClusters", "DeleteDBCluster", "CreateDBSubnetGroup", "DescribeDBSubnetGroups", "DeleteDBSubnetGroup", "CreateDBSnapshot", "DescribeDBSnapshots", "DeleteDBSnapshot", "DescribeDBEngineVersions", "CreateDBInstanceReadReplica", "PromoteReadReplica", "RebootDBInstance", "StartDBInstance", "StopDBInstance", "ModifyDBCluster", "CreateDBClusterSnapshot", "DescribeDBClusterSnapshots", "DeleteDBClusterSnapshot"];
    if (rdsActions.includes(action)) return "rds";

    const redshiftActions = ["CreateCluster", "DescribeClusters", "DeleteCluster", "ModifyCluster", "PauseCluster", "ResumeCluster", "CreateClusterSubnetGroup", "DescribeClusterSubnetGroups", "DeleteClusterSubnetGroup", "CreateClusterParameterGroup", "DescribeClusterParameterGroups", "CreateClusterSnapshot", "DescribeClusterSnapshots", "DeleteClusterSnapshot", "RestoreFromClusterSnapshot", "CreateTags", "DescribeTags", "DeleteTags"];
    if (redshiftActions.includes(action)) return "redshift";

    const ebActions = ["CreateApplication", "DescribeApplications", "DeleteApplication", "CreateEnvironment", "DescribeEnvironments", "TerminateEnvironment", "UpdateEnvironment", "CreateApplicationVersion", "DescribeApplicationVersions"];
    if (ebActions.includes(action)) return "elasticbeanstalk";

    const sesV1Actions = ["VerifyEmailIdentity", "ListIdentities", "GetIdentityVerificationAttributes", "SendEmail", "DeleteIdentity", "VerifyDomainIdentity", "GetSendQuota", "GetSendStatistics"];
    if (sesV1Actions.includes(action)) return "email";

    const sdbActions = ["CreateDomain", "ListDomains", "DeleteDomain", "PutAttributes", "GetAttributes", "Select"];
    if (sdbActions.includes(action)) return "sdb";

    return "unknown";
  }
}
