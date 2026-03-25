import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { checkRateLimitByIp, getRateLimitBackendStatus } from "@/lib/rate-limit";

/**
 * GET /api/health/rate-limit
 * Admin-only endpoint to verify limiter backend and enforcement.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const rateLimitRes = await checkRateLimitByIp(request, {
    prefix: "health:rate-limit",
    maxRequests: 20,
    windowMs: 60_000,
  });
  if (rateLimitRes) return rateLimitRes;

  const status = await getRateLimitBackendStatus();
  return NextResponse.json({
    ok: true,
    ...status,
    checkedAt: new Date().toISOString(),
  });
}
