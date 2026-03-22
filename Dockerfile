FROM oven/bun:1.3.11-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY tsconfig.json ./
RUN bun build --compile --minify src/index.ts --outfile tinstack

FROM gcr.io/distroless/base-debian12
COPY --from=build /app/tinstack /tinstack
EXPOSE 4566
ENTRYPOINT ["/tinstack"]
