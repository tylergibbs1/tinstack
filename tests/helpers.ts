import { loadConfig } from "../src/core/config";
import { createServer } from "../src/server";
import type { Server } from "bun";

let server: Server | null = null;

const port = parseInt(process.env.TINSTACK_TEST_PORT ?? process.env.PORT ?? "4566", 10);
const externalMode = !!process.env.TINSTACK_TEST_PORT;

export const ENDPOINT = `http://localhost:${port}`;
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

export function startServer(): Server | null {
  if (externalMode) return null; // tests run against an external server
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
