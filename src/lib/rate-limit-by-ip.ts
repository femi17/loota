import { NextResponse } from "next/server";
import { checkRateLimitByIp } from "@/lib/rate-limit";

/**
 * Returns 429 NextResponse if over limit, otherwise null. Uses client IP.
 * Uses Upstash Redis when configured, with automatic in-memory fallback.
 */
export function rateLimitByIp(
  request: Request,
  options: { prefix: string; maxRequests: number; windowMs: number }
): Promise<NextResponse | null> {
  return checkRateLimitByIp(request, options);
}
