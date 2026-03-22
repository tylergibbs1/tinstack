
# tinstack

Lightweight AWS local emulator in TypeScript + Bun. Inspired by [floci](https://github.com/hectorvent/floci).

## Commands

- `bun run start` — start the server on :4566
- `bun run dev` — start with --watch for hot reload
- `bun test` — run all tests (2223+ tests across 167 files)
- `bun test tests/s3.test.ts` — run a single test file
- `bun run build` — compile to standalone binary

## Architecture

Single HTTP server on port 4566. Routing by protocol:

- **JSON 1.0/1.1**: `X-Amz-Target` header → `JsonRouter` → service handler
- **Query/XML**: `Action` form param → `QueryRouter` → service handler
- **REST**: URL path → service-specific routers (S3, Lambda, API Gateway, Route 53, SES, AppConfig, Scheduler, CloudFront, AppSync, MediaConvert, Bedrock, EFS)

Each service: `Service` (business logic + storage) → `Handler` (protocol translation).

## Enabled Services (158)

| Category | Services |
|---|---|
| **Core** | S3, S3 Control, SQS, DynamoDB, SSM, Secrets Manager |
| **Messaging** | SNS, EventBridge, EventBridge Pipes, Kinesis, Firehose |
| **Auth & Compute** | STS, IAM, KMS, Cognito (IdP + Identity), Lambda, Step Functions |
| **Containers & Orchestration** | ECS/Fargate, ECR, ELBv2, ELB Classic, EKS, Auto Scaling, App Auto Scaling, Batch |
| **Networking** | EC2/VPC, Direct Connect, VPC Lattice, Network Firewall, Network Manager |
| **API** | API Gateway v1, API Gateway v2, API Gateway Management, AppSync |
| **Infrastructure** | CloudFormation, CloudWatch Logs/Metrics, DynamoDB Streams, CloudTrail, Config, Cloud Control |
| **DNS/Email/Certs** | Route 53, Route 53 Resolver, Route 53 Domains, SES v1/v2, ACM, ACM PCA |
| **Security** | WAFv2, GuardDuty, Security Hub, Inspector v2, Shield, Macie2 |
| **CDN** | CloudFront |
| **Identity** | SSO Admin, Identity Store, Cognito Identity |
| **Config & Scheduling** | AppConfig, EventBridge Scheduler |
| **CI/CD** | CodeBuild, CodePipeline, CodeDeploy, CodeCommit |
| **Analytics** | Athena, Glue, Lake Formation, Redshift, Redshift Data, EMR, EMR Serverless, EMR Containers, Kinesis Analytics, OpenSearch, OpenSearch Serverless, Elasticsearch (legacy), QuickSight |
| **Database** | RDS, RDS Data, DAX, ElastiCache, MemoryDB, Timestream Write/Query, Timestream InfluxDB, DSQL |
| **AI/ML** | Bedrock Runtime, Bedrock Agent, SageMaker, SageMaker Runtime/Metrics, Textract, Rekognition, Comprehend, Transcribe, Polly, Personalize, Forecast, Lex V2 |
| **Media** | MediaConvert, MediaLive, MediaConnect, MediaPackage, MediaPackage V2, MediaStore, MediaStore Data |
| **Storage** | EFS, FSx, Glacier, EBS, S3 Tables, S3 Vectors, Backup |
| **IoT** | IoT Core, IoT Data, Greengrass, Kinesis Video, Kinesis Video Archived Media |
| **Migration** | DMS, DataSync, Transfer Family |
| **Management** | Organizations, Budgets, Cost Explorer, Support, Service Quotas, Resource Groups, RGTA, Account |
| **Messaging & Comms** | Connect, Connect Campaigns, MQ, MSK (Kafka), Pinpoint, IVS |
| **Other** | X-Ray, Synthetics, RAM, WorkSpaces, WorkSpaces Web, Elastic Beanstalk, Data Pipeline, DataBrew, Directory Service, AMP, App Mesh, CloudHSM v2, Cloud Directory, Service Catalog, SC AppRegistry, Signer, SWF, Panorama, OSIS, Resilience Hub, Managed Blockchain, Metering Marketplace, EC2 Instance Connect, SimpleDB, Network Manager |

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

2223+ tests across 167 files using real AWS SDK v3 clients pointed at the local emulator. Each test file starts the server in `beforeAll` and stops in `afterAll`. The shared test config is in `tests/helpers.ts`. Full suite runs in ~5.5s.
