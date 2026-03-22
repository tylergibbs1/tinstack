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

    const snsActions = ["CreateTopic", "DeleteTopic", "Publish", "Subscribe", "Unsubscribe", "ListTopics", "ListSubscriptions", "GetTopicAttributes", "SetTopicAttributes", "ListSubscriptionsByTopic", "ListTagsForResource", "TagResource", "UntagResource", "GetSubscriptionAttributes", "SetSubscriptionAttributes"];
    if (snsActions.includes(action)) return "sns";

    const iamActions = ["CreateRole", "CreateUser", "CreatePolicy", "GetRole", "ListRoles", "ListUsers", "DeleteRole", "GetUser", "DeleteUser", "ListPolicies", "DeletePolicy", "AttachRolePolicy", "DetachRolePolicy", "PutRolePolicy", "DeleteRolePolicy", "CreateAccessKey", "ListAccessKeys", "DeleteAccessKey", "ListRolePolicies", "GetPolicy", "GetPolicyVersion", "ListAttachedRolePolicies", "ListPolicyVersions", "ListInstanceProfilesForRole"];
    if (iamActions.includes(action)) return "iam";

    const stsActions = ["GetCallerIdentity", "AssumeRole", "GetSessionToken"];
    if (stsActions.includes(action)) return "sts";

    const ec2Actions = ["CreateVpc", "DescribeVpcs", "DeleteVpc", "ModifyVpcAttribute", "CreateTags", "DescribeTags", "CreateSubnet", "DescribeSubnets", "DeleteSubnet", "ModifySubnetAttribute", "CreateSecurityGroup", "DescribeSecurityGroups", "DeleteSecurityGroup", "AuthorizeSecurityGroupIngress", "AuthorizeSecurityGroupEgress", "RevokeSecurityGroupIngress", "RevokeSecurityGroupEgress", "CreateInternetGateway", "DescribeInternetGateways", "DeleteInternetGateway", "AttachInternetGateway", "DetachInternetGateway", "CreateRouteTable", "DescribeRouteTables", "DeleteRouteTable", "CreateRoute", "DeleteRoute", "AssociateRouteTable", "DisassociateRouteTable", "CreateNatGateway", "DescribeNatGateways", "DeleteNatGateway", "AllocateAddress", "DescribeAddresses", "ReleaseAddress", "DescribeNetworkAcls", "DescribeAvailabilityZones", "DescribeRegions", "DescribeAccountAttributes"];
    if (ec2Actions.includes(action)) return "ec2";

    const elbv2Actions = ["CreateLoadBalancer", "DescribeLoadBalancers", "DeleteLoadBalancer", "DescribeLoadBalancerAttributes", "ModifyLoadBalancerAttributes", "CreateTargetGroup", "DescribeTargetGroups", "DeleteTargetGroup", "DescribeTargetGroupAttributes", "ModifyTargetGroupAttributes", "CreateListener", "DescribeListeners", "DeleteListener", "DescribeTags", "AddTags", "RemoveTags"];
    if (elbv2Actions.includes(action)) return "elasticloadbalancing";

    return "unknown";
  }
}
