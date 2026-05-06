/**
 * Lightweight logging wrapper around console methods.
 * Provides log levels (debug, info, warn, error) that can be filtered at runtime.
 *
 * Also maintains an in-memory ring buffer of recent log lines so they can be
 * displayed by an in-app log viewer (handy on phones where DevTools access
 * is awkward).
 *
 * See BACKLOG.md Design Decisions: "simple custom logging wrapper around console methods."
 */

export const LogLevel = {
  Debug: 0,
  Info: 1,
  Warn: 2,
  Error: 3,
  None: 4,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

// Default to Debug in dev mode so all diagnostic messages are visible.
// In production builds, Vite sets import.meta.env.DEV to false.
const isDev =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env !== "undefined" &&
  import.meta.env.DEV;

let currentLevel: LogLevel = isDev ? LogLevel.Debug : LogLevel.Info;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

// ── In-memory ring buffer for the in-app log viewer ──────────────────────
const MAX_BUFFER = 300;
const recentLogs: string[] = [];

function formatArg(a: unknown): string {
  if (a == null) return String(a);
  if (typeof a === "string") return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function pushBuffer(level: string, args: unknown[]): void {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const line = `${timestamp} ${level} ${args.map(formatArg).join(" ")}`;
  recentLogs.push(line);
  if (recentLogs.length > MAX_BUFFER) {
    recentLogs.splice(0, recentLogs.length - MAX_BUFFER);
  }
}

/** Returns a copy of the recent log buffer (oldest first). */
export function getRecentLogs(): string[] {
  return recentLogs.slice();
}

export function clearRecentLogs(): void {
  recentLogs.length = 0;
}

/** Namespaced logger. All messages are prefixed with [CB]. */
export const log = {
  debug(...args: unknown[]): void {
    pushBuffer("DBG", args);
    if (currentLevel <= LogLevel.Debug) console.debug("[CB]", ...args);
  },
  info(...args: unknown[]): void {
    pushBuffer("INF", args);
    if (currentLevel <= LogLevel.Info) console.info("[CB]", ...args);
  },
  warn(...args: unknown[]): void {
    pushBuffer("WRN", args);
    if (currentLevel <= LogLevel.Warn) console.warn("[CB]", ...args);
  },
  error(...args: unknown[]): void {
    pushBuffer("ERR", args);
    if (currentLevel <= LogLevel.Error) console.error("[CB]", ...args);
  },
};

/**
 * Runtime assertion. Throws if condition is false.
 * Use liberally for pre/post conditions per coding standards.
 */
export function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    const msg = `Assertion failed: ${message}`;
    log.error(msg);
    throw new Error(msg);
  }
}
