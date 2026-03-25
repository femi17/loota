/**
 * Environment variable validation at startup.
 * Run from instrumentation (Node.js runtime) to fail fast with a clear message.
 */

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const OPTIONAL = [
  "PAYSTACK_SECRET_KEY",
  "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_MAPBOX_TOKEN",
  "OPENAI_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

function isSet(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates required env vars and throws with a clear message if any are missing.
 * Optional vars are not enforced; use for documentation / startup logs if needed.
 */
export async function validateEnv(): Promise<void> {
  const missing: string[] = [];

  for (const key of REQUIRED) {
    if (!isSet(process.env[key])) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const message = [
      "Missing required environment variables:",
      missing.join(", "),
      "",
      "Set them in .env.local (see ENV_SETUP.md).",
      "Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    ].join("\n");
    throw new Error(message);
  }

  // Optional: log when critical optional vars are missing (no throw)
  const optionalMissing = OPTIONAL.filter((key) => !isSet(process.env[key]));
  if (optionalMissing.length > 0) {
    try {
      const { logger } = await import("./logger");
      logger.warn("env", "Optional env not set (some features may be disabled)", {
        keys: optionalMissing,
      });
    } catch {
      // logger may not be available in all bootstrap contexts
    }
  }
}
