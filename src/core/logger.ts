const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LEVELS;

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function log(level: LogLevel, msg: string, ...args: unknown[]) {
  if (LEVELS[level] >= LEVELS[currentLevel]) {
    const ts = new Date().toISOString();
    console[level](`${ts} [${level.toUpperCase()}] ${msg}`, ...args);
  }
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => log("debug", msg, ...args),
  info: (msg: string, ...args: unknown[]) => log("info", msg, ...args),
  warn: (msg: string, ...args: unknown[]) => log("warn", msg, ...args),
  error: (msg: string, ...args: unknown[]) => log("error", msg, ...args),
};
