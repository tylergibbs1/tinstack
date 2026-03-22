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

// Phase 4 — Infrastructure
import { CloudWatchLogsService } from "./services/cloudwatchlogs/logs-service";
import { CloudWatchLogsHandler } from "./services/cloudwatchlogs/logs-handler";
import { CloudWatchMetricsService } from "./services/cloudwatchmetrics/metrics-service";
import { CloudWatchMetricsHandler } from "./services/cloudwatchmetrics/metrics-handler";
import { DynamoDbStreamsService } from "./services/dynamodb/streams-service";
import { DynamoDbStreamsHandler } from "./services/dynamodb/streams-handler";

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
          const response = jsonRouter.dispatch(target, body, ctx);
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

function logRequest(req: Request, res: Response, startTime: number) {
  const duration = (performance.now() - startTime).toFixed(1);
  const target = req.headers.get("x-amz-target") ?? "";
  const url = new URL(req.url);
  const path = url.pathname;
  logger.info(`${req.method} ${target || path} → ${res.status} (${duration}ms)`);
}
