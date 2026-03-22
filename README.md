# tinstack

A lightweight, zero-dependency AWS local emulator written in TypeScript and running on [Bun](https://bun.sh). All 18 emulated services sit behind a single HTTP endpoint (default `:4566`). Point any AWS SDK at `http://localhost:4566` and it just works.

Inspired by [floci](https://github.com/hectorvent/floci) (Java/Quarkus) — rewritten from scratch in TypeScript for contributor accessibility, Bun's batteries-included APIs, and single-binary distribution.

## Quick Start

```bash
# Run directly
bun run src/index.ts

# Or use Docker
docker compose up

# Or compile to a standalone binary
bun run build && ./tinstack
```

Configure your AWS SDK:

```typescript
import { S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: "http://localhost:4566",
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
  forcePathStyle: true,
});
```

## Supported Services (18)

### Core (Phase 1)

| Service | Key Operations |
|---|---|
| **S3** | CreateBucket, PutObject, GetObject, DeleteObject, ListObjectsV2, CopyObject, HeadObject, multipart upload, presigned URLs, virtual-host routing |
| **SQS** | CreateQueue, SendMessage, ReceiveMessage, DeleteMessage, PurgeQueue, FIFO queues with deduplication, dead-letter queues, batch operations, visibility timeouts |
| **DynamoDB** | CreateTable, PutItem, GetItem, UpdateItem, DeleteItem, Query, Scan, BatchWrite/Get, transactions, condition/filter/update/projection expressions, GSI/LSI, TTL |
| **SSM Parameter Store** | PutParameter, GetParameter, GetParametersByPath, DeleteParameter, versioning, pagination |
| **Secrets Manager** | CreateSecret, GetSecretValue, UpdateSecret, PutSecretValue, DeleteSecret, version stages (AWSCURRENT/AWSPREVIOUS), random passwords |

### Messaging & Events (Phase 2)

| Service | Key Operations |
|---|---|
| **SNS** | CreateTopic, Publish, Subscribe, Unsubscribe, topic attributes, subscription filtering |
| **EventBridge** | PutEvents, PutRule, PutTargets, CreateEventBus, rule management, target management |
| **Kinesis** | CreateStream, PutRecord, PutRecords, GetShardIterator, GetRecords, shard management |

### Auth & Compute (Phase 3)

| Service | Key Operations |
|---|---|
| **STS** | GetCallerIdentity, AssumeRole, GetSessionToken |
| **IAM** | CreateRole, CreateUser, CreatePolicy, AttachRolePolicy, inline policies, access keys, instance profiles, tagging |
| **KMS** | CreateKey, Encrypt, Decrypt, GenerateDataKey, CreateAlias, key enable/disable/schedule deletion |
| **Cognito** | CreateUserPool, CreateUserPoolClient, SignUp, ConfirmSignUp, AdminCreateUser, InitiateAuth (USER_PASSWORD_AUTH), JWT token generation |
| **Lambda** | CreateFunction, Invoke (Docker / in-process / mock), UpdateFunctionCode, UpdateFunctionConfiguration, event source mappings, tagging |

### Infrastructure (Phase 4)

| Service | Key Operations |
|---|---|
| **CloudWatch Logs** | CreateLogGroup, CreateLogStream, PutLogEvents, GetLogEvents, FilterLogEvents, retention policies |
| **CloudWatch Metrics** | PutMetricData, GetMetricData, GetMetricStatistics, ListMetrics, PutMetricAlarm, DescribeAlarms |
| **DynamoDB Streams** | ListStreams, DescribeStream, GetShardIterator, GetRecords (INSERT/MODIFY/REMOVE events) |
| **API Gateway v2** | CreateApi (HTTP API), routes, integrations (AWS_PROXY, HTTP_PROXY), stages |
| **Step Functions** | CreateStateMachine, StartExecution, full ASL engine — Task, Pass, Wait, Choice (And/Or/Not), Parallel, Map, Succeed, Fail, Retry with backoff, Catch error handling |

## Terraform Support

tinstack works as a drop-in replacement for LocalStack with Terraform. Configure the AWS provider to point all endpoints at `http://localhost:4566`:

```hcl
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    s3              = "http://localhost:4566"
    dynamodb        = "http://localhost:4566"
    sqs             = "http://localhost:4566"
    sns             = "http://localhost:4566"
    ssm             = "http://localhost:4566"
    secretsmanager  = "http://localhost:4566"
    iam             = "http://localhost:4566"
    sts             = "http://localhost:4566"
    kms             = "http://localhost:4566"
    kinesis         = "http://localhost:4566"
    lambda          = "http://localhost:4566"
    cloudwatchlogs  = "http://localhost:4566"
    eventbridge     = "http://localhost:4566"
    sfn             = "http://localhost:4566"
    cloudwatch      = "http://localhost:4566"
    apigatewayv2    = "http://localhost:4566"
    cognitoidp      = "http://localhost:4566"
  }
}
```

All Terraform resource lifecycle operations (create, read, update, delete) are supported for the 18 emulated services, including read-back attributes, tagging, and policy stubs that Terraform requires during plan/apply/refresh cycles.

## Configuration

All configuration via environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4566` | HTTP listen port |
| `TINSTACK_DEFAULT_REGION` | `us-east-1` | Fallback region |
| `TINSTACK_DEFAULT_ACCOUNT_ID` | `000000000000` | Fallback account ID |
| `TINSTACK_STORAGE_MODE` | `memory` | `memory`, `sqlite`, `hybrid` |
| `TINSTACK_STORAGE_PATH` | `./data` | Data directory for persistent modes |
| `TINSTACK_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `TINSTACK_ENABLED_SERVICES` | `*` | Comma-separated list, or `*` for all |

## Performance

- Startup: **~19ms** with all 18 services
- API response: **<1ms** for in-memory operations
- 155 integration tests run in **~1.7s**
- Zero npm runtime dependencies — only Bun built-ins

## Storage Backends

- **memory** (default) — `Map`-based, fastest, data lost on restart
- **sqlite** — `bun:sqlite` with WAL mode, persists to `tinstack.sqlite`
- **hybrid** — In-memory reads with periodic SQLite write-behind, best of both

## Lambda Invocation Modes

Lambda supports three invocation modes, tried in order:

1. **Docker** — Uses official AWS Lambda runtime images (`public.ecr.aws/lambda/nodejs:20`, etc.) for real execution. Requires Docker.
2. **In-process** — Imports and runs JS/TS handlers directly in Bun. Fast, no Docker needed.
3. **Mock** — Returns a stub response when no valid code ZIP is available.

## Testing

155 tests across 20 files covering happy paths, error paths, edge cases, and end-to-end multi-service architecture tests. All tests use real AWS SDK v3 clients pointed at the emulator.

```bash
bun install           # Install dependencies
bun test              # Run all tests
bun test --watch      # Run tests in watch mode
bun run dev           # Start with hot reload

# Run tests against an external server (e.g. Docker)
TINSTACK_TEST_PORT=4567 bun test
```

## Building a Standalone Binary

```bash
bun build --compile src/index.ts --outfile tinstack

# Cross-compile
bun build --compile --target=bun-linux-x64 src/index.ts --outfile tinstack-linux-x64
bun build --compile --target=bun-linux-arm64 src/index.ts --outfile tinstack-linux-arm64
bun build --compile --target=bun-darwin-arm64 src/index.ts --outfile tinstack-darwin-arm64
bun build --compile --target=bun-windows-x64 src/index.ts --outfile tinstack-windows-x64.exe
```

The compiled binary includes Bun's runtime and all dependencies. No runtime installation needed.

## Docker

```bash
docker compose up
# or
docker build -t tinstack . && docker run -p 4566:4566 tinstack
```

## Architecture

Single `Bun.serve()` HTTP server routing by AWS protocol:

- **JSON 1.0/1.1** — `X-Amz-Target` header dispatches to service handlers (DynamoDB, SQS, SSM, Secrets Manager, SNS, EventBridge, Kinesis, KMS, Cognito, CloudWatch, Step Functions)
- **Query/XML** — `Action` form param dispatches to handlers (STS, IAM, SNS legacy, SQS legacy)
- **REST** — URL path matching for Lambda (`/2015-03-31/functions/...`) and API Gateway (`/v2/apis/...`)
- **S3** — Fallback handler supporting both path-style and virtual-host routing

Each service follows a consistent pattern: **Service** (business logic + storage) → **Handler** (protocol translation).

## Contributing

```bash
# Adding a new service:
mkdir src/services/myservice
# 1. Create myservice-service.ts (business logic)
# 2. Create myservice-handler.ts (protocol handler)
# 3. Register in src/server.ts
# 4. Add target prefix in src/core/router.ts (for JSON protocol)
# 5. Write tests in tests/myservice.test.ts
```

## License

MIT
