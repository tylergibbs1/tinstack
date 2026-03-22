export interface TinstackConfig {
  port: number;
  defaultRegion: string;
  defaultAccountId: string;
  storageMode: "memory" | "sqlite" | "hybrid";
  storagePath: string;
  logLevel: "debug" | "info" | "warn" | "error";
  enabledServices: string[] | "*";
  baseUrl: string;
}

export function loadConfig(): TinstackConfig {
  const port = parseInt(process.env.PORT ?? process.env.TINSTACK_PORT ?? "4566", 10);
  return {
    port,
    defaultRegion: process.env.TINSTACK_DEFAULT_REGION ?? "us-east-1",
    defaultAccountId: process.env.TINSTACK_DEFAULT_ACCOUNT_ID ?? "000000000000",
    storageMode: (process.env.TINSTACK_STORAGE_MODE as TinstackConfig["storageMode"]) ?? "memory",
    storagePath: process.env.TINSTACK_STORAGE_PATH ?? "./data",
    logLevel: (process.env.TINSTACK_LOG_LEVEL as TinstackConfig["logLevel"]) ?? "info",
    enabledServices: process.env.TINSTACK_ENABLED_SERVICES
      ? process.env.TINSTACK_ENABLED_SERVICES === "*"
        ? "*"
        : process.env.TINSTACK_ENABLED_SERVICES.split(",").map((s) => s.trim())
      : "*",
    baseUrl: process.env.TINSTACK_BASE_URL ?? `http://localhost:${port}`,
  };
}
