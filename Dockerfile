FROM oven/bun:1.3.11 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY tsconfig.json ./
RUN bun build --compile --minify --bytecode \
  --target=bun \
  src/index.ts --outfile=tinstack

FROM oven/bun:1.3.11
WORKDIR /app
COPY --from=builder /app/tinstack /app/tinstack
EXPOSE 4566
CMD ["./tinstack"]
