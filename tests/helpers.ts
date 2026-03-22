import { loadConfig } from "../src/core/config";
import { createServer } from "../src/server";
import type { Server } from "bun";

let server: Server | null = null;

export const ENDPOINT = "http://localhost:4566";
export const TEST_REGION = "us-east-1";

export const clientConfig = {
  endpoint: ENDPOINT,
  region: TEST_REGION,
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
  forcePathStyle: true,
};

export function startServer(): Server {
  if (server) return server;
  const config = loadConfig();
  config.logLevel = "error"; // quiet during tests
  server = createServer(config);
  return server;
}

export function stopServer() {
  if (server) {
    server.stop(true);
    server = null;
  }
}
