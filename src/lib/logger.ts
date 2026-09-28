/**
 * Structured JSON logging to stdout. Every line is a single JSON object so
 * logs can be searched and piped to a log service in production.
 */

type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function write(level: Level, msg: string, fields: Fields = {}): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };
  for (const [key, value] of Object.entries(fields)) {
    entry[key] = value instanceof Error ? serializeError(value) : value;
  }
  process.stdout.write(JSON.stringify(entry) + "\n");
}

export const log = {
  debug: (msg: string, fields?: Fields) => write("debug", msg, fields),
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
