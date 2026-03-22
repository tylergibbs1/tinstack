
# tinstack

Lightweight AWS local emulator in TypeScript + Bun. Inspired by [floci](https://github.com/hectorvent/floci).

## Commands

- `bun run start` — start the server on :4566
- `bun run dev` — start with --watch for hot reload
- `bun test` — run all tests (155 tests across 20 files)
- `bun test tests/s3.test.ts` — run a single test file
- `bun run build` — compile to standalone binary

## Architecture

Single HTTP server on port 4566. Routing by protocol:

- **JSON 1.0/1.1**: `X-Amz-Target` header → `JsonRouter` → service handler
- **Query/XML**: `Action` form param → `QueryRouter` → service handler
- **REST (S3)**: URL path → `S3Router`

Each service: `Service` (business logic + storage) → `Handler` (protocol translation).

## Enabled Services (12)

| Phase | Service | Protocol |
|---|---|---|
| 1 | S3, SQS, DynamoDB, SSM, Secrets Manager | REST XML, JSON 1.0/Query, JSON 1.0, JSON 1.1, JSON 1.1 |
| 2 | SNS, EventBridge, Kinesis | JSON 1.0/Query, JSON 1.1, JSON 1.1 |
| 3 | STS, IAM, KMS | Query XML, Query XML, JSON 1.1 |
| 4 | CloudWatch Logs | JSON 1.1 |

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
4. Add tests in `tests/{name}.test.ts`

## Testing

Tests use real AWS SDK v3 clients pointed at the local emulator. Each test file starts the server in `beforeAll` and stops in `afterAll`. The shared test config is in `tests/helpers.ts`.
