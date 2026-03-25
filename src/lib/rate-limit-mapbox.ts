import { NextResponse } from "next/server";
import { checkRateLimitByIp } from "@/lib/rate-limit";

/** Max requests per window per IP for Mapbox proxy routes (directions, geocode, reverse). */
const MAX_REQUESTS = 80;
/** Window in milliseconds (e.g. 80 req/min). */
const WINDOW_MS = 60_000;

/**
 * Returns 429 NextResponse if the request should be rate limited, otherwise null (proceed).
 * Uses client IP. Uses Upstash Redis when configured, with in-memory fallback.
 */
export function checkMapboxRateLimit(request: Request): Promise<NextResponse | null> {
  return checkRateLimitByIp(request, {
    prefix: "mapbox",
    maxRequests: MAX_REQUESTS,
    windowMs: WINDOW_MS,
  });
}
