/**
 * Next.js instrumentation: runs once when the Node.js server starts.
 * Used to validate required env vars and fail fast with a clear message.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    await validateEnv();
  }
}
