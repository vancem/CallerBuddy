/**
 * Lightweight logging wrapper around console methods.
 * Provides log levels (debug, info, warn, error) that can be filtered at runtime.
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

let currentLevel: LogLevel = LogLevel.Info;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

/** Namespaced logger. All messages are prefixed with [CB]. */
export const log = {
  debug(...args: unknown[]): void {
    if (currentLevel <= LogLevel.Debug) console.debug("[CB]", ...args);
  },
  info(...args: unknown[]): void {
    if (currentLevel <= LogLevel.Info) console.info("[CB]", ...args);
  },
  warn(...args: unknown[]): void {
    if (currentLevel <= LogLevel.Warn) console.warn("[CB]", ...args);
  },
  error(...args: unknown[]): void {
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
