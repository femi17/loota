/**
 * Structured server-side logger. Avoids PII; use for API routes and lib.
 * Do not pass user ids, emails, or tokens in message or meta.
 */

const PII_KEYS = new Set([
  "userId",
  "user_id",
  "email",
  "token",
  "password",
  "authorization",
  "cookie",
  "session",
  "referrer_id",
  "player_id",
  "referred_by",
]);

function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = k.toLowerCase().replace(/-/g, "_");
    if (PII_KEYS.has(key)) continue;
    if (typeof v === "object" && v !== null && "message" in v) {
      // Error-like: only include safe fields
      const e = v as Record<string, unknown>;
      out[k] = { name: e.name, code: e.code };
    } else {
      out[k] = v;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function safeErrorShape(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const rec = err as unknown as Record<string, unknown>;
    return { name: err.name, code: rec.code };
  }
  return { type: typeof err };
}

function formatEntry(
  level: string,
  context: string,
  message: string,
  meta?: Record<string, unknown>
): string {
  const sanitized = sanitizeMeta(meta);
  const payload: Record<string, unknown> = {
    level,
    context,
    message,
    ...(sanitized && { meta: sanitized }),
  };
  return JSON.stringify(payload);
}

function write(level: "error" | "warn" | "info", context: string, message: string, meta?: Record<string, unknown>): void {
  const line = formatEntry(level, context, message, meta);
  try {
    if (level === "error" && typeof process?.stderr?.write === "function") {
      process.stderr.write(line + "\n");
    } else if (level !== "error" && typeof process?.stdout?.write === "function") {
      process.stdout.write(line + "\n");
    } else {
      if (level === "error") console.error(line);
      else console.warn(line);
    }
  } catch {
    if (level === "error") console.error(line);
    else console.warn(line);
  }
}

/**
 * Optional: report errors to a service (e.g. Sentry). Set SENTRY_DSN and add
 * @sentry/nextjs, then in your Sentry init file call: logger.setCaptureFn(Sentry.captureException).
 * Until then, 500s are only logged structurally (no PII).
 */
let captureFn: ((err: unknown) => void) | null = null;
export function setCaptureFn(fn: (err: unknown) => void): void {
  captureFn = fn;
}
function captureFor500(err: unknown): void {
  try {
    captureFn?.(err);
  } catch {
    // ignore
  }
}

export const logger = {
  error(context: string, message: string, meta?: Record<string, unknown> & { err?: unknown }): void {
    const safe = meta?.err !== undefined ? { ...meta, err: safeErrorShape(meta.err) } : meta;
    write("error", context, message, safe);
    captureFor500(meta?.err);
  },
  warn(context: string, message: string, meta?: Record<string, unknown>): void {
    write("warn", context, message, meta);
  },
  info(context: string, message: string, meta?: Record<string, unknown>): void {
    write("info", context, message, meta);
  },
};
