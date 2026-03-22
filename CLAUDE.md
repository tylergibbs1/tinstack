
# tinstack

Lightweight AWS local emulator in TypeScript + Bun. Inspired by [floci](https://github.com/hectorvent/floci).

## Commands

- `bun run start` — start the server on :4566
- `bun run dev` — start with --watch for hot reload
- `bun test` — run all tests (1064+ tests across 45 files)
- `bun test tests/s3.test.ts` — run a single test file
- `bun run build` — compile to standalone binary

## Architecture

Single HTTP server on port 4566. Routing by protocol:

- **JSON 1.0/1.1**: `X-Amz-Target` header → `JsonRouter` → service handler
- **Query/XML**: `Action` form param → `QueryRouter` → service handler
- **REST**: URL path → service-specific routers (S3, Lambda, API Gateway, Route 53, SES, AppConfig, Scheduler, CloudFront, AppSync, MediaConvert, Bedrock, EFS)

Each service: `Service` (business logic + storage) → `Handler` (protocol translation).

## Enabled Services (38)

| Category | Services |
|---|---|
| **Core** | S3, SQS, DynamoDB, SSM, Secrets Manager |
| **Messaging** | SNS, EventBridge, Kinesis, Firehose |
| **Auth & Compute** | STS, IAM, KMS, Cognito, Lambda, Step Functions |
| **Containers** | ECS/Fargate, ECR, ELBv2 |
| **Networking** | EC2/VPC (instances, volumes, AMIs, ENIs, VPC endpoints) |
| **API** | API Gateway v2, AppSync |
| **Infrastructure** | CloudFormation, CloudWatch Logs, CloudWatch Metrics, DynamoDB Streams |
| **DNS/Email/Certs** | Route 53, SES v2, ACM |
| **Security** | WAFv2 |
| **CDN** | CloudFront |
| **Config** | AppConfig, EventBridge Scheduler |
| **Analytics** | Athena, Glue |
| **Database** | RDS |
| **Media** | MediaConvert |
| **AI/ML** | Bedrock Runtime, Textract |
| **Storage** | EFS |

## Storage Backends

- `InMemoryStorage` — default, fastest, volatile
- `SQLiteStorage` — persistent via `bun:sqlite` with WAL mode
- `HybridStorage` — in-memory reads + periodic SQLite flush
- `StorageFactory` — creates backends based on `TINSTACK_STORAGE_MODE`

## Configuration (env vars)

`PORT`, `TINSTACK_DEFAULT_REGION`, `TINSTACK_DEFAULT_ACCOUNT_ID`, `TINSTACK_STORAGE_MODE`, `TINSTACK_STORAGE_PATH`, `TINSTACK_LOG_LEVEL`, `TINSTACK_ENABLED_SERVICES`

## Adding a new service

1. Create `src/services/{name}/{name}-service.ts` (business logic)
2. Create `src/services/{name}/{name}-handler.ts` (protocol handler)
3. Register in `src/server.ts` with the appropriate router
4. Add target prefix in `src/core/router.ts` (for JSON protocol services)
5. Add tests in `tests/{name}.test.ts`

## Testing

1064+ tests across 45 files using real AWS SDK v3 clients pointed at the local emulator. Each test file starts the server in `beforeAll` and stops in `afterAll`. The shared test config is in `tests/helpers.ts`. Full suite runs in ~3.5s.
