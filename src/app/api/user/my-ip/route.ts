import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimitByIp } from "@/lib/rate-limit-by-ip";
import { requireUser } from "@/lib/server-auth";

/**
 * GET /api/user/my-ip
 * Returns the client's IP as seen by the server (from x-forwarded-for, x-real-ip, etc.).
 * Use for geolocation lookup or rate limiting only. Do not log raw IPs in production.
 * Rate limited to reduce scraping/probing.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const rateLimitRes = await rateLimitByIp(request, {
    prefix: "user:my-ip",
    maxRequests: 20,
    windowMs: 60_000,
  });
  if (rateLimitRes) return rateLimitRes;

  const ip = getClientIp(request);
  return NextResponse.json({ ip: ip ?? null });
}
