# tinstack

A lightweight, zero-dependency AWS local emulator written in TypeScript and running on [Bun](https://bun.sh). All emulated services sit behind a single HTTP endpoint (default `:4566`). Point any AWS SDK at `http://localhost:4566` and it just works.

Inspired by [floci](https://github.com/hectorvent/floci) (Java/Quarkus) — rewritten from scratch in TypeScript for contributor accessibility, Bun's batteries-included APIs, and single-binary distribution.

## Quick Start

```bash
# Run directly
bun run src/index.ts

# Or install globally
bun install -g tinstack

# Or use Docker
docker compose up
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

## Supported Services (12)

| Phase | Service | Key Operations |
|---|---|---|
| Core | **S3** | CreateBucket, PutObject, GetObject, DeleteObject, ListObjectsV2, CopyObject, HeadObject, multipart upload |
| Core | **SQS** | CreateQueue, SendMessage, ReceiveMessage, DeleteMessage, PurgeQueue, FIFO queues, batch operations |
| Core | **DynamoDB** | CreateTable, PutItem, GetItem, UpdateItem, DeleteItem, Query, Scan, BatchWrite/Get, transactions, expressions, GSI/LSI |
| Core | **SSM Parameter Store** | PutParameter, GetParameter, GetParametersByPath, DeleteParameter, versioning |
| Core | **Secrets Manager** | CreateSecret, GetSecretValue, UpdateSecret, PutSecretValue, DeleteSecret, version stages, random passwords |
| Messaging | **SNS** | CreateTopic, Publish, Subscribe, Unsubscribe, topic attributes |
| Messaging | **EventBridge** | PutEvents, PutRule, PutTargets, event buses, rule management |
| Messaging | **Kinesis** | CreateStream, PutRecord, GetRecords, shard iterators |
| Auth | **STS** | GetCallerIdentity, AssumeRole, GetSessionToken |
| Auth | **IAM** | CreateRole, CreateUser, CreatePolicy, AttachRolePolicy, role/user/policy CRUD |
| Auth | **KMS** | CreateKey, Encrypt, Decrypt, GenerateDataKey, aliases, key lifecycle |
| Infra | **CloudWatch Logs** | CreateLogGroup, CreateLogStream, PutLogEvents, GetLogEvents, FilterLogEvents |

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

- Startup: **~19ms** with all 12 services
- API response: **<1ms** for in-memory operations
- 76 integration tests run in **~270ms**
- Zero npm runtime dependencies — only Bun built-ins

## Storage Backends

- **memory** (default) — `Map`-based, fastest, data lost on restart
- **sqlite** — `bun:sqlite` with WAL mode, persists to `tinstack.sqlite`
- **hybrid** — In-memory reads with periodic SQLite write-behind, best of both

## Development

```bash
bun install           # Install dependencies
bun run dev           # Start with hot reload
bun test              # Run all tests
bun test --watch      # Run tests in watch mode
bun run build         # Compile to standalone binary
```

## Building a Standalone Binary

```bash
bun build --compile src/index.ts --outfile tinstack

# Cross-compile
bun build --compile --target=bun-linux-x64 src/index.ts --outfile tinstack-linux-x64
bun build --compile --target=bun-darwin-arm64 src/index.ts --outfile tinstack-darwin-arm64
```

The compiled binary includes Bun's runtime and all dependencies. No runtime installation needed.

## Docker

```bash
docker compose up
# or
docker build -t tinstack . && docker run -p 4566:4566 tinstack
```

## License

MIT
