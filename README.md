<p align="center">
  <img src="logo.svg" width="180" alt="Tinstack logo" />
</p>

<h1 align="center">tinstack</h1>

<p align="center">A lightweight, zero-dependency AWS local emulator written in TypeScript and running on <a href="https://bun.sh">Bun</a>. All 158 emulated services sit behind a single HTTP endpoint (default <code>:4566</code>). Point any AWS SDK at <code>http://localhost:4566</code> and it just works.</p>

<p align="center">
  Inspired by <a href="https://github.com/hectorvent/floci">floci</a> (Java/Quarkus) — rewritten from scratch in TypeScript for contributor accessibility, Bun's batteries-included APIs, and single-binary distribution.
</p>

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

## Supported Services (158)

### Core

| Service | Key Operations |
|---|---|
| **S3** | Full object lifecycle, multipart upload, presigned URLs, versioning with delete markers, lifecycle rules, encryption config, object lock/retention/legal hold, bucket policies, CORS, tagging, notifications, website hosting, public access block, logging |
| **SQS** | Standard + FIFO queues, deduplication, dead-letter queues (RedrivePolicy), batch operations, visibility timeouts, delay queues, permissions |
| **DynamoDB** | CRUD, Query, Scan, BatchWrite/Get, transactions, PartiQL (ExecuteStatement), condition/filter/update/projection expressions with nested paths (`a.b.c`, `list[0]`), GSI/LSI, TTL, backups/restore, streams, tagging |
| **SSM** | Parameter Store (CRUD, paths, versioning), Documents (CRUD, versioning), SendCommand, Maintenance Windows, tagging |
| **Secrets Manager** | CRUD, version stages, rotation (RotateSecret/CancelRotateSecret), BatchGetSecretValue, resource policies, random passwords |

### Messaging & Events

| Service | Key Operations |
|---|---|
| **SNS** | Topics, Publish/PublishBatch, subscriptions with FilterPolicy evaluation, platform applications (mobile push), endpoints, confirmation, tagging |
| **EventBridge** | PutEvents with pattern matching, rules (enable/disable), targets, event buses, archives, replays, connections, API destinations, permissions, tagging |
| **Kinesis** | Streams, PutRecord/PutRecords, shard management (split/merge), consumers, encryption, tagging |
| **Firehose** | Delivery streams, PutRecord/PutRecordBatch, encryption, tagging |

### Auth & Compute

| Service | Key Operations |
|---|---|
| **STS** | GetCallerIdentity, AssumeRole, AssumeRoleWithWebIdentity, AssumeRoleWithSAML, GetSessionToken, GetAccessKeyInfo |
| **IAM** | Roles, Users, Groups, Policies (with version management, max 5), access keys, instance profiles, inline/managed policies, role tagging |
| **KMS** | Keys, Encrypt/Decrypt, GenerateDataKey, Sign/Verify, ReEncrypt, grants, aliases, rotation, tagging |
| **Cognito** | User pools, clients, users, groups, identity providers (SAML/OIDC), domains, password policy enforcement, InitiateAuth with JWT tokens, refresh flow, MFA config |
| **Lambda** | Invoke (Docker/in-process/mock), versions, aliases, layers, permissions (resource policy), event source mappings, tagging |
| **Step Functions** | Full ASL engine (Task, Pass, Choice, Wait, Parallel, Map, Succeed, Fail), Retry with backoff, Catch, activities, task callbacks |

### Infrastructure

| Service | Key Operations |
|---|---|
| **CloudFormation** | Stacks, change sets, stack sets with instances, GetTemplateSummary, template validation |
| **CloudWatch Logs** | Log groups/streams, PutLogEvents, FilterLogEvents, metric filters, subscription filters, export tasks, resource policies, destinations |
| **CloudWatch Metrics** | PutMetricData, GetMetricData, alarms (with SetAlarmState), dashboards, insight rules, tagging |
| **DynamoDB Streams** | ListStreams, DescribeStream, GetShardIterator, GetRecords |
| **API Gateway v2** | HTTP APIs, routes, integrations, stages, authorizers, tagging |

### Networking & Containers

| Service | Key Operations |
|---|---|
| **EC2 / VPC** | VPCs, Subnets (CIDR validation + overlap detection), Security Groups, Internet Gateways, Route Tables, NAT Gateways, Elastic IPs, Instances (Run/Start/Stop/Terminate), Key Pairs, EBS Volumes, AMIs, Network Interfaces, VPC Endpoints, Instance Types, resource dependency checks |
| **ECS / Fargate** | Clusters, task definitions (revisions), services, tasks, container instances, task sets, capacity providers, tagging |
| **ELBv2** | Load balancers, target groups, listeners, rules (path/host routing), target registration/health, tagging |
| **ECR** | Repositories, images, authorization tokens, lifecycle policies, tagging |

### DNS, Email, Certificates

| Service | Key Operations |
|---|---|
| **Route 53** | Hosted zones, resource record sets (A, AAAA, CNAME, MX, TXT, NS, SOA), tagging |
| **SES v2** | Email identities, SendEmail, templates, bulk email, configuration sets, suppression list, DKIM, send quota |
| **ACM** | Certificates (request, describe, list, delete), tagging |

### Security & CDN

| Service | Key Operations |
|---|---|
| **WAFv2** | WebACLs, IP sets, rule groups, regex pattern sets, logging configuration, resource associations, tagging |
| **CloudFront** | Distributions, invalidations, origin access control |

### Config & Scheduling

| Service | Key Operations |
|---|---|
| **AppConfig** | Applications, environments, configuration profiles, hosted configuration versions, deployments |
| **EventBridge Scheduler** | Schedules, schedule groups, tagging |

### Analytics

| Service | Key Operations |
|---|---|
| **Athena** | WorkGroups, query execution with mock results, named queries, data catalogs, prepared statements |
| **Glue** | Databases, tables, partitions, crawlers, ETL jobs with runs, triggers, connections, job bookmarks |

### Database

| Service | Key Operations |
|---|---|
| **RDS** | DB instances, clusters, subnet groups, snapshots, cluster snapshots, read replicas, start/stop/reboot |

### AI/ML & Media

| Service | Key Operations |
|---|---|
| **Bedrock Runtime** | InvokeModel (Claude/Titan mock responses), ListFoundationModels |
| **Textract** | DetectDocumentText, AnalyzeDocument, async jobs |
| **MediaConvert** | Jobs, queues, presets, job templates, endpoints |

### Storage

| Service | Key Operations |
|---|---|
| **EFS** | File systems, mount targets, access points, policies, tagging |

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
    ec2             = "http://localhost:4566"
    ecs             = "http://localhost:4566"
    ecr             = "http://localhost:4566"
    elbv2           = "http://localhost:4566"
    route53         = "http://localhost:4566"
    ses             = "http://localhost:4566"
    acm             = "http://localhost:4566"
    rds             = "http://localhost:4566"
    cloudformation  = "http://localhost:4566"
    cloudfront      = "http://localhost:4566"
    wafv2           = "http://localhost:4566"
    athena          = "http://localhost:4566"
    glue            = "http://localhost:4566"
    firehose        = "http://localhost:4566"
    appconfig       = "http://localhost:4566"
    scheduler       = "http://localhost:4566"
    appsync         = "http://localhost:4566"
    efs             = "http://localhost:4566"
    mediaconvert    = "http://localhost:4566"
    bedrock         = "http://localhost:4566"
    textract        = "http://localhost:4566"
  }
}
```

All Terraform resource lifecycle operations (create, read, update, delete) are supported for the 158 emulated services, including read-back attributes, tagging, and policy stubs that Terraform requires during plan/apply/refresh cycles.

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

- Startup: **~20ms** with all 158 services
- API response: **<1ms** for in-memory operations
- 2223+ integration tests run in **~5.5s**
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

2223+ tests across 167 files covering happy paths, error paths, edge cases, cross-service integration, and end-to-end multi-service architecture tests. All tests use real AWS SDK v3 clients pointed at the emulator.

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

- **JSON 1.0/1.1** — `X-Amz-Target` header dispatches to service handlers (DynamoDB, SQS, SSM, Secrets Manager, SNS, EventBridge, Kinesis, KMS, Cognito, CloudWatch Logs/Metrics, Step Functions, ACM, ECR, ECS, Firehose, WAFv2, Athena, Glue, Textract, Bedrock)
- **Query/XML** — `Action` form param dispatches to handlers (STS, IAM, EC2, ELBv2, RDS, CloudFormation, SNS legacy, SQS legacy)
- **REST** — URL path matching for Lambda, API Gateway, Route 53, SES, AppConfig, Scheduler, CloudFront, AppSync, MediaConvert, Bedrock, EFS
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
